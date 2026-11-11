import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { $Enums } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/api/ai/ai.service';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { RuntimeJobSupervisor } from '@/runtime-capabilities/runtime-job-supervisor.service';
import { isAiOperationBusyError } from '@/api/ai/ai-operation.error';

type ReviewJob = {
  id: string;
  activityId: number;
  userId: string;
  attempts?: number;
  maxAttempts?: number;
  lockedAt?: Date;
};

function backoffMs(attempts: number) {
  const base = 60_000;
  const max = 60 * 60_000;
  const pow = Math.min(10, Math.max(0, attempts));
  return Math.min(max, base * Math.pow(2, pow));
}

@Injectable()
export class ActivityAiReviewWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ActivityAiReviewWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private unregister: (() => void) | null = null;
  private stopping = false;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly ai: AiService,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
    private readonly jobSupervisor?: RuntimeJobSupervisor,
  ) {}

  private enabled() {
    return (
      ((this.capabilities?.isEnabled('ai') ?? true) &&
        this.configService.get<boolean>('activityAiReviewWorker.enabled')) ??
      true
    );
  }

  onModuleInit() {
    this.unregister =
      this.jobSupervisor?.register({
        id: 'ai.activity-review',
        enabled: () => this.enabled(),
        start: () => this.start(),
        stop: () => this.stop(),
      }) ?? null;
    if (!this.jobSupervisor && this.enabled()) this.start();
  }

  private start() {
    if (this.timer) return;
    const pollMs =
      this.configService.get<number>('activityAiReviewWorker.pollMs') ?? 1000;
    this.timer = setInterval(() => {
      void this.drain().catch((e) => {
        this.logger.error(
          `[活动AI复盘队列][编排] 拉取队列失败：${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      });
    }, pollMs);
    void this.drain();
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  onModuleDestroy() {
    this.stopping = true;
    this.unregister?.();
    this.unregister = null;
    this.stop();
  }

  private async claimBatch(batchSize: number) {
    const now = new Date();
    const lockTimeoutMs =
      this.configService.get<number>('activityAiReviewWorker.lockTimeoutMs') ??
      15 * 60_000;
    const staleBefore = new Date(now.getTime() - lockTimeoutMs);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        activity_id: number;
        user_id: string;
        attempts: number;
        max_attempts: number;
        locked_at: Date;
      }>
    >`
      WITH picked AS (
        SELECT id
        FROM t_activity_ai_review
        WHERE (
            status IN ('PENDING','FAILED')
            OR (
              status = 'RUNNING'
              AND locked_at IS NOT NULL
              AND locked_at <= (${staleBefore}::timestamptz AT TIME ZONE 'UTC')
            )
          )
          AND available_at <= (${now}::timestamptz AT TIME ZONE 'UTC')
        ORDER BY available_at ASC, created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE t_activity_ai_review r
      SET status='RUNNING',
          locked_at=(NOW() AT TIME ZONE 'UTC'),
          started_at=COALESCE(r.started_at, NOW() AT TIME ZONE 'UTC'),
          finished_at=NULL,
          failed_at=NULL,
          updated_at=(NOW() AT TIME ZONE 'UTC')
      FROM picked
      WHERE r.id = picked.id
      RETURNING r.id, r.activity_id, r.user_id, r.attempts, r.max_attempts, r.locked_at;
    `;

    return rows.map((r) => ({
      id: r.id,
      activityId: r.activity_id,
      userId: r.user_id,
      attempts: r.attempts,
      maxAttempts: r.max_attempts,
      lockedAt: r.locked_at,
    }));
  }

  private async readQueueSnapshot() {
    try {
      const [waiting, running] = await Promise.all([
        this.prisma.activityAiReview.count({
          where: {
            status: {
              in: [
                $Enums.ActivityAiReviewStatus.PENDING,
                $Enums.ActivityAiReviewStatus.FAILED,
              ],
            },
          },
        }),
        this.prisma.activityAiReview.count({
          where: {
            status: $Enums.ActivityAiReviewStatus.RUNNING,
          },
        }),
      ]);
      return {
        waiting,
        running,
        remaining: waiting + running,
      };
    } catch (e) {
      this.logger.warn(
        `[活动AI复盘队列][编排] 读取进度失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return null;
    }
  }

  private formatQueueSnapshot(
    snapshot: Awaited<ReturnType<typeof this.readQueueSnapshot>>,
    includesCurrent: boolean,
  ) {
    if (!snapshot) return ' 队列剩余=未知';
    return ` 队列剩余=${snapshot.remaining}（等待=${snapshot.waiting}，处理中=${snapshot.running}${
      includesCurrent ? '，含当前任务' : ''
    }）`;
  }

  private async executeJob(job: ReviewJob) {
    try {
      const reviewResult = await this.ai.processQueuedActivityAiReview(job.id);
      return {
        outcome: 'COMPLETED' as const,
        reviewResult,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Never let a late worker failure overwrite an inline success or a new lease.
      const where = {
        id: job.id,
        status: $Enums.ActivityAiReviewStatus.RUNNING,
        ...(job.lockedAt ? { lockedAt: job.lockedAt } : {}),
      };
      if (isAiOperationBusyError(e)) {
        const delay = 15_000;
        await this.prisma.activityAiReview.updateMany({
          where,
          data: {
            status: $Enums.ActivityAiReviewStatus.PENDING,
            availableAt: new Date(Date.now() + delay),
            lockedAt: null,
            failedAt: null,
            finishedAt: null,
            errorCode: null,
            errorMessage: null,
          },
        });
        return { outcome: 'DEFERRED' as const, delay };
      }
      const attempts = (job.attempts ?? 0) + 1;
      const maxAttempts =
        job.maxAttempts ??
        this.configService.get<number>('activityAiReviewWorker.maxAttempts') ??
        3;
      const terminal = attempts >= maxAttempts;
      const delay = backoffMs(attempts);
      await this.prisma.activityAiReview.updateMany({
        where,
        data: {
          status: terminal
            ? $Enums.ActivityAiReviewStatus.DEAD
            : $Enums.ActivityAiReviewStatus.FAILED,
          attempts,
          availableAt: new Date(Date.now() + delay),
          failedAt: new Date(),
          finishedAt: new Date(),
          lockedAt: null,
          errorCode: 'GENERATION_FAILED',
          errorMessage: msg.slice(0, 4000),
        },
      });
      if (terminal) {
        return {
          outcome: 'DEAD' as const,
          error: msg,
        };
      }

      return {
        outcome: 'RETRY' as const,
        attempts,
        delay,
        error: msg,
      };
    }
  }

  private async orchestrateClaimedJob(
    job: ReviewJob,
    progress: {
      sequence: number;
      batchPosition: number;
      batchTotal: number;
    },
  ) {
    const queueAtStart = await this.readQueueSnapshot();
    const startedAt = Date.now();
    this.logger.log(
      `[活动AI复盘队列][编排] 开始 本轮第=${progress.sequence} 当前批次=${progress.batchPosition}/${progress.batchTotal}${this.formatQueueSnapshot(queueAtStart, true)} 复盘ID=${job.id} 活动ID=${job.activityId} 用户ID=${job.userId}`,
    );

    const result = await this.executeJob(job);
    const elapsedMs = Date.now() - startedAt;
    const queueAfterExecution = await this.readQueueSnapshot();
    const progressText = `本轮第=${progress.sequence} 当前批次=${progress.batchPosition}/${progress.batchTotal}${this.formatQueueSnapshot(queueAfterExecution, false)}`;

    switch (result.outcome) {
      case 'DEFERRED':
        this.logger.log(
          `[活动AI复盘队列][编排] 等待执行 ${progressText} 复盘ID=${job.id} 延迟毫秒=${result.delay}`,
        );
        return;
      case 'DEAD':
        this.logger.error(
          `[活动AI复盘队列][编排] 任务进入 DEAD ${progressText} 复盘ID=${job.id} 耗时=${elapsedMs}ms 错误=${result.error}`,
        );
        return;
      case 'RETRY':
        this.logger.warn(
          `[活动AI复盘队列][编排] 任务失败待重试 ${progressText} 复盘ID=${job.id} 耗时=${elapsedMs}ms 重试次数=${result.attempts} 重试延迟毫秒=${result.delay} 错误=${result.error}`,
        );
        return;
      default:
        const resultText =
          result.reviewResult?.outcome === 'SUCCEEDED'
            ? ` 结果=SUCCEEDED 加权令牌=${result.reviewResult.weightedTokens}`
            : result.reviewResult?.outcome === 'SKIPPED'
              ? ` 结果=SKIPPED 跳过代码=${result.reviewResult.code}`
              : '';
        this.logger.log(
          `[活动AI复盘队列][编排] 完成 ${progressText} 复盘ID=${job.id} 活动ID=${job.activityId} 耗时=${elapsedMs}ms${resultText}`,
        );
    }
  }

  private async drain() {
    if (this.stopping || this.draining) return;
    this.draining = true;
    const batchSize =
      this.configService.get<number>('activityAiReviewWorker.batchSize') ?? 5;
    const concurrency =
      this.configService.get<number>('activityAiReviewWorker.concurrency') ?? 1;
    let sequence = 0;

    try {
      while (!this.stopping) {
        const batch = await this.claimBatch(batchSize);
        if (!batch.length) return;

        let idx = 0;
        const runners = Array.from(
          { length: Math.min(concurrency, batch.length) },
          async () => {
            while (idx < batch.length && !this.stopping) {
              const job = batch[idx]!;
              const batchPosition = idx + 1;
              idx += 1;
              sequence += 1;
              await this.orchestrateClaimedJob(job, {
                sequence,
                batchPosition,
                batchTotal: batch.length,
              });
            }
          },
        );
        await Promise.all(runners);
      }
    } finally {
      this.draining = false;
    }
  }
}
