import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AiCoachSessionType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  isCoachInteraction,
  type CoachActivityEvent,
  type CoachInteractionSnapshot,
  type CoachRunCommand,
  type CoachRunStatus,
} from '@shared/ai-coach-run-contract';
import {
  parseCoachQuestionReplyLikeToolResultPayload,
  safeParseAskUserQuestionData,
} from '@shared/ai-coach-schema';
import {
  buildStoredCoachUiMessageEnvelope,
  getStoredCoachLegacyMessage,
} from './core/coach-history-messages';
import type { CoachUserMessageBody } from './core/coach-query-yield';
import { CoachRunProjector } from './core/coach-run-projector';
import { stableJson } from './core/ai-common.util';
import { CoachMemoryExtractionEnqueuer } from './memory/coach-memory-extraction-enqueuer.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  COACH_ASSESSMENT_ANSWERED_EVENT,
  type CoachAssessmentAnsweredEvent,
} from './athlete-state/coach-assessment.events';

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
const hash = (value: unknown) =>
  createHash('sha256').update(stableJson(value)).digest('hex');
const LEASE_MS = 60_000;
export class CoachRunCancelledError extends Error {}

export type CoachRunHandle = {
  projector: CoachRunProjector;
  revision: number;
  userId: string;
  sessionId: string;
  operationId: string;
  previousExecutionMs: number;
};

export type BackgroundCoachRunResult = {
  resultType: string;
  result: unknown;
  usage: unknown;
  provider: string | null;
  model: string;
};

@Injectable()
export class CoachRunStore {
  private readonly logger = new Logger(CoachRunStore.name);
  private readonly ownerId = randomUUID();
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly memoryExtraction?: CoachMemoryExtractionEnqueuer,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async existingRequestBranch(
    userId: string,
    sid: string,
    command: CoachRunCommand,
  ) {
    const existing = await this.prisma.coachRunAttempt.findFirst({
      where: {
        userId,
        OR: [
          { requestId: command.requestId },
          ...(command.kind === 'answer'
            ? [{ submissionId: command.submissionId }]
            : []),
        ],
        run: { sessionId: sid },
      },
      select: { run: { select: { branchId: true } } },
    });
    return existing?.run.branchId;
  }

  async answerBranch(userId: string, sid: string, runId: string) {
    const run = await this.prisma.coachRun.findFirst({
      where: { id: runId, userId, sessionId: sid },
    });
    if (!run) throw new NotFoundException('Coach run not found');
    return run.branchId;
  }

  /** Legacy clients may read v2 cards, but cannot bypass the transactional receipt. */
  async assertLegacyInput(message: CoachUserMessageBody | null) {
    for (const block of message?.content ?? []) {
      if (block.type !== 'tool_result') continue;
      const reply = parseCoachQuestionReplyLikeToolResultPayload(block.content);
      if (!reply.ok) continue;
      if (
        await this.prisma.coachRunAttempt.findFirst({
          where: { messageId: reply.data.repliesToAssistantMessageId },
        })
      ) {
        throw new ConflictException('COACH_PROTOCOL_UPGRADE_REQUIRED');
      }
    }
  }

  /** UIMessage v1 clients can answer a durable question through the same transaction. */
  async legacyAnswerCommand(
    userId: string,
    sid: string,
    message: CoachUserMessageBody | null,
    actionId: string,
  ): Promise<CoachRunCommand | null> {
    if (!actionId) return null;
    for (const block of message?.content ?? []) {
      if (block.type !== 'tool_result') continue;
      const reply = parseCoachQuestionReplyLikeToolResultPayload(block.content);
      if (!reply.ok) continue;
      const source = await this.prisma.coachRunAttempt.findFirst({
        where: {
          messageId: reply.data.repliesToAssistantMessageId,
          userId,
          run: { sessionId: sid },
        },
      });
      if (!source) continue;
      const requestId = `legacy:${hash(actionId)}`;
      return {
        kind: 'answer',
        requestId,
        submissionId: requestId,
        runId: source.runId,
        interactionId: `${source.id}:question:${reply.data.questionToolUseId}`,
      };
    }
    return null;
  }

