import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { ApplyMemoryOperationsService } from '@/athlete-memory/application/apply-memory-operations.service';
import { AthleteMemoryQueryService } from '@/athlete-memory/application/athlete-memory-query.service';
import { AthleteMemoryPreferenceService } from '@/athlete-memory/application/athlete-memory-preference.service';
import {
  formatLocalDateTime,
  MemoryIsolationError,
  MemoryValidationError,
} from '@/athlete-memory/domain/memory-time';
import type { MemoryOperation } from '@/athlete-memory/domain/memory-operation';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
import { MemoryJudgeService } from './memory-judge.service';
import { getStoredCoachLegacyMessage } from '../core/coach-history-messages';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));

function sourceHash(content: string) {
  return createHash('sha256')
    .update(content.trim().replace(/\s+/g, ' '))
    .digest('hex');
}

function leaseDurationMs() {
  return Math.min(
    300_000,
    Math.max(30_000, Number(process.env.MEMORY_EXTRACTION_LEASE_MS) || 120_000),
  );
}

function judgeText(value: string, maxChars: number) {
  const text = String(value ?? '');
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}…`;
}

function memorySourceText(message: { content: string; message: unknown }) {
  const plain = String(message.content ?? '').trim();
  if (plain) return plain;
  const legacy = getStoredCoachLegacyMessage(message.message) as {
    content?: Array<{ type?: unknown; content?: unknown }>;
  } | null;
  const structured = legacy?.content
    ?.filter((block) => block?.type === 'tool_result')
    .map((block) => block.content);
  return structured?.length ? JSON.stringify(structured) : '';
}

/**
 * 异步提取 worker：领取短租约、调用 Judge、校验结果，再交给 Memory
 * 应用服务原子写入。它不直接改 Fact，因此模型失败与数据库一致性解耦。
 */
@Injectable()
export class AiCoachMemoryExtractionWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AiCoachMemoryExtractionWorker.name);
  private readonly ownerId = randomUUID();
  private timer?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly commands: ApplyMemoryOperationsService,
    private readonly queries: AthleteMemoryQueryService,
    private readonly preferences: AthleteMemoryPreferenceService,
    private readonly judge: MemoryJudgeService,
    private readonly consent: AiDataConsentService,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  onModuleInit() {
    this.unsubscribe = this.capabilities?.onChange?.(() => this.reconcile());
    this.reconcile();
  }

  private reconcile() {
    if (this.capabilities?.isEnabled('ai') === false) {
      if (this.timer) clearInterval(this.timer);
      this.timer = undefined;
      return;
    }
    if (this.timer) return;
    const configured = Number(process.env.MEMORY_EXTRACTION_POLL_MS);
    const intervalMs = Number.isFinite(configured)
      ? Math.min(30_000, Math.max(500, configured))
      : 2_000;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async processAvailableOnce() {
    if (this.capabilities?.isEnabled('ai') === false) return false;
    const job = await this.claim();
    if (!job) return false;
    await this.process(job);
    return true;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      // Drain a small bounded batch so queued work does not pay one polling
      // interval per job. Jobs are still claimed one at a time, so a slow LLM
      // call never holds leases for jobs that have not started processing.
      const configured = Number(process.env.MEMORY_EXTRACTION_BATCH_SIZE);
      const batchSize = Number.isFinite(configured)
        ? Math.min(20, Math.max(1, Math.floor(configured)))
        : 5;
      for (let index = 0; index < batchSize; index += 1) {
        if (!(await this.processAvailableOnce())) break;
      }
    } catch (error) {
      this.logger.error(
        `Memory worker tick failed error=${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async claim() {
    const now = new Date();
    const candidate = await this.prisma.aiCoachMemoryExtractionJob.findFirst({
      where: {
        OR: [
          {
            status: 'PENDING',
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
          },
          { status: 'FAILED', nextRetryAt: { lte: now } },
          { status: 'RUNNING', leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!candidate) return null;
    const leaseMs = leaseDurationMs();
    const claimed = await this.prisma.aiCoachMemoryExtractionJob.updateMany({
      where: {
        id: candidate.id,
        OR: [
          {
            status: 'PENDING',
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
          },
          { status: 'FAILED', nextRetryAt: { lte: now } },
          { status: 'RUNNING', leaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        status: 'RUNNING',
        attempts: { increment: 1 },
        leaseOwner: this.ownerId,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        startedAt: candidate.startedAt ?? now,
        lastError: null,
      },
    });
    if (claimed.count !== 1) return null;
    return this.prisma.aiCoachMemoryExtractionJob.findUnique({
      where: { id: candidate.id },
    });
  }

  private async process(
    job: NonNullable<Awaited<ReturnType<typeof this.claim>>>,
  ) {
    try {
      if (await this.completeIfIneligible(job.id, job.userId)) return;
      const message = await this.prisma.aiCoachMessage.findFirst({
        where: {
          id: job.sourceMessageId,
          userId: job.userId,
          sessionId: job.sessionId,
          role: 'USER',
        },
      });
      if (!message) {
        throw new MemoryIsolationError('Memory source message is missing');
      }
      const sourceText = memorySourceText(message);
      const timezone =
        (await this.userService.getPreferredTimezone(job.userId)) ?? 'UTC';
      const recent = await this.prisma.aiCoachMessage.findMany({
        where: {
          userId: job.userId,
          sessionId: job.sessionId,
          sequence: { lte: message.sequence },
          role: { in: ['USER', 'ASSISTANT'] },
        },
        orderBy: { sequence: 'desc' },
        take: 8,
      });
      const memoryIndex = await this.queries.findJudgeCandidates({
        userId: job.userId,
        intent: 'Reconcile the current user assertion with existing memory',
        query: sourceText.slice(0, 200),
        limit: 20,
        asOf: message.createdAt,
      });
      const baseInput = {
        sourceMessage: {
          id: message.id,
          content: judgeText(sourceText, 4_000),
          createdAt: message.createdAt.toISOString(),
        },
        conversationClock: {
          timezone,
          localDateTime: formatLocalDateTime(message.createdAt, timezone),
        },
        recentConversation: recent.reverse().map((row) => ({
          role:
            row.role === 'USER' ? ('user' as const) : ('assistant' as const),
          // Recent context exists only to resolve references such as “that
          // issue”. It is deliberately bounded and never becomes Evidence.
          content: judgeText(row.content, 1_500),
          createdAt: row.createdAt.toISOString(),
          evidenceAuthority:
            row.role === 'USER' ? ('user' as const) : ('context_only' as const),
        })),
        activeMemoryIndex: memoryIndex.items,
      };
      // Lookup and validation repair share one additional call per attempt.
      // SDK transport retries remain bounded separately by the Judge client.
      let input: Parameters<MemoryJudgeService['judge']>[0] = baseInput;
      let judged: Awaited<ReturnType<MemoryJudgeService['judge']>>;
      let operations: MemoryOperation[];
      for (let call = 1; call <= 2; call++) {
        if (call > 1) {
          // A user may revoke consent or edit/delete the source during a call.
          await this.extendLease(job.id, job.userId);
          if (await this.completeIfIneligible(job.id, job.userId)) return;
        }
        try {
          judged = await this.judge.judge(input);
          operations = this.commands.validateDecision({
            raw: judged.decision,
            assertedAt: message.createdAt,
            timezone,
          });
        } catch (error) {
          if (
            !(error instanceof MemoryValidationError) ||
            error instanceof MemoryIsolationError
          )
            throw error;
          const stage = input.validationFeedback
            ? 'repair'
            : input.lookupCandidates
              ? 'lookup'
              : 'initial';
          const issue = error.issue ?? {
            field: 'decision',
            reason: 'invalid_value' as const,
          };
          this.logger.warn(
            `Memory Judge rejected job=${job.id} model=${judged?.model ?? 'unreported'} stage=${stage} call=${call} issue=${JSON.stringify(issue)}`,
          );
          if (call === 2) throw error;
          input = { ...input, validationFeedback: issue };
          continue;
        }
        if (operations[0]?.operation !== 'NEEDS_LOOKUP') break;
        if (call === 2) {
          throw new MemoryValidationError('Memory Judge exceeded call budget', {
            field: 'operations',
            reason: 'budget_exhausted',
          });
        }
        const lookup = operations[0].lookup;
        const candidates = await this.queries.findJudgeCandidates({
          userId: job.userId,
          intent: 'Resolve an existing memory target',
          query: lookup.query,
          categories: lookup.categories,
          eventFrom: lookup.eventFrom ? new Date(lookup.eventFrom) : undefined,
          eventTo: lookup.eventTo ? new Date(lookup.eventTo) : undefined,
          limit: 20,
          asOf: message.createdAt,
        });
        input = { ...baseInput, lookupCandidates: candidates.items };
      }

      // Persist only the normalized contract, including server-owned audit codes.
      const decision = { operations };
      if (await this.completeIfIneligible(job.id, job.userId)) return;

      const names = operations
        .map((operation) => operation.operation)
        .join(',');
      this.logger.log(
        `Memory Judge completed job=${job.id} user=${job.userId} operations=${names}`,
      );
      if (operations[0]?.operation === 'IGNORE') {
        await this.completeWithoutApply(
          job.id,
          job.userId,
          decision,
          judged.model,
        );
        return;
      }
      await this.extendLease(job.id, job.userId);
      const result = await this.commands.applyOperations({
        jobId: job.id,
        leaseOwner: this.ownerId,
        userId: job.userId,
        sourceMessageId: message.id,
        sourceHash: sourceHash(sourceText),
        assertedAt: message.createdAt,
        timezone,
        model: judged.model,
        policyVersion: job.policyVersion,
        decision,
        operations,
      });
      this.logger.log(
        `Memory apply completed job=${job.id} user=${job.userId} applied=${result.applied} idempotent=${result.idempotent}`,
      );
    } catch (error) {
      await this.fail(job, error);
    }
  }

  private async completeIfIneligible(jobId: string, userId: string) {
    const reasonCode = !(await this.consent.isGranted(userId))
      ? 'CONSENT_REVOKED'
      : !(await this.preferences.get(userId)).enabled
        ? 'MEMORY_DISABLED'
        : null;
    if (!reasonCode) return false;
    await this.completeWithoutApply(jobId, userId, {
      operations: [{ operation: 'IGNORE', reasonCode }],
    });
    return true;
  }

  private async completeWithoutApply(
    jobId: string,
    userId: string,
    decision: unknown,
    model?: string,
  ) {
    const updated = await this.prisma.aiCoachMemoryExtractionJob.updateMany({
      where: {
        id: jobId,
        userId,
        status: 'RUNNING',
        leaseOwner: this.ownerId,
      },
      data: {
        status: 'SUCCEEDED',
        decisionJson: json(decision),
        model,
        finishedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        nextRetryAt: null,
      },
    });
    if (updated.count !== 1) throw new Error('Memory job lease was lost');
  }

  private async extendLease(jobId: string, userId: string) {
    const updated = await this.prisma.aiCoachMemoryExtractionJob.updateMany({
      where: {
        id: jobId,
        userId,
        status: 'RUNNING',
        leaseOwner: this.ownerId,
      },
      data: { leaseExpiresAt: new Date(Date.now() + leaseDurationMs()) },
    });
    if (updated.count !== 1) throw new Error('Memory job lease was lost');
  }

  private async fail(
    job: NonNullable<Awaited<ReturnType<typeof this.claim>>>,
    error: unknown,
  ) {
    const maxAttempts = Math.min(
      10,
      Math.max(1, Number(process.env.MEMORY_EXTRACTION_MAX_ATTEMPTS) || 5),
    );
    // Tenant/ownership failures cannot heal on retry and must not repeatedly
    // probe another user's identifiers. Model/network/validation failures keep
    // the normal bounded backoff path.
    const permanent = error instanceof MemoryIsolationError;
    const dead = permanent || job.attempts >= maxAttempts;
    const backoffMs = Math.min(5 * 60_000, 2_000 * 2 ** job.attempts);
    const message =
      error instanceof MemoryValidationError && error.issue
        ? `Memory validation failed issue=${JSON.stringify(error.issue)}`
        : error instanceof Error
          ? error.message.slice(0, 2_000)
          : 'Unknown error';
    await this.prisma.aiCoachMemoryExtractionJob.updateMany({
      where: { id: job.id, status: 'RUNNING', leaseOwner: this.ownerId },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
        lastError: message,
        nextRetryAt: dead ? null : new Date(Date.now() + backoffMs),
        leaseOwner: null,
        leaseExpiresAt: null,
        ...(dead ? { finishedAt: new Date() } : {}),
      },
    });
    this.logger.warn(
      `Memory extraction failed job=${job.id} user=${job.userId} attempt=${job.attempts} dead=${dead} error=${message}`,
    );
  }
}