  async retryInput(
    userId: string,
    sid: string,
    command: Extract<CoachRunCommand, { kind: 'retry' }>,
  ) {
    const attempt = await this.prisma.coachRunAttempt.findFirst({
      where: {
        id: command.attemptId,
        runId: command.runId,
        userId,
        run: { sessionId: sid },
      },
      include: { run: true },
    });
    if (!attempt) throw new NotFoundException('Coach attempt not found');
    const message = await this.prisma.aiCoachMessage.findFirst({
      where: {
        id: attempt.inputMessageId,
        userId,
        sessionId: sid,
        role: 'USER',
      },
    });
    if (!message) throw new NotFoundException('Coach input not found');
    return {
      prompt: message.content,
      message: getStoredCoachLegacyMessage(message.message),
      branchId: attempt.run.branchId,
    };
  }

  async begin(args: {
    userId: string;
    sid: string;
    branchId: string | null;
    lang: string;
    prompt: string;
    message: CoachUserMessageBody;
    operationId: string;
    command: CoachRunCommand;
  }): Promise<{
    handle?: CoachRunHandle;
    replay?: { id: string; message: unknown; operationId: string };
  }> {
    const { userId, sid, command } = args;
    const requestHash = hash({
      sid,
      branchId: args.branchId,
      prompt: args.prompt,
      message: args.message,
      command,
    });
    const answersHash = hash(args.message);
    const findReplay = async () => {
      const existing = await this.prisma.coachRunAttempt.findFirst({
        where: {
          userId,
          OR: [
            { requestId: command.requestId },
            ...(command.kind === 'answer'
              ? [{ submissionId: command.submissionId }]
              : []),
          ],
        },
        include: { message: true, run: true },
      });
      if (!existing) return null;
      const sameAnswer =
        command.kind === 'answer' &&
        existing.submissionId === command.submissionId &&
        existing.interactionId === command.interactionId &&
        existing.runId === command.runId &&
        existing.answersHash === answersHash;
      if (
        existing.run.sessionId !== sid ||
        existing.run.branchId !== args.branchId ||
        (!sameAnswer && existing.requestHash !== requestHash)
      )
        throw new ConflictException('Coach request already used');
      return {
        replay: {
          id: existing.messageId,
          message: existing.message.message,
          operationId: existing.operationId,
        },
      };
    };
    const replay = await findReplay();
    if (replay) return replay;
    let acceptedAssessmentAnswer: CoachAssessmentAnsweredEvent | null = null;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const attemptId = randomUUID();
        const messageId = randomUUID();
        let runId: string = randomUUID();
        let previousExecutionMs = 0;
        let parentAttemptId: string | undefined;
        let receipt: CoachInteractionSnapshot | undefined;
        let inputMessageId: string = randomUUID();

        if (command.kind === 'start') {
          for (const block of args.message.content) {
            if (block.type !== 'tool_result') continue;
            const reply = parseCoachQuestionReplyLikeToolResultPayload(
              block.content,
            );
            if (!reply.ok) continue;
            const source = await tx.coachRunAttempt.findFirst({
              where: { messageId: reply.data.repliesToAssistantMessageId },
            });
            if (source)
              throw new BadRequestException(
                'A durable Coach question requires an answer command',
              );
          }
        }

        if (command.kind !== 'start') {
          const run = await tx.coachRun.findFirst({
            where: { id: command.runId, userId, sessionId: sid },
          });
          if (!run) throw new NotFoundException('Coach run not found');
          if (run.branchId !== args.branchId)
            throw new ConflictException('Coach branch changed');
          runId = run.id;
          previousExecutionMs = run.executionMs;
          if (command.kind === 'answer') {
            if (
              run.status !== 'awaiting_input' ||
              !isCoachInteraction(run.pendingInteraction) ||
              run.pendingInteraction.interactionId !== command.interactionId
            )
              throw new ConflictException(
                'Coach question is no longer pending',
              );
            const pending = run.pendingInteraction;
            const source = await tx.aiCoachMessage.findUnique({
              where: { id: pending.questionMessageId },
            });
            const body = getStoredCoachLegacyMessage(source?.message) as {
              content?: Array<{ type: string; id?: string; input?: unknown }>;
            };
            const question = safeParseAskUserQuestionData(
              body?.content?.find((p) => p.id === pending.questionToolCallId)
                ?.input,
            );
            const block = args.message.content.find(
              (p) => p.type === 'tool_result',
            );
            const parsed = parseCoachQuestionReplyLikeToolResultPayload(
              block?.type === 'tool_result' ? block.content : null,
            );
            if (
              !question ||
              !parsed.ok ||
              parsed.data.repliesToAssistantMessageId !==
                pending.questionMessageId ||
              parsed.data.questionToolUseId !== pending.questionToolCallId
            )
              throw new BadRequestException('Invalid Coach answer');
            const reply = parsed.data;
            const assessmentCaseId = question.metadata?.assessmentCaseId;
            const assessmentQuestionId =
              question.metadata?.assessmentQuestionId;
            if (assessmentCaseId && assessmentQuestionId) {
              acceptedAssessmentAnswer = {
                userId,
                caseId: assessmentCaseId,
                questionId: assessmentQuestionId,
                promptMessageId: pending.questionMessageId,
                answerMessageId: inputMessageId,
                reply:
                  reply.kind === 'coach_question_reply'
                    ? {
                        kind: reply.kind,
                        answers: reply.answers,
                        notes: reply.notes,
                        skippedQuestionIds: reply.skippedQuestionIds ?? [],
                      }
                    : { kind: reply.kind },
              };
            }
            if (reply.kind === 'coach_question_reply') {
              const known = new Set(question.questions.map((q) => q.id));
              const skipped = new Set(reply.skippedQuestionIds ?? []);
              if (
                Object.keys(reply.answers).some((id) => !known.has(id)) ||
                Object.keys(reply.notes).some((id) => !known.has(id)) ||
                [...skipped].some((id) => !known.has(id))
              )
                throw new BadRequestException('Unknown question');
              for (const q of question.questions) {
                const answer = reply.answers[q.id];
                const values = Array.isArray(answer)
                  ? answer
                  : answer
                    ? [answer]
                    : [];
                const note = reply.notes[q.id]?.trim();
                if (skipped.has(q.id)) {
                  if (values.length || note)
                    throw new BadRequestException(
                      'Skipped question cannot also have an answer',
                    );
                  continue;
                }
                if (
                  (!q.multiSelect && values.length > 1) ||
                  values.some((v) => !q.options.some((o) => o.value === v)) ||
                  (!values.length && !note)
                )
                  throw new BadRequestException('Invalid question selection');
              }
            }
            receipt = {
              ...pending,
              status:
                reply.kind === 'coach_question_skip' ? 'skipped' : 'resolved',
              revision: pending.revision + 1,
              submissionId: command.submissionId,
              ...(reply.kind === 'coach_question_reply'
                ? {
                    answers: reply.answers,
                    notes: reply.notes,
                    skippedQuestionIds: reply.skippedQuestionIds ?? [],
                  }
                : {}),
            };
            const parent = await tx.coachRunAttempt.findUnique({
              where: { messageId: pending.questionMessageId },
            });
            parentAttemptId = parent?.id;
          } else {
            const source = await tx.coachRunAttempt.findFirst({
              where: { id: command.attemptId, runId, userId },
            });
            const latest = await tx.coachRunAttempt.findFirst({
              where: { runId },
              orderBy: { startedAt: 'desc' },
            });
            if (
              !source ||
              !['failed', 'interrupted'].includes(run.status) ||
              !['failed', 'interrupted'].includes(source.status) ||
              latest?.id !== source.id ||
              source.mutationStarted ||
              (Array.isArray(source.unresolvedTools) &&
                source.unresolvedTools.length)
            ) {
              throw new ConflictException(
                'Coach attempt cannot be safely retried',
              );
            }
            parentAttemptId = source.id;
            inputMessageId = source.inputMessageId;
          }
          const claimed = await tx.coachRun.updateMany({
            where: { id: runId, revision: run.revision, activeAttemptId: null },
            data: {
              status: 'running',
              activeAttemptId: attemptId,
              endedAt: null,
              pendingInteraction: Prisma.DbNull,
              revision: { increment: 1 },
            },
          });
          if (claimed.count !== 1)
            throw new ConflictException('Coach run is already executing');
        }

        await tx.aiCoachSession.upsert({
          where: { userId_id: { userId, id: sid } },
          create: {
            userId,
            id: sid,
            lang: args.lang,
            title: args.prompt.trim().slice(0, 80) || null,
          },
          update: { lang: args.lang },
        });
        const count = command.kind === 'retry' ? 1 : 2;
        const session = await tx.aiCoachSession.update({
          where: { userId_id: { userId, id: sid } },
          data: { nextSequence: { increment: count } },
        });
        if (command.kind !== 'retry') {
          await tx.aiCoachMessage.create({
            data: {
              id: inputMessageId,
              userId,
              sessionId: sid,
              role: 'USER',
              content: args.prompt,
              sequence: session.nextSequence - count,
              message: json(
                buildStoredCoachUiMessageEnvelope({
                  role: 'user',
                  content: args.prompt,
                  message: args.message,
                }),
              ),
            },
          });
          await this.memoryExtraction?.enqueueEligibleMessage({
            tx,
            userId,
            sessionId: sid,
            sourceMessageId: inputMessageId,
            content: args.prompt,
            hasStructuredUserInput: args.message.content.length > 0,
          });
        }
        const projector = new CoachRunProjector({
          run: {
            runId,
            attemptId,
            messageId,
            revision: 0,
            status: 'running',
            startedAt: now.toISOString(),
            executionMs: previousExecutionMs,
            previousExecutionMs,
          },
          parentAttemptId,
          receipt,
        });
        projector.start();
        const envelope = projector.envelope();
        await tx.aiCoachMessage.create({
          data: {
            id: messageId,
            userId,
            sessionId: sid,
            role: 'ASSISTANT',
            content: envelope.content,
            message: json(envelope.message),
            sequence: session.nextSequence - 1,
          },
        });
        if (command.kind === 'start') {
          await tx.coachRun.create({
            data: {
              id: runId,
              userId,
              sessionId: sid,
              branchId: args.branchId,
              originMessageId: inputMessageId,
              activeAttemptId: attemptId,
              startedAt: now,
            },
          });
        }
        await tx.coachRunAttempt.create({
          data: {
            id: attemptId,
            runId,
            userId,
            requestId: command.requestId,
            requestHash,
            messageId,
            inputMessageId,
            parentAttemptId,
            trigger: command.kind,
            operationId: args.operationId,
            ownerId: this.ownerId,
            ...(command.kind === 'answer'
              ? {
                  interactionId: command.interactionId,
                  submissionId: command.submissionId,
                  answersHash,
                }
              : {}),
          },
        });
        return {
          handle: {
            projector,
            revision: 0,
            userId,
            sessionId: sid,
            operationId: args.operationId,
            previousExecutionMs,
          },
        };
      });
      if (acceptedAssessmentAnswer && this.events) {
        try {
          await this.events.emitAsync(
            COACH_ASSESSMENT_ANSWERED_EVENT,
            acceptedAssessmentAnswer,
          );
        } catch (error) {
          this.logger.warn(
            `Assessment answer follow-up failed user=${userId} error=${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return result;
    } catch (error) {
      if (
        (error as { code?: string }).code === 'P2002' ||
        error instanceof ConflictException
      ) {
        const replay = await findReplay();
        if (replay) return replay;
        if (error instanceof ConflictException) throw error;
        this.logger.warn(
          `interaction_conflict run=${command.kind === 'start' ? 'new' : command.runId} request=${command.requestId}`,
        );
        throw new ConflictException('Coach interaction already accepted');
      }
      throw error;
    }
  }

  /**
   * Start or resume a hidden server-owned Coach task.
   *
   * Background tasks deliberately use SYSTEM input messages, skip memory
   * extraction, and live in BACKGROUND sessions. The logical run is unique by
   * user/task/dedupe key; a completed run replays its validated result while a
   * failed or interrupted run creates a new immutable attempt.
   */
  async beginBackground(args: {
    userId: string;
    taskKind: string;
    lang: string;
    instructions: string;
    dedupeKey: string;
    inputHash: string;
    operationId: string;
    triggerType?: string | null;
    triggerRef?: string | null;
  }): Promise<{
    handle?: CoachRunHandle;
    replay?: {
      runId: string;
      operationId: string;
      result: BackgroundCoachRunResult;
    };
  }> {
    const userId = args.userId.trim();
    const taskKind = args.taskKind.trim();
    const dedupeKey = args.dedupeKey.trim();
    if (!userId || !taskKind || !dedupeKey || !args.inputHash.trim()) {
      throw new BadRequestException('Invalid background Coach task identity');
    }
    const sid = `background:${hash(taskKind).slice(0, 24)}`;
    await this.recoverStale(userId, sid);

    const replayFrom = (run: {
      id: string;
      status: string;
      inputHash: string | null;
      resultRef: Prisma.JsonValue | null;
      attempts: Array<{ operationId: string }>;
    }) => {
      if (run.inputHash && run.inputHash !== args.inputHash) {
        throw new ConflictException('Background Coach dedupe key changed');
      }
      if (run.status !== 'completed' || !run.resultRef) return null;
      const result = run.resultRef as unknown as BackgroundCoachRunResult;
      if (!result || typeof result !== 'object' || !result.resultType) {
        throw new ConflictException('Background Coach result is unavailable');
      }
      return {
        replay: {
          runId: run.id,
          operationId: run.attempts[0]?.operationId ?? '',
          result,
        },
      };
    };

    const findExisting = () =>
      this.prisma.coachRun.findFirst({
        where: { userId, taskKind, dedupeKey },
        include: {
          attempts: {
            orderBy: { startedAt: 'desc' as const },
            take: 1,
            select: { id: true, operationId: true },
          },
        },
      });

    const existing = await findExisting();
    const replay = existing ? replayFrom(existing) : null;
    if (replay) return replay;
    if (existing?.status === 'running') {
      throw new ConflictException('Background Coach task is already executing');
    }
    if (
      existing &&
      !['failed', 'interrupted', 'cancelled'].includes(existing.status)
    ) {
      throw new ConflictException(
        `Background Coach task cannot resume from ${existing.status}`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const attemptId = randomUUID();
        const messageId = randomUUID();
        const session = await tx.aiCoachSession.upsert({
          where: { userId_id: { userId, id: sid } },
          create: {
            userId,
            id: sid,
            type: AiCoachSessionType.BACKGROUND,
            lang: args.lang,
            title: `Background: ${taskKind}`.slice(0, 80),
          },
          update: { lang: args.lang },
        });
        if (session.type !== AiCoachSessionType.BACKGROUND) {
          throw new ConflictException(
            'Background Coach session id is reserved',
          );
        }

        const runId = existing?.id ?? randomUUID();
        let inputMessageId: string;
        let parentAttemptId: string | undefined;
        let previousExecutionMs = 0;
        let sequenceCount = 2;

        if (existing) {
          const current = await tx.coachRun.findUnique({
            where: { id: existing.id },
            include: {
              attempts: {
                orderBy: { startedAt: 'desc' },
                take: 1,
                select: { id: true, operationId: true },
              },
            },
          });
          if (!current)
            throw new ConflictException('Background Coach run changed');
          const currentReplay = replayFrom(current);
          if (currentReplay) return currentReplay;
          if (
            current.activeAttemptId ||
            !['failed', 'interrupted', 'cancelled'].includes(current.status) ||
            (current.inputHash && current.inputHash !== args.inputHash)
          ) {
            throw new ConflictException('Background Coach run changed');
          }
          const claimed = await tx.coachRun.updateMany({
            where: {
              id: current.id,
              revision: current.revision,
              activeAttemptId: null,
            },
            data: {
              status: 'running',
              activeAttemptId: attemptId,
              endedAt: null,
              resultType: null,
              resultRef: Prisma.DbNull,
              revision: { increment: 1 },
            },
          });
          if (claimed.count !== 1) {
            throw new ConflictException(
              'Background Coach run is already executing',
            );
          }
          inputMessageId = current.originMessageId;
          parentAttemptId = current.attempts[0]?.id;
          previousExecutionMs = current.executionMs;
          sequenceCount = 1;
        } else {
          inputMessageId = randomUUID();
        }

        const allocated = await tx.aiCoachSession.update({
          where: { userId_id: { userId, id: sid } },
          data: { nextSequence: { increment: sequenceCount } },
        });
        if (!existing) {
          await tx.aiCoachMessage.create({
            data: {
              id: inputMessageId,
              userId,
              sessionId: sid,
              role: 'SYSTEM',
              content: args.instructions,
              sequence: allocated.nextSequence - sequenceCount,
              message: json({
                id: inputMessageId,
                role: 'system',
                parts: [{ type: 'text', text: args.instructions }],
                metadata: { background: true, taskKind },
              }),
            },
          });
        }

        const projector = new CoachRunProjector({
          run: {
            runId,
            attemptId,
            messageId,
            revision: 0,
            status: 'running',
            startedAt: now.toISOString(),
            executionMs: previousExecutionMs,
            previousExecutionMs,
          },
          parentAttemptId,
        });
        projector.start();
        const envelope = projector.envelope();
        await tx.aiCoachMessage.create({
          data: {
            id: messageId,
            userId,
            sessionId: sid,
            role: 'ASSISTANT',
            content: envelope.content,
            message: json(envelope.message),
            sequence: allocated.nextSequence - 1,
          },
        });

        if (!existing) {
          await tx.coachRun.create({
            data: {
              id: runId,
              userId,
              sessionId: sid,
              originMessageId: inputMessageId,
              taskKind,
              triggerType: args.triggerType?.trim() || null,
              triggerRef: args.triggerRef?.trim() || null,
              dedupeKey,
              inputHash: args.inputHash,
              activeAttemptId: attemptId,
              startedAt: now,
            },
          });
        }
        await tx.coachRunAttempt.create({
          data: {
            id: attemptId,
            runId,
            userId,
            requestId: `background:${taskKind}:${attemptId}`,
            requestHash: args.inputHash,
            messageId,
            inputMessageId,
            parentAttemptId,
            trigger: existing ? 'retry' : 'start',
            operationId: args.operationId,
            ownerId: this.ownerId,
          },
        });
        return {
          handle: {
            projector,
            revision: 0,
            userId,
            sessionId: sid,
            operationId: args.operationId,
            previousExecutionMs,
          },
        };
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const raced = await findExisting();
        const racedReplay = raced ? replayFrom(raced) : null;
        if (racedReplay) return racedReplay;
        throw new ConflictException(
          'Background Coach task is already executing',
        );
      }
      throw error;
    }
  }

  async checkpoint(
    handle: CoachRunHandle,
    terminal?: CoachRunStatus,
    legacyMessage?: unknown,
    runResult?: { resultType: string; resultRef: unknown },
  ) {
    const p = handle.projector;
    const envelope = p.envelope(legacyMessage);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.coachRunAttempt.updateMany({
        where: {
          id: p.run.attemptId,
          userId: handle.userId,
          ownerId: this.ownerId,
          revision: handle.revision,
          status: 'running',
          ...(['completed', 'awaiting_input'].includes(terminal)
            ? { cancelRequestedAt: null }
            : {}),
        },
        data: {
          revision: { increment: 1 },
          heartbeatAt: new Date(),
          mutationStarted: p.mutationStarted,
          unresolvedTools: json([...p.unresolvedTools]),
          ...(terminal
            ? {
                status: terminal === 'awaiting_input' ? 'completed' : terminal,
                completionReason: terminal,
                endedAt: new Date(p.run.endedAt),
              }
            : {}),
        },
      });
      if (updated.count !== 1) {
        const current = await tx.coachRunAttempt.findUnique({
          where: { id: p.run.attemptId },
        });
        if (current?.status === 'running' && current.cancelRequestedAt)
          throw new CoachRunCancelledError('user_cancelled');
        throw new ConflictException('Coach execution ownership changed');
      }
      await tx.aiCoachMessage.update({
        where: { id: p.message.id },
        data: { content: envelope.content, message: json(envelope.message) },
      });
      if (terminal) {
        const run = await tx.coachRun.updateMany({
          where: { id: p.run.runId, activeAttemptId: p.run.attemptId },
          data: {
            status: terminal,
            activeAttemptId: null,
            revision: { increment: 1 },
            executionMs: p.run.executionMs,
            endedAt:
              terminal === 'awaiting_input' ? null : new Date(p.run.endedAt),
            pendingInteraction:
              terminal === 'awaiting_input' && p.pendingInteraction
                ? json(p.pendingInteraction)
                : Prisma.DbNull,
            ...(runResult
              ? {
                  resultType: runResult.resultType,
                  resultRef: json(runResult.resultRef),
                }
              : {}),
          },
        });
        if (run.count !== 1)
          throw new ConflictException('Coach active attempt changed');
      }
    });
    handle.revision += 1;
    if (terminal)
      this.logger.log(
        `run_terminal run=${p.run.runId} attempt=${p.run.attemptId} status=${terminal} executionMs=${p.run.executionMs} retryBlocked=${p.run.retryBlocked}`,
      );
  }

  async cancel(userId: string, runId: string, attemptId: string) {
    const attempt = await this.prisma.coachRunAttempt.findFirst({
      where: { id: attemptId, runId, userId },
    });
    if (!attempt) throw new NotFoundException('Coach attempt not found');
    if (attempt.status !== 'running')
      return { accepted: false, status: attempt.status };
    const result = await this.prisma.coachRunAttempt.updateMany({
      where: {
        id: attemptId,
        userId,
        status: 'running',
        run: { activeAttemptId: attemptId },
      },
      data: { cancelRequestedAt: new Date() },
    });
    this.logger.log(
      `cancel_requested run=${runId} attempt=${attemptId} accepted=${result.count === 1}`,
    );
    return { accepted: result.count === 1, attemptId };
  }

  /** A provider can settle an already-started write after abort/lease expiry.
   * Reconcile the receipt, never revive the attempt or grant permission to replay. */
  async recordLateOutcome(handle: CoachRunHandle, event: CoachActivityEvent) {
    if (!event.toolCallId || !['completed', 'failed'].includes(event.status))
      return;
    await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.coachRunAttempt.findFirst({
        where: {
          id: handle.projector.run.attemptId,
          userId: handle.userId,
          ownerId: this.ownerId,
        },
        include: { message: true },
      });
      if (!attempt || attempt.status === 'running') return;
      const envelope = attempt.message.message as unknown as {
        parts?: Array<Record<string, unknown>>;
      };
      const parts = (envelope.parts ?? []).map((part) => {
        const data = part.data as Record<string, unknown> | undefined;
        if (
          part.type !== 'data-coach-activity' ||
          data?.toolCallId !== event.toolCallId
        )
          return part;
        return {
          ...part,
          data: {
            ...data,
            status: event.status,
            revision: Number(data.revision) + 1,
            endedAt: new Date().toISOString(),
            summary: 'late_outcome',
          },
        };
      });
      const unresolved = Array.isArray(attempt.unresolvedTools)
        ? attempt.unresolvedTools.filter((id) => id !== event.toolCallId)
        : [];
      const updated = await tx.coachRunAttempt.updateMany({
        where: {
          id: attempt.id,
          revision: attempt.revision,
          status: attempt.status,
        },
        data: { unresolvedTools: json(unresolved), revision: { increment: 1 } },
      });
      if (updated.count !== 1)
        throw new ConflictException('Coach outcome reconciliation raced');
      await tx.aiCoachMessage.update({
        where: { id: attempt.messageId },
        data: { message: json({ ...envelope, parts }) },
      });
    });
  }

  async heartbeat(handle: CoachRunHandle) {
    const row = await this.prisma.coachRunAttempt.findUnique({
      where: { id: handle.projector.run.attemptId },
    });
    if (!row || row.status !== 'running' || row.ownerId !== this.ownerId)
      return 'ownership_lost';
    if (row.cancelRequestedAt) return 'user_cancelled';
    await this.prisma.coachRunAttempt.updateMany({
      where: { id: row.id, ownerId: this.ownerId, status: 'running' },
      data: { heartbeatAt: new Date() },
    });
    return null;
  }

  /** Called on history reads. Lease expiry is recovery, never permission to replay a write. */
  async recoverStale(userId: string, sid: string) {
    const cutoff = new Date(Date.now() - LEASE_MS);
    const stale = await this.prisma.coachRunAttempt.findMany({
      where: {
        userId,
        status: 'running',
        heartbeatAt: { lt: cutoff },
        run: { sessionId: sid },
      },
      include: { message: true, run: true },
    });
    for (const attempt of stale) {
      this.logger.warn(
        `stale_run run=${attempt.runId} attempt=${attempt.id} heartbeat=${attempt.heartbeatAt.toISOString()}`,
      );
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.coachRunAttempt.updateMany({
          where: {
            id: attempt.id,
            status: 'running',
            heartbeatAt: { lt: cutoff },
          },
          data: {
            status: 'interrupted',
            endedAt: attempt.heartbeatAt,
            revision: { increment: 1 },
          },
        });
        if (!changed.count) return;
        const envelope = attempt.message.message as unknown as {
          parts?: Array<Record<string, unknown>>;
        };
        const executionMs =
          attempt.run.executionMs +
          Math.max(
            0,
            attempt.heartbeatAt.getTime() - attempt.startedAt.getTime(),
          );
        const parts = (envelope.parts ?? []).map((part) => {
          if (part.type === 'data-coach-run')
            return {
              ...part,
              data: {
                ...(part.data as object),
                revision:
                  Number((part.data as { revision: number }).revision) + 1,
                status: 'interrupted',
                endedAt: attempt.heartbeatAt.toISOString(),
                executionMs,
                retryBlocked: attempt.mutationStarted,
              },
            };
          if (
            part.type === 'data-coach-activity' &&
            ['running', 'queued'].includes(
              String((part.data as { status?: string })?.status),
            )
          )
            return {
              ...part,
              data: {
                ...(part.data as object),
                status: 'interrupted',
                endedAt: attempt.heartbeatAt.toISOString(),
              },
            };
          return part;
        });
        await tx.aiCoachMessage.update({
          where: { id: attempt.messageId },
          data: { message: json({ ...envelope, parts }) },
        });
        await tx.coachRun.updateMany({
          where: { id: attempt.runId, activeAttemptId: attempt.id },
          data: {
            status: 'interrupted',
            activeAttemptId: null,
            endedAt: attempt.heartbeatAt,
            executionMs,
            revision: { increment: 1 },
          },
        });
      });
    }
  }
}
