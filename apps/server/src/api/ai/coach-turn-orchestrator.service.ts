import { currentDecisionConfirmation } from './core/coach-workout-change';
import {
  CALENDAR_MOVE_EXPIRED_ERROR_CODE,
  COACH_QUESTION_STALE_ERROR_CODE,
} from '@shared/coach-turn-error';
import {
  isCalendarMoveSession,
  PlanStartService,
} from '../plan/application/plan-start.service';
import { ConflictException } from '@nestjs/common';
import {
  TodaySuggestionGuidanceService,
  type FactGuidanceScope,
} from './today-suggestion/today-suggestion-guidance.service';
import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { AiUsageService, parseOpenAIUsage } from './ai-usage.service';
import { UserSession } from '@thallesp/nestjs-better-auth';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { resolveSupportedLocale } from '@/utils/locale.util';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { $Enums, AiUsageStatus } from '@prisma/client';
import type { AiModelPurpose } from '@shared/ai-model';
import { PrismaService } from '@/prisma/prisma.service';
import { createHash, randomUUID } from 'crypto';
import { aiOperationError, isAiOperationErrorCode } from './ai-operation.error';
import type {
  CoachAssistantContentBlock,
  CoachUserMessageBody,
} from './core/coach-query-yield';
import {
  getCoachModel,
  getCoachUpstreamProvider,
} from './core/coach-upstream.adapter';
import { purposeForActualModel } from '@/api/ai/ai-model-catalog';
import { CoachBranchingService } from './coach-branching.service';
import {
  previewText,
  asRecord,
  unknownErrorFields,
} from './core/ai-common.util';
import {
  buildAssistantMessageBody,
  coachAssistantBlockIsInternalToolUse,
  coachAssistantBlockIsUiSurface,
  coachSsePayloadForAbort,
  coachSsePayloadForModelUnavailable,
  hasCoachMetaOnlyToolResult,
  normalizeCoachUserMessage,
  textFromAssistantMessageBody,
  textFromCoachUserMessage,
} from './core/coach-message.util';
import { type CoachUiStreamYield } from './core/coach-ui-message-stream';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
import { CoachClientOutputGuard } from './core/coach-client-output-guard';
import { resolveCoachReplyLanguage } from './core/coach-safety-policy';
import { resolveCoachUsageKind } from './core/coach-usage-kind';
import { APIError as UpstreamApiError } from 'openai';
import {
  AI_OPERATION_LEDGER,
  type AiOperation,
  type AiOperationLedger,
  toAiOperationResult,
} from './ai-operation-ledger.port';

import {
  CoachRunStore,
  CoachRunCancelledError,
  type CoachRunHandle,
} from './coach-run-store.service';
import {
  parseCoachRunCommand,
  type CoachActivityEvent,
  type CoachRunStatus,
} from '@shared/ai-coach-run-contract';
import { coachSnapshotChunks } from './core/coach-run-projector';
import { CoachAssessmentCaseService } from './athlete-state/coach-assessment-case.service';

export type CoachPostBody = {
  protocolVersion?: number;
  runCommand?: unknown;
  operationId?: string;
  purpose?: AiModelPurpose;
  sid?: string;
  lang?: string;
  intent?: string;
  skip_user_append?: boolean | string;
  message?: unknown;
  q?: string;
  contextId?: string;
  planId?: string;
  branchId?: string;
  caseId?: string;
  openReason?: string;
  sourceNode?: unknown;
};

function parseRequestedModelPurpose(value: unknown): AiModelPurpose {
  if (value === undefined || value === null || value === '') {
    return String(process.env.AI_DEFAULT_MODEL_PURPOSE ?? '')
      .trim()
      .toUpperCase() === 'REASONING'
      ? 'REASONING'
      : 'DEFAULT';
  }
  if (value === 'DEFAULT' || value === 'REASONING') return value;
  throw aiOperationError('AI_MODEL_PURPOSE_UNAVAILABLE');
}

/**
 * Provider-side failure from the OpenAI-compatible SDK (HTTP error, connection
 * error, SDK timeout). Application exceptions are never treated as such.
 */
function isUpstreamModelError(err: unknown): boolean {
  if (err instanceof HttpException) return false;
  if (err instanceof UpstreamApiError) return true;
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400;
}

export type CoachTurnSink = {
  start(): void;
  emit(event: CoachUiStreamYield): void | Promise<void>;
  end(): void;
  isClosed(): boolean;
  onClose(listener: () => void): void;
  offClose(listener: () => void): void;
};

const COACH_RUN_HEARTBEAT_MS = 5_000;
const COACH_RUN_CHECKPOINT_MS = 2_000;
const COACH_IMMEDIATE_TOOL_CARDS = new Set([
  'AskUserQuestion',
  'MutationApplied',
  'CoachDecisionApplied',
]);

function isCoachMutationCheckpoint(activity: CoachActivityEvent) {
  return activity.mutation && !['queued', 'waiting'].includes(activity.status);
}

@Injectable()
export class CoachTurnOrchestrator {
  private readonly logger = new Logger(CoachTurnOrchestrator.name);

  constructor(
    private readonly aiService: AiService,
    private readonly aiUsage: AiUsageService,
    @Inject(AI_OPERATION_LEDGER)
    private readonly operations: AiOperationLedger,
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly coachBranching: CoachBranchingService,
    private readonly aiDataConsent: AiDataConsentService,
    private readonly coachRuns: CoachRunStore,
    private readonly assessmentCases: CoachAssessmentCaseService,
    private readonly todayGuidance: TodaySuggestionGuidanceService,
    private readonly planStarts: PlanStartService,
  ) {}

  async run(args: {
    userId: string;
    session: UserSession;
    body: CoachPostBody;
    idempotencyKey?: string;
    sink: CoachTurnSink;
  }): Promise<void> {
    const { userId, session, idempotencyKey } = args;
    let body = args.body;
    const requestLocale = resolveSupportedLocale(
      String(body.lang ?? '').trim() || I18nContext.current()?.lang,
    );
    const v2 = body.protocolVersion === 2;
    const command = v2 ? parseCoachRunCommand(body.runCommand) : null;
    if (v2 && !command)
      throw new HttpException('Invalid Coach run command', 400);
    await this.aiDataConsent.assertGranted(userId);
    const platformFunded =
      command && this.coachRuns.isAthleteStateContinuation
        ? await this.coachRuns.isAthleteStateContinuation(
            userId,
            String(body.sid ?? ''),
            command,
          )
        : false;
    if (platformFunded) await this.aiService.assertAthleteStateAccess(userId);
    const findMissingRequestBranch = command && !body.branchId;
    const existingRequestBranch = findMissingRequestBranch
      ? await this.coachRuns.existingRequestBranch(
          userId,
          String(body.sid ?? ''),
          command,
        )
      : null;
    if (existingRequestBranch)
      body = { ...body, branchId: existingRequestBranch };
    if (command?.kind === 'answer' && !body.branchId) {
      const branchId = await this.coachRuns.answerBranch(
        userId,
        String(body.sid ?? ''),
        command.runId,
      );
      body = { ...body, branchId: branchId ?? undefined };
    }
    if (command?.kind === 'retry') {
      const input = await this.coachRuns.retryInput(
        userId,
        String(body.sid ?? ''),
        command,
      );
      body = {
        ...body,
        q: input.prompt,
        message: input.message,
        branchId: input.branchId ?? undefined,
      };
    }
    if (body.caseId) {
      await this.assessmentCases.assertBoundRequest({
        userId,
        caseId: body.caseId,
        sessionId: String(body.sid ?? ''),
        branchId: body.branchId ?? null,
      });
    }
    const rawSink = args.sink;
    let runHandle: CoachRunHandle | undefined;
    let runFinished = false;
    let runOwnershipLost = false;
    const lateActivities: CoachActivityEvent[] = [];
    const runClosingChunks: import('./core/coach-ui-message-stream').CoachUiChunk[] =
      [];
    let runQueue: Promise<void> = Promise.resolve();
    let runHeartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let runCheckpointTimer: ReturnType<typeof setTimeout> | undefined;
    let runLastFlush = 0;
    let runDirty = false;
    let heartbeatBusy = false;
    const preRunEvents: CoachUiStreamYield[] = [];
    const enqueueRunWrite = (persist: () => Promise<void>) => {
      const write = runQueue.then(persist);
      runQueue = write.catch(() => undefined);
      return write;
    };
    const clearRunCheckpointTimer = () => {
      if (runCheckpointTimer) clearTimeout(runCheckpointTimer);
      runCheckpointTimer = undefined;
    };
    const flushRunCheckpoint = async (handle: CoachRunHandle) => {
      clearRunCheckpointTimer();
      await this.coachRuns.checkpointStreamProgress(handle);
      runLastFlush = Date.now();
      runDirty = false;
    };
    const abortForCheckpointError = (error: unknown) => {
      if (error instanceof CoachRunCancelledError) abort.abort(error.message);
      else if (error instanceof ConflictException) {
        runOwnershipLost = true;
        abort.abort('ownership_lost');
      } else abort.abort('checkpoint_failed');
    };
    const scheduleRunCheckpoint = (handle: CoachRunHandle) => {
      if (runCheckpointTimer) return;
      runCheckpointTimer = setTimeout(() => {
        runCheckpointTimer = undefined;
        void enqueueRunWrite(async () => {
          if (
            runFinished ||
            !runDirty ||
            runOwnershipLost
          )
            return;
          if (Date.now() - runLastFlush < COACH_RUN_CHECKPOINT_MS) {
            scheduleRunCheckpoint(handle);
            return;
          }
          await flushRunCheckpoint(handle);
        }).catch(abortForCheckpointError);
      }, Math.max(0, runLastFlush + COACH_RUN_CHECKPOINT_MS - Date.now()));
    };
    const sink: CoachTurnSink = !v2
      ? rawSink
      : {
          ...rawSink,
          end() {
            /* The producer finalizes durable state before closing its stream. */
          },
          emit: async (event) => {
            if (event.type === 'result' && event.operation) {
              await rawSink.emit({
                type: 'ui_chunk',
                chunk: {
                  type: 'data-coach-operation',
                  data: { operation: event.operation },
                  transient: true,
                },
              });
            }
            if (!runHandle) {
              preRunEvents.push(event);
              return;
            }
            if (runFinished && event.type !== 'activity') return;
            return enqueueRunWrite(async () => {
              const projector = runHandle.projector;
              if (event.type === 'activity') {
                const activity = event.activity;
                const stillRunning = projector.run.status === 'running';
                if (activity.status === 'running' || activity.status === 'queued') {
                  if (!stillRunning) abort.abort('ownership_lost');
                  abort.signal.throwIfAborted();
                }
                // Completed tools may settle after the client or lease is gone.
                if (runFinished) {
                  await this.coachRuns.recordLateOutcome(runHandle, activity);
                  return;
                }
                if (!stillRunning || runOwnershipLost) {
                  lateActivities.push(activity);
                  return;
                }
              }
              if (runFinished) return;
              if (runOwnershipLost) return;
              if (
                event.type === 'activity' &&
                event.activity.mutation &&
                event.activity.status === 'running'
              ) {
                clearRunCheckpointTimer();
                const chunks = await this.coachRuns.checkpointMutationStart(
                  runHandle,
                  event.activity,
                );
                runLastFlush = Date.now();
                runDirty = false;
                for (const chunk of chunks)
                  await rawSink.emit({ type: 'ui_chunk', chunk });
                return;
              }
              const chunks = projector.consume(event);
              if (
                !chunks.length &&
                event.type !== 'user' &&
                event.type !== 'assistant'
              )
                return;
              runDirty = true;
              if (
                (event.type === 'activity' &&
                  isCoachMutationCheckpoint(event.activity)) ||
                (event.type === 'assistant' &&
                  event.message.content.some((block) =>
                    block.type === 'tool_use' && COACH_IMMEDIATE_TOOL_CARDS.has(block.name),
                  )) ||
                event.type === 'result' ||
                Date.now() - runLastFlush >= COACH_RUN_CHECKPOINT_MS
              ) {
                await flushRunCheckpoint(runHandle).catch((error: unknown) => {
                  abortForCheckpointError(error);
                  throw error;
                });
              } else scheduleRunCheckpoint(runHandle);
              for (const chunk of chunks)
                await rawSink.emit({ type: 'ui_chunk', chunk });
            });
          },
        };
    const persistLateActivities = async (handle: CoachRunHandle) => {
      for (const activity of lateActivities.splice(0))
        await this.coachRuns.recordLateOutcome(handle, activity);
    };
    const finishRun = (status: CoachRunStatus, legacyMessage?: unknown) =>
      enqueueRunWrite(async () => {
        if (!runHandle || runFinished) return;
        clearRunCheckpointTimer();
        let chunks = runHandle.projector.finish(status);
        let terminalCancellation: CoachRunCancelledError | undefined;
        try {
          try {
            await this.coachRuns.checkpointStreamTerminal(runHandle, status, legacyMessage);
          } catch (error) {
            if (
              !(error instanceof CoachRunCancelledError) ||
              status !== 'interrupted' ||
              error.message !== 'user_cancelled'
            ) throw error;
            chunks = runHandle.projector.finish('cancelled');
            await this.coachRuns.checkpointStreamTerminal(runHandle, 'cancelled');
          }
        } catch (error) {
          if (error instanceof ConflictException) {
            abortForCheckpointError(error);
            await this.coachRuns.recoverStaleOperation(
              userId,
              runHandle.operationId,
            );
            runFinished = true;
            await persistLateActivities(runHandle);
            runClosingChunks.push({
              type: 'error',
              errorText: coachSsePayloadForAbort(this.i18n, requestLocale).message,
            });
            if (status === 'completed' || status === 'awaiting_input') throw error;
            return;
          }
          if (!(error instanceof CoachRunCancelledError)) throw error;
          abort.abort(error.message);
          if (!error.terminalChunks) throw error;
          chunks = error.terminalChunks;
          terminalCancellation = error;
        }
        runFinished = true;
        await persistLateActivities(runHandle);
        for (const chunk of chunks) {
          if (chunk.type === 'finish' || chunk.type === 'finish-step')
            runClosingChunks.push(chunk);
          else await rawSink.emit({ type: 'ui_chunk', chunk });
        }
        if (terminalCancellation) throw terminalCancellation;
      });
    const reqId = randomUUID();
    const startedAt = Date.now();
    let coachUserMessage = normalizeCoachUserMessage(body?.message);
    let factGuidance: FactGuidanceScope | undefined;
    if (!v2) await this.coachRuns.assertLegacyInput(coachUserMessage);
    const isMetaOnlyToolResult = hasCoachMetaOnlyToolResult(coachUserMessage);
    const prompt = (
      textFromCoachUserMessage(coachUserMessage) || String(body?.q ?? '')
    ).trim();
    if (!prompt && !isMetaOnlyToolResult) {
      this.logger.warn(`[AI][教练][${reqId}] 缺少提问内容 用户ID=${userId}`);
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.missing_prompt', { lang: requestLocale }) ?? 'Missing prompt',
      });
    }
    const sessionId = String(body?.sid ?? '').trim();
    const isCalendarConfirmation =
      v2 &&
      isCalendarMoveSession(sessionId) &&
      Boolean(currentDecisionConfirmation(coachUserMessage));
    if (!sessionId) {
      this.logger.warn(
        `[AI][教练][${reqId}] 请求体未带 sid，落库将使用会话键 default，易与地址栏 UUID 会话不一致`,
      );
    }
    const lang = resolveCoachReplyLanguage(
      prompt,
      requestLocale,
    );
    let intent = String(body?.intent ?? '').trim();
    const requestedPurpose = parseRequestedModelPurpose(body?.purpose);
    // Plan creation benefits from the stronger reasoning-tier model (e.g. deepseek-v4-pro)
    // without forcing slow chain-of-thought thinking unless the user explicitly requested it.
    const planBuilderModel =
      intent === 'plan-builder' && requestedPurpose !== 'REASONING'
        ? getCoachModel({ thinking: true })
        : '';
    const purpose: AiModelPurpose = planBuilderModel
      ? 'REASONING'
      : requestedPurpose;
    const thinking = requestedPurpose === 'REASONING';
    const operationId =
      String(body?.operationId ?? '').trim() ||
      (platformFunded ? randomUUID() : '');
    if (!isMetaOnlyToolResult && !operationId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'operationId is required',
      });
    }
    const maxPromptChars = Number(
      process.env.AI_COACH_MAX_PROMPT_CHARS || 2000,
    );
    const maxSidChars = Number(process.env.AI_COACH_MAX_SID_CHARS || 64);
    if (!isMetaOnlyToolResult && prompt.length > maxPromptChars) {
      this.logger.warn(
        `[AI][教练][${reqId}] 提问内容过长 用户ID=${userId} 提示字符数=${prompt.length} 最大值=${maxPromptChars}`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          this.i18n.t('common.error.prompt_too_long', { lang }) ?? 'Prompt too long',
      });
    }
    if (sessionId && sessionId.length > maxSidChars) {
      this.logger.warn(
        `[AI][教练][${reqId}] 会话标识不合法 用户ID=${userId} 会话ID字符数=${sessionId.length} 最大值=${maxSidChars}`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.invalid_sid', { lang }) ?? 'Invalid sid',
      });
    }

    const skipUserAppend =
      body?.skip_user_append === true ||
      body?.skip_user_append === '1' ||
      body?.skip_user_append === 'true';

    const provider = getCoachUpstreamProvider();
    const model = planBuilderModel || getCoachModel({ thinking });
    this.logger.log(
      `[AI][教练][${reqId}] 开始处理 用户ID=${userId} 会话ID=${sessionId || 'default'} 语言=${lang} 服务商=${provider ?? 'none'} 模型=${model || 'none'} skipUserAppend=${skipUserAppend ? '是' : 'no'} 提示字符数=${prompt.length}`,
    );

    sink.start();

    const abort = new AbortController();
    const totalTimeoutMs = Number(
      process.env.AI_COACH_TOTAL_TIMEOUT_MS || 360_000,
    );
    const totalTimer = setTimeout(
      () => {
        if (!abort.signal.aborted) {
          this.logger.warn(
            `[AI][教练][${reqId}] 总超时中断 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${Date.now() - startedAt} 超时毫秒=${totalTimeoutMs}`,
          );
          abort.abort('total_timeout');
        }
      },
      Math.max(1, totalTimeoutMs),
    );

    const cleanup = () => {
      if (!abort.signal.aborted && !sink.isClosed()) {
        this.logger.warn(
          `[AI][coach][${reqId}] client disconnected userId=${userId} provider=${provider ?? 'none'} model=${model || 'none'} elapsedMs=${Date.now() - startedAt} operationStarted=${operationStarted} userTurnPersisted=${userTurnPersisted} assistantResultPersisted=${assistantResultPersisted} usageEvents=${modelUsageEvents.length}`,
        );
        abort.abort('client_disconnected');
      }
    };
    sink.onClose(cleanup);

    let operationStarted = false;
    let operationCompleted = false;
    let operationFailed = false;
    let operationCompletionPending = false;
    let operationHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let coachSessionKey = String(sessionId ?? '').trim() || 'default';
    let lastUsage: unknown = undefined;
    let actualModel = model;
    let actionUsageKind: $Enums.AiUsageKind = $Enums.AiUsageKind.COACH_CHAT;
    const modelUsageEvents: Array<
      Extract<CoachUiStreamYield, { type: 'model_usage' }>
    > = [];
    const persistedUsageCallKeys = new Set<string>();
    let assistantResultPersisted = false;
    let assistantResultMessageId: string | null = null;
    // 本轮用户消息已在库中（新写入或编辑重答已存在）：失败提示才有落库意义。
    let userTurnPersisted = false;
    let coachBranchId = String(body?.branchId ?? '').trim() || null;
    const requestFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          sessionId: sessionId || 'default',
          purpose,
          intent: intent || null,
          prompt,
          message: coachUserMessage,
          branchId: body?.branchId ?? null,
          contextId: body?.contextId ?? null,
          planId: body?.planId ?? null,
        }),
      )
      .digest('hex');

    const persistCoachUsage = async (
      ensureModelCall = false,
      required = false,
    ) => {
      if (isCalendarConfirmation) return;
      const hasReportedUsage =
        modelUsageEvents.length > 0 || lastUsage !== undefined;
      if (!hasReportedUsage && !ensureModelCall) return;
      const events =
        modelUsageEvents.length > 0
          ? modelUsageEvents
          : [
              {
                type: 'model_usage' as const,
                usage: lastUsage,
                model: actualModel,
                provider: provider ?? undefined,
                status: 'SUCCESS' as const,
              },
            ];
      for (const [index, event] of events.entries()) {
        const usageIdentity = platformFunded
          ? (runHandle?.projector.run.attemptId ?? operationId)
          : operationId;
        const callKey = `${usageIdentity}:coach-model:${index}`;
        if (persistedUsageCallKeys.has(callKey)) continue;
        const eventModel = event.model.trim() || actualModel;
        const eventProvider = event.provider?.trim() || provider;
        try {
          await this.aiUsage.recordUsageEvent({
            userId,
            operationId: platformFunded ? null : operationId,
            callKey,
            kind: actionUsageKind,
            provider: eventProvider,
            model: eventModel,
            purpose: purposeForActualModel({
              provider: eventProvider,
              modelId: eventModel,
              requestedPurpose: purpose,
            }),
            usage: parseOpenAIUsage(event.usage),
            sid: coachSessionKey,
            status: event.status as AiUsageStatus,
          });
          persistedUsageCallKeys.add(callKey);
        } catch (error) {
          this.logger.error(
            `[AI][教练][${reqId}] usage 落库失败 operationId=${operationId} callKey=${callKey} error=${String(error)}`,
          );
          if (required) {
            throw error;
          }
        }
      }
    };

    const operationAdmissionArgs = {
      userId,
      operationId,
      idempotencyKey,
      kind: $Enums.AiUsageKind.COACH_CHAT,
      purpose,
      metadata: {
        sid: sessionId || 'default',
        intent: intent || null,
        requestFingerprint,
      },
    };

    const emitOperationReplay = async (operation: AiOperation) => {
      await sink.emit({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
        operation: toAiOperationResult(operation, true),
      });
      sink.end();
    };

    /**
     * 失败提示落库为助手行（providerReplay=false + data-coach-turn-error），刷新后可见、
     * 可重试，且永远不会进入模型上下文。客户端主动断开时不写。
     */
    const persistTurnFailure = async (failure: {
      code: string;
      message: string;
    }) => {
      const content = failure.message.trim();
      if (v2) return;
      if (!content || !userTurnPersisted) return;
      if (abort.signal.reason === 'client_disconnected') return;
      try {
        await this.aiService.coachAppendTurnFailure({
          session,
          sid: coachSessionKey,
          lang,
          content,
          code: failure.code,
          branchId: coachBranchId,
        });
      } catch (error) {
        this.logger.error(
          `[AI][教练][${reqId}] 保存失败提示失败 用户ID=${userId} 会话ID=${coachSessionKey} 代码=${failure.code} 原因=${String(error)}`,
        );
      }
    };

    /** 推送终态错误并落库失败提示，然后结束本轮。 */
    const failTurn = async (failure: {
      code: string;
      message: string;
      data?: unknown;
    }) => {
      await sink.emit({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        error_code: failure.code,
        result: failure.message,
        ...(failure.data !== undefined ? { data: failure.data } : {}),
      });
      await persistTurnFailure(failure);
      sink.end();
    };

    const modelUnavailable = () => {
      const payload = coachSsePayloadForModelUnavailable({
        i18n: this.i18n,
        lang,
      });
      return { code: payload.error_code, message: payload.result };
    };

    try {
      const reference = coachUserMessage?.content.find(
        (block) =>
          block.type === 'tool_result' &&
          block.content &&
          typeof block.content === 'object' &&
          (block.content as { kind?: string }).kind ===
            'today_suggestion_context',
      );
      if (reference?.type === 'tool_result') {
        const supplied = reference.content as {
          suggestionId?: string;
          version?: number;
        };
        if (typeof supplied.suggestionId !== 'string')
          throw new BadRequestException('TODAY_GUIDANCE_NOT_FOUND');
        const resolved = await this.todayGuidance.resolve(
          userId,
          supplied.suggestionId,
        );
        if (!resolved.context || !resolved.sessionId)
          throw new BadRequestException('TODAY_GUIDANCE_UNAVAILABLE');
        coachUserMessage = {
          ...coachUserMessage,
          content: coachUserMessage.content.map((block) =>
            block === reference
              ? {
                  ...block,
                  content: {
                    kind: 'today_suggestion_context',
                    version: 2,
                    suggestionId: supplied.suggestionId,
                    guidanceStatus: resolved.status,
                    topic: resolved.scope?.topic,
                    refs: resolved.context.currentFacts,
                    meaning:
                      'Server-verified discussion target only. Read current facts from their owners. Opening this context is not an answer or permission to alter training.',
                  },
                }
              : block,
          ),
        };
        if (supplied.version === 2) {
          if (coachSessionKey !== resolved.sessionId)
            throw new ConflictException('FACT_GUIDANCE_SESSION_CHANGED');
          factGuidance = resolved.scope;
        }
      }
      if (!platformFunded && !isMetaOnlyToolResult && !v2) {
        const peeked = await this.operations.peekReplay(operationAdmissionArgs);
        if (peeked.replay) {
          await emitOperationReplay(peeked.operation);
          return;
        }
      }

      const existingCalendarBranch =
        isCalendarConfirmation && command && !findMissingRequestBranch
          ? await this.coachRuns.existingRequestBranch(
              userId,
              coachSessionKey,
              command,
            )
          : existingRequestBranch;
      const calendarEdit = isCalendarMoveSession(coachSessionKey)
        ? await this.planStarts.calendarCoachSession(
            userId,
            coachSessionKey,
            undefined,
            {
              allowApplied: Boolean(existingCalendarBranch),
              ...(v2 ? { reportExpired: true } : {}),
            },
          )
        : null;
      if (calendarEdit) {
        if (!v2 || platformFunded)
          throw new ConflictException('CALENDAR_EDIT_REQUIRES_DURABLE_COACH');
        if (body?.planId && body.planId !== calendarEdit.planId)
          throw new ConflictException('CALENDAR_EDIT_PLAN_MISMATCH');
        body = { ...body, planId: calendarEdit.planId, contextId: undefined };
        coachBranchId = existingCalendarBranch ?? calendarEdit.branchId ?? null;
        intent = 'plan-followup';
      }
      const startConversation = await this.prisma.aiCoachSession.findUnique({
        where: { userId_id: { userId, id: coachSessionKey } },
        select: {
          planStartPlanId: true,
          planStartBranchId: true,
          planStartRevision: true,
        },
      });
      if (startConversation?.planStartPlanId && !v2)
        throw new ConflictException('START_REQUIRES_DURABLE_RUNTIME');
      if (intent === 'plan-start' && !startConversation?.planStartPlanId)
        throw new ConflictException('START_SESSION_REQUIRED');
      if (startConversation?.planStartPlanId) {
        if (body?.planId && body.planId !== startConversation.planStartPlanId)
          throw new ConflictException('START_SESSION_MISMATCH');
        const branch = await this.coachBranching.bindStartConversationBranch({
          userId,
          sid: coachSessionKey,
          branchId: coachBranchId,
          revision: startConversation.planStartRevision,
          preserveClosedBranch:
            !!currentDecisionConfirmation(coachUserMessage) ||
            command?.kind === 'retry',
        });
        coachBranchId = branch.id;
        body = { ...body, planId: startConversation.planStartPlanId };
        const appliedStart = await this.prisma.planProposalPreview.findFirst({
          where: {
            userId,
            sourcePlanId: startConversation.planStartPlanId,
            mode: 'START',
            appliedAt: { not: null },
            proposal: { path: ['binding', 'sid'], equals: coachSessionKey },
          },
          select: { id: true },
        });
        if (appliedStart) intent = 'plan-followup';
        if (branch.id !== startConversation.planStartBranchId)
          await sink.emit({ type: 'branch', subtype: 'opened', branch });
      }

      const cardConfirmation = currentDecisionConfirmation(coachUserMessage);
      if (!coachBranchId && cardConfirmation)
        coachBranchId = await this.coachBranching.decisionConversationBranch(
          userId,
          coachSessionKey,
          cardConfirmation.decisionId,
        );

      if (
        !coachBranchId &&
        (String(body?.contextId ?? '').trim() ||
          String(body?.planId ?? '').trim())
      ) {
        const opened = await this.coachBranching.openBranch({
          userId,
          contextId: String(body?.contextId ?? '').trim() || undefined,
          planId: String(body?.planId ?? '').trim() || undefined,
          openReason:
            String(body?.openReason ?? '').trim() || 'coach_chat_branch',
          sourceNode: body?.sourceNode,
        });
        coachBranchId = opened.branch.id;
        await sink.emit({
          type: 'branch',
          subtype: 'opened',
          branch: opened.branch,
        });
      }

      if (!sessionId && coachBranchId) {
        coachSessionKey = coachBranchId;
      }

      if (v2 && !isMetaOnlyToolResult) {
        const begun = await this.coachRuns.begin({
          userId,
          sid: coachSessionKey,
          branchId: coachBranchId,
          lang,
          prompt,
          message: coachUserMessage ?? {
            content: [{ type: 'text', text: prompt }],
          },
          operationId,
          command,
          guidance: factGuidance,
        });
        if (begun.replay) {
          const replayChunks = coachSnapshotChunks(
            begun.replay.id,
            begun.replay.message,
          );
          for (const chunk of replayChunks.slice(0, -2))
            await rawSink.emit({ type: 'ui_chunk', chunk });
          const operation =
            platformFunded || isCalendarConfirmation
              ? null
              : await this.operations.get(userId, begun.replay.operationId);
          if (operation)
            await rawSink.emit({
              type: 'ui_chunk',
              chunk: {
                type: 'data-coach-operation',
                data: { operation: toAiOperationResult(operation, true) },
                transient: true,
              },
            });
          for (const chunk of replayChunks.slice(-2))
            await rawSink.emit({ type: 'ui_chunk', chunk });
          preRunEvents.length = 0;
          return;
        }
        runHandle = begun.handle;
        userTurnPersisted = true;
        const chunks = runHandle.projector.start();
        await flushRunCheckpoint(runHandle);
        for (const chunk of chunks)
          await rawSink.emit({ type: 'ui_chunk', chunk });
        for (const event of preRunEvents.splice(0)) await sink.emit(event);
        if (coachBranchId && command.kind !== 'retry')
          await this.coachBranching.appendBranchMessage({
            userId,
            branchId: coachBranchId,
            role: 'user',
            message: coachUserMessage ?? {
              content: [{ type: 'text', text: prompt }],
            },
          });
        runHeartbeatTimer = setInterval(() => {
          if (heartbeatBusy || runFinished) return;
          heartbeatBusy = true;
          void (async () => {
            const reason = await this.coachRuns.heartbeat(runHandle);
            if (
              reason &&
              !runFinished &&
              (reason !== 'ownership_lost' ||
                runHandle.projector.run.status === 'running')
            ) {
              if (reason === 'ownership_lost') runOwnershipLost = true;
              abort.abort(reason);
            }
          })()
            .catch(() => abort.abort('checkpoint_failed'))
            .finally(() => {
              heartbeatBusy = false;
            });
        }, COACH_RUN_HEARTBEAT_MS);
      } else if (skipUserAppend) {
        await this.aiService.assertCoachSkipAppendMatchesPrompt({
          session,
          sid: coachSessionKey,
          prompt,
        });
        userTurnPersisted = true;
        this.logger.debug(
          `[AI][教练][${reqId}] 跳过追加用户行（编辑重答） 用户ID=${userId} 会话ID=${coachSessionKey}`,
        );
      } else {
        coachSessionKey = await this.aiService.coachAppendUserTurn({
          session,
          sid: coachSessionKey,
          lang,
          content: prompt,
          message: coachUserMessage ?? undefined,
        });
        userTurnPersisted = !isMetaOnlyToolResult;
        if (coachBranchId) {
          await this.coachBranching.appendBranchMessage({
            userId,
            branchId: coachBranchId,
            role: 'user',
            message: coachUserMessage ?? {
              content: [{ type: 'text', text: prompt }],
            },
          });
        }
        this.logger.debug(
          `[AI][教练][${reqId}] 已写入会话记忆 用户ID=${userId} 会话ID=${coachSessionKey} branchId=${coachBranchId ?? 'none'} structuredUserMessage=${coachUserMessage ? '是' : 'no'}`,
        );
      }

      if (!skipUserAppend && hasCoachMetaOnlyToolResult(coachUserMessage)) {
        this.logger.debug(
          `[AI][教练][${reqId}] coach meta-only tool_result，跳过模型流 用户ID=${userId} 会话ID=${coachSessionKey}`,
        );
        sink.end();
        return;
      }

      if (calendarEdit?.expired) {
        await failTurn({
          code: CALENDAR_MOVE_EXPIRED_ERROR_CODE,
          message: 'The calendar move preview expired.',
        });
        return;
      }

      // USER 必须在模型操作登记前落库。否则模型不可用会留下
      // 空壳 sid，用户发的「你好」无法从同一会话恢复。
      if (!platformFunded && !isMetaOnlyToolResult && !isCalendarConfirmation) {
        const admission = await this.operations
          .begin(operationAdmissionArgs)
          .catch(async (error: unknown) => {
            const response =
              error instanceof HttpException
                ? asRecord(error.getResponse())
                : null;
            const blockingOperationId = asRecord(response?.data)?.operationId;
            if (
              response?.code !== 'AI_OPERATION_IN_PROGRESS' ||
              typeof blockingOperationId !== 'string' ||
              blockingOperationId === operationId ||
              !(await this.coachRuns.recoverStaleOperation(
                userId,
                blockingOperationId,
              ))
            ) {
              throw error;
            }
            await this.operations.fail({
              userId,
              operationId: blockingOperationId,
              errorCode: 'COACH_RUN_LEASE_EXPIRED',
            });
            this.logger.warn(
              `[AI][教练][${reqId}] 已处理心跳超时的阻塞操作 operationId=${blockingOperationId}`,
            );
            return this.operations.begin(operationAdmissionArgs);
          });
        if (admission.replay) {
          if (runHandle && !runFinished) {
            await finishRun('cancelled').catch(() => undefined);
          }
          await emitOperationReplay(admission.operation);
          return;
        }
        operationStarted = true;
        operationHeartbeatTimer = setInterval(() => {
          void this.operations
            .heartbeat(userId, operationId)
            .catch((heartbeatError: unknown) => {
              this.logger.warn(
                `[AI][教练][${reqId}] operation heartbeat 失败 operationId=${operationId} error=${String(heartbeatError)}`,
              );
            });
        }, 30_000);
      }

      let assistantText = '';
      let assistantReasoningText = '';
      const orderedAssistantContent: CoachAssistantContentBlock[] = [];
      let chunkCount = 0;
      let reasoningChunkCount = 0;
      const structuredEventsToPersist: Array<
        | {
            type: 'assistant';
            message: {
              content: CoachAssistantContentBlock[];
              reasoning_content?: string;
            };
          }
        | { type: 'user'; message: CoachUserMessageBody }
      > = [];
      const stream = await this.aiService.coachStream({
        platformFunded,
        runtimeRunId: runHandle?.projector.run.runId,
        runtimeAttemptId: runHandle?.projector.run.attemptId,
        currentUserMessageId: runHandle?.inputMessageId,
        calendarEdit: calendarEdit ?? undefined,
        activeSkillName: platformFunded ? 'athlete-state' : undefined,
        session,
        sid: coachSessionKey,
        lang,
        prompt,
        message: coachUserMessage,
        intent: intent || undefined,
        thinking,
        model: planBuilderModel || undefined,
        operationId,
        usageKind: $Enums.AiUsageKind.COACH_CHAT,
        branchId: coachBranchId,
        caseId: body.caseId ?? null,
        signal: abort.signal,
        onPlanValidationRejected: runHandle
          ? (event) =>
              this.coachRuns.recordPlanValidationRejection(runHandle, event)
          : undefined,
        onActivity: runHandle
          ? async (activity) => {
              try {
                await sink.emit({ type: 'activity', activity });
              } catch (error) {
                if (
                  !(error instanceof CoachRunCancelledError) &&
                  !(error instanceof ConflictException)
                ) throw error;
                abortForCheckpointError(error);
                if (
                  isCoachMutationCheckpoint(activity) &&
                  activity.status !== 'running'
                ) {
                  await enqueueRunWrite(async () => {
                    if (runFinished)
                      await this.coachRuns.recordLateOutcome(runHandle, activity);
                    else lateActivities.push(activity);
                  });
                  return;
                }
                throw error;
              }
            }
          : undefined,
      });
      this.logger.log(
        `[AI][教练][${reqId}] 流式输出已打开 用户ID=${userId} 会话ID=${coachSessionKey}`,
      );
      let streamStep = 0;
      let currentPhase: 'model' | 'tool_run' | 'running' = 'running';
      let phaseStartedAt = Date.now();
      let modelPhaseMs = 0;
      let toolRunPhaseMs = 0;
      let runningPhaseMs = 0;
      let toolStartCount = 0;
      let toolEndCount = 0;
      let lastDeltaDebugAt = Date.now();
      let firstTextDeltaMs: number | null = null;
      let emittedTerminalResult = false;
      let emittedTerminalError = false;
      let terminalSuccessEvent: Extract<
        CoachUiStreamYield,
        { type: 'result' }
      > | null = null;
      let terminalErrorEvent: Extract<
        CoachUiStreamYield,
        { type: 'result' }
      > | null = null;
      const clientOutputGuard = new CoachClientOutputGuard(this.i18n, lang);
      const streamLoopStartedAt = Date.now();
      const switchPhase = (next: 'model' | 'tool_run' | 'running') => {
        if (next === currentPhase) return;
        const now = Date.now();
        const phaseElapsed = now - phaseStartedAt;
        if (currentPhase === 'model') modelPhaseMs += phaseElapsed;
        else if (currentPhase === 'tool_run') toolRunPhaseMs += phaseElapsed;
        else runningPhaseMs += phaseElapsed;
        currentPhase = next;
        phaseStartedAt = now;
      };
      for await (const event of stream) {
        if (event.type === 'model_usage') {
          modelUsageEvents.push(event);
          await persistCoachUsage();
          continue;
        }
        if (event.type === 'result' && event.usage !== undefined) {
          lastUsage = event.usage;
        }
        if (event.type === 'result' && event.model?.trim()) {
          actualModel = event.model.trim();
        }
        if (abort.signal.aborted) continue;
        const clientEvent = clientOutputGuard.handle(event);
        if (clientEvent?.type === 'result' && clientEvent.is_error !== true) {
          terminalSuccessEvent = clientEvent;
        } else if (clientEvent) {
          await sink.emit(clientEvent);
        }
        if (clientEvent?.type === 'result') {
          emittedTerminalResult = true;
          if (clientEvent.is_error === true) {
            emittedTerminalError = true;
            terminalErrorEvent = clientEvent;
          }
        }
        if (
          event.type === 'result' &&
          event.is_error === false &&
          clientEvent?.type === 'result' &&
          clientEvent.is_error === true
        ) {
          this.logger.warn(
            `[AI][教练][${reqId}] 空成功终态已转换为错误 用户ID=${userId} 会话ID=${coachSessionKey}`,
          );
        }
        if (event.type === 'system' && event.subtype === 'status') {
          streamStep = event.step ?? streamStep;
          switchPhase(event.status);
          this.logger.debug(
            `[AI][教练][${reqId}] 阶段状态 用户ID=${userId} 会话ID=${coachSessionKey} 步骤=${streamStep} 状态=${event.status}`,
          );
        }
        if (event.type === 'stream_event' && event.event.type === 'phase') {
          switchPhase(event.event.phase);
          this.logger.debug(
            `[AI][教练][${reqId}] 阶段切换 用户ID=${userId} 会话ID=${coachSessionKey} 步骤=${streamStep} 阶段=${event.event.phase}`,
          );
        }
        if (event.type === 'tool_progress') {
          if (event.status === 'start') toolStartCount += 1;
          if (event.status === 'end') toolEndCount += 1;
          this.logger.debug(
            `[AI][教练][${reqId}] 工具进度 用户ID=${userId} 会话ID=${coachSessionKey} 步骤=${streamStep} 阶段=${currentPhase} 工具=${event.tool_name} 状态=${event.status}${typeof event.ok === 'boolean' ? ` ok=${event.ok}` : ''}${typeof event.result_count === 'number' ? ` resultCount=${event.result_count}` : ''}`,
          );
        }
        if (
          event.type === 'stream_event' &&
          event.event.type === 'text_delta'
        ) {
          assistantText += event.event.text;
          const last = orderedAssistantContent.at(-1);
          if (last?.type === 'text') last.text += event.event.text;
          else
            orderedAssistantContent.push({
              type: 'text',
              text: event.event.text,
            });
          chunkCount += 1;
          const now = Date.now();
          if (firstTextDeltaMs === null) {
            firstTextDeltaMs = now - startedAt;
          }
          if (
            chunkCount === 1 ||
            now - lastDeltaDebugAt >= 3_000 ||
            chunkCount % 50 === 0
          ) {
            this.logger.debug(
              `[AI][教练][${reqId}] 文本增量 用户ID=${userId} 会话ID=${coachSessionKey} 步骤=${streamStep} 阶段=${currentPhase} 分片数=${chunkCount} chars=${assistantText.length} 耗时毫秒=${now - startedAt}`,
            );
            lastDeltaDebugAt = now;
          }
        }
        if (
          event.type === 'stream_event' &&
          event.event.type === 'reasoning_delta'
        ) {
          assistantReasoningText += event.event.text;
          reasoningChunkCount += 1;
        }
        if (event.type === 'assistant') {
          structuredEventsToPersist.push(event);
          for (const block of event.message.content) {
            if (
              block.type === 'tool_use' &&
              coachAssistantBlockIsUiSurface(block)
            ) {
              orderedAssistantContent.push(block);
            }
          }
          this.logger.debug(
            `[AI][教练][${reqId}] 结构化助手消息 用户ID=${userId} 会话ID=${coachSessionKey} 步骤=${streamStep} 块数=${event.message.content.length}`,
          );
        }
        if (event.type === 'user') {
          structuredEventsToPersist.push(event);
          this.logger.debug(
            `[AI][教练][${reqId}] 结构化用户消息 用户ID=${userId} 会话ID=${coachSessionKey} 步骤=${streamStep} 块数=${event.message.content.length}`,
          );
        }
      }
      {
        const now = Date.now();
        const phaseElapsed = now - phaseStartedAt;
        switch (currentPhase as 'model' | 'tool_run' | 'running') {
          case 'model':
            modelPhaseMs += phaseElapsed;
            break;
          case 'tool_run':
            toolRunPhaseMs += phaseElapsed;
            break;
          default:
            runningPhaseMs += phaseElapsed;
            break;
        }
      }

      if (abort.signal.aborted) {
        if (emittedTerminalResult) {
          this.logger.warn(
            `[AI][教练][${reqId}] 已发送终态结果，跳过超时补发 用户ID=${userId} 会话ID=${coachSessionKey} 原因=${String(abort.signal.reason)}`,
          );
          sink.end();
          return;
        }
        this.logger.warn(
          `[AI][教练][${reqId}] 流迭代结束但连接已中断 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 原因=${String(abort.signal.reason)} 耗时毫秒=${Date.now() - startedAt}`,
        );
        if (abort.signal.reason === 'total_timeout') {
          await failTurn(modelUnavailable());
          return;
        }
        const { code, message } = coachSsePayloadForAbort(this.i18n, lang);
        await sink.emit({
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          result: message,
          error_code: code,
        });
        sink.end();
        return;
      }

      if (!emittedTerminalResult) {
        const fallback = clientOutputGuard.missingTerminalResult();
        this.logger.warn(
          `[AI][教练][${reqId}] 模型流缺少终态 用户ID=${userId} 会话ID=${coachSessionKey}`,
        );
        if (fallback) {
          await sink.emit(fallback);
          if (fallback.type === 'result') {
            await persistTurnFailure({
              code: fallback.error_code ?? 'internal',
              message: String(fallback.result ?? ''),
            });
          }
        }
        if (operationStarted) {
          await persistCoachUsage(true);
          await this.operations.fail({
            userId,
            operationId,
            errorCode: 'MISSING_TERMINAL_RESULT',
          });
          operationFailed = true;
        }
        sink.end();
        return;
      }

      if (emittedTerminalError) {
        const terminalError = terminalErrorEvent;
        await persistTurnFailure({
          code: terminalError?.error_code ?? 'internal',
          message: String(terminalError?.result ?? ''),
        });
        this.logger.warn(
          `[AI][教练][${reqId}] 终态错误已返回并保存为可见消息，跳过成功结果持久化 用户ID=${userId} 会话ID=${coachSessionKey} 代码=${terminalError?.error_code ?? 'none'}`,
        );
        if (operationStarted) {
          await persistCoachUsage(true);
          await this.operations.fail({
            userId,
            operationId,
            errorCode: 'MODEL_TERMINAL_ERROR',
          });
          operationFailed = true;
        }
        sink.end();
        return;
      }

      actionUsageKind = platformFunded
        ? $Enums.AiUsageKind.OTHER
        : resolveCoachUsageKind(structuredEventsToPersist);
      if (
        operationStarted &&
        actionUsageKind !== $Enums.AiUsageKind.COACH_CHAT
      ) {
        await this.operations.updateKind(userId, operationId, actionUsageKind);
      }

      // Usage 与操作状态均为必需步骤，不能 best-effort 跳过。
      const usageRecordStartedAt = Date.now();
      await persistCoachUsage(true, !platformFunded);
      const usageRecordMs = Date.now() - usageRecordStartedAt;

      const internalStructuredEvents = structuredEventsToPersist.filter(
        // 内部工具调用要按 assistant/tool_result 形态落库，UI-only 工具卡片则合并进最终助手消息。
        (event) =>
          event.type === 'user' ||
          event.message.content.some((block) =>
            coachAssistantBlockIsInternalToolUse(block),
          ),
      );
      const internalPersistStartedAt = Date.now();
      for (const event of internalStructuredEvents) {
        if (event.type === 'assistant') {
          if (!runHandle)
            await this.aiService.coachAppendAssistantTurn({
              branchId: coachBranchId,
              session,
              sid: coachSessionKey,
              lang,
              content: textFromAssistantMessageBody(event.message),
              message: event.message,
            });
          if (coachBranchId) {
            await this.coachBranching.appendBranchMessage({
              userId,
              branchId: coachBranchId,
              role: 'assistant',
              message: event.message,
              allowTerminalWrite: true,
            });
          }
        } else {
          if (!runHandle)
            await this.aiService.coachAppendUserTurn({
              session,
              sid: coachSessionKey,
              lang,
              content: textFromCoachUserMessage(event.message),
              message: event.message,
            });
          if (coachBranchId) {
            await this.coachBranching.appendBranchMessage({
              userId,
              branchId: coachBranchId,
              role: 'user',
              message: event.message,
              allowTerminalWrite: true,
            });
          }
        }
      }
      const internalPersistMs = Date.now() - internalPersistStartedAt;

      const uiAssistantMessages = structuredEventsToPersist
        // 只保留前端会渲染的工具卡片；内部工具调用不应该出现在聊天气泡里。
        .filter((event) => event.type === 'assistant')
        .map((event) => ({
          ...event.message,
          content: event.message.content.filter((block) =>
            coachAssistantBlockIsUiSurface(block),
          ),
        }))
        .filter((message) => message.content.length > 0);
      const assistantPersist = buildAssistantMessageBody({
        prose: assistantText,
        reasoningContent: assistantReasoningText,
        orderedContent: orderedAssistantContent,
        assistantMessages: uiAssistantMessages,
      });

      const abortedByHardCancel =
        abort.signal.aborted && abort.signal.reason !== 'client_disconnected';
      if (
        !abortedByHardCancel &&
        (assistantPersist.content.length > 0 ||
          assistantPersist.message.content.length > 0 ||
          Boolean(assistantPersist.message.reasoning_content?.trim()))
      ) {
        const assistantPersistStartedAt = Date.now();
        if (runHandle) {
          assistantResultMessageId = runHandle.projector.message.id;
          await this.aiService.coachAssistantDelivered({
            userId,
            sid: coachSessionKey,
            branchId: coachBranchId,
            message: assistantPersist.message,
            messageId: assistantResultMessageId,
            skipCompression: true,
          });
        } else
          assistantResultMessageId =
            await this.aiService.coachAppendAssistantTurn({
              branchId: coachBranchId,
              session,
              sid: coachSessionKey,
              lang,
              content: assistantPersist.content,
              message: assistantPersist.message,
            });
        if (coachBranchId) {
          await this.coachBranching.appendBranchMessage({
            userId,
            branchId: coachBranchId,
            role: 'assistant',
            message: assistantPersist.message,
            allowTerminalWrite: true,
          });
        }
        if (runHandle)
          await finishRun(
            runHandle.projector.pendingInteraction
              ? 'awaiting_input'
              : 'completed',
            assistantPersist.message,
          );
        assistantResultPersisted = Boolean(assistantResultMessageId);
        const assistantPersistMs = Date.now() - assistantPersistStartedAt;
        this.logger.debug(
          `[AI][教练][${reqId}] 已保存助手回复 用户ID=${userId} 会话ID=${coachSessionKey} 正文字符数=${assistantText.length} 持久化字符数=${assistantPersist.content.length} 消息块数=${assistantPersist.message.content.length} 分片数=${chunkCount} 持久化耗时毫秒=${assistantPersistMs}`,
        );
      }
      const totalElapsedMs = Date.now() - startedAt;
      const streamLoopMs = Date.now() - streamLoopStartedAt;
      this.logger.log(
        `[AI][教练][${reqId}] 完成 用户ID=${userId} 会话ID=${coachSessionKey} aborted=${abort.signal.aborted ? '是' : 'no'} 耗时毫秒=${totalElapsedMs} 流循环耗时毫秒=${streamLoopMs} 模型阶段耗时毫秒=${modelPhaseMs} 工具阶段耗时毫秒=${toolRunPhaseMs} 运行阶段耗时毫秒=${runningPhaseMs} 首文本增量耗时毫秒=${firstTextDeltaMs ?? -1} 用量记录耗时毫秒=${usageRecordMs} 内部持久化耗时毫秒=${internalPersistMs} 助手字符数=${assistantText.length} reasoning字符数=${assistantReasoningText.length} 持久化字符数=${assistantPersist.content.length} 消息块数=${assistantPersist.message.content.length} 文本分片数=${chunkCount} reasoning分片数=${reasoningChunkCount} 工具开始次数=${toolStartCount} 工具结束次数=${toolEndCount}`,
      );
      if (!assistantResultPersisted) {
        throw new Error('AI_RESULT_NOT_PERSISTED');
      }
      if (platformFunded || isCalendarConfirmation) {
        await sink.emit(
          terminalSuccessEvent ?? {
            type: 'result',
            subtype: 'success',
            is_error: false,
            result: assistantText,
          },
        );
        sink.end();
        return;
      }
      await this.operations.markDelivered({
        userId,
        operationId,
        resultRef: {
          kind: 'COACH_SESSION',
          sid: coachSessionKey,
          messageId: assistantResultMessageId,
          branchId: coachBranchId,
        },
      });
      try {
        const operation = await this.operations.complete(userId, operationId);
        operationCompleted = true;
        await sink.emit({
          ...(terminalSuccessEvent ?? {
            type: 'result' as const,
            subtype: 'success' as const,
            is_error: false,
            result: assistantText,
          }),
          operation: toAiOperationResult(operation, false),
        });
      } catch (completionError) {
        operationCompletionPending = true;
        this.logger.error(
          `[AI][教练][${reqId}] 操作完成状态待恢复 userId=${userId} operationId=${operationId} error=${String(completionError)}`,
        );
        await sink.emit({
          ...(terminalSuccessEvent ?? {
            type: 'result' as const,
            subtype: 'success' as const,
            is_error: false,
            result: assistantText,
          }),
          operation: {
            operationId,
            status: 'RUNNING',
            replayed: false,
            pending: true,
            purpose,
            recovery: {
              kind: 'COACH_SESSION',
              sid: coachSessionKey,
              messageId: assistantResultMessageId,
              branchId: coachBranchId,
            },
          },
        });
      }
      sink.end();
    } catch (err) {
      if (
        operationStarted &&
        !operationCompleted &&
        !operationCompletionPending
      ) {
        await persistCoachUsage().catch(() => undefined);
        try {
          await this.operations.fail({
            userId,
            operationId,
            errorCode: 'AI_OPERATION_FAILED',
          });
          operationFailed = true;
        } catch {
          // finally 会再尝试释放操作锁。
        }
      }
      const fields = unknownErrorFields(err);
      const responseBody =
        err && typeof err === 'object' && 'getResponse' in err
          ? asRecord((err as { getResponse: () => unknown }).getResponse())
          : null;
      const operationErrorCode = String(responseBody?.code ?? '');
      const elapsedMs = Date.now() - startedAt;
      if (operationErrorCode === COACH_QUESTION_STALE_ERROR_CODE) {
        await failTurn({
          code: COACH_QUESTION_STALE_ERROR_CODE,
          message:
            this.i18n.t('common.error.conflict', { lang }) ??
            'The question is no longer pending.',
        });
        return;
      }
      if (operationErrorCode === 'AI_MODEL_PURPOSE_UNAVAILABLE') {
        this.logger.warn(
          `[AI][教练][${reqId}] 模型用途不可用 用户ID=${userId} 用途=${purpose} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${elapsedMs}`,
        );
        await failTurn(modelUnavailable());
        return;
      }
      if (isAiOperationErrorCode(operationErrorCode)) {
        await sink.emit({
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          error_code: operationErrorCode,
          result: operationErrorCode,
          data: responseBody?.data,
        });
        sink.end();
        return;
      }
      if (fields.name === 'AbortError' || abort.signal.aborted) {
        if (sink.isClosed()) {
          return;
        }
        this.logger.warn(
          `[AI][教练][${reqId}] 已中断 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 原因=${String(abort.signal.reason ?? fields.message ?? 'aborted')} 耗时毫秒=${elapsedMs}`,
        );
        if (abort.signal.reason === 'total_timeout') {
          await failTurn(modelUnavailable());
          return;
        }
        const { code, message } = coachSsePayloadForAbort(this.i18n, lang);
        await sink.emit({
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          result: message,
          error_code: code,
        });
        sink.end();
        return;
      }
      if (fields.status === 429 || fields.code === 429) {
        const nested = fields.error;
        const metadata = nested ? asRecord(nested.metadata) : null;
        const rawMsg =
          metadata?.raw ||
          nested?.message ||
          fields.message ||
          'Upstream rate limited';
        this.logger.warn(
          `[AI][教练][${reqId}] 上游限流(429) 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${elapsedMs} msg="${previewText(String(rawMsg), 240)}"`,
        );
        await failTurn(modelUnavailable());
        return;
      }
      if (fields.code === 'AI_COACH_STREAM_IDLE_TIMEOUT') {
        this.logger.warn(
          `[AI][教练][${reqId}] 模型流停滞 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${elapsedMs}`,
        );
        await failTurn(modelUnavailable());
        return;
      }
      if (fields.code === 'AI_COACH_STEP_TIMEOUT') {
        this.logger.warn(
          `[AI][教练][${reqId}] 模型单步达到硬上限 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${elapsedMs}`,
        );
        await failTurn(modelUnavailable());
        return;
      }
      if (err instanceof BusinessException) {
        const body = err.getResponse() as { message?: string };
        const msg =
          String(body?.message ?? '').trim() ||
          this.i18n.t('common.error.internal', { lang });
        this.logger.warn(
          `[AI][教练][${reqId}] 业务异常 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${elapsedMs} msg="${previewText(msg, 240)}"`,
        );
        await failTurn({ code: 'business', message: msg });
        return;
      }
      if (isUpstreamModelError(err)) {
        this.logger.error(
          `[AI][教练][${reqId}] 上游模型调用失败 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 状态=${String(fields.status ?? 'none')} 耗时毫秒=${elapsedMs} msg="${previewText(String(fields.message ?? ''), 240)}"`,
        );
        await failTurn(modelUnavailable());
        return;
      }
      this.logger.error(
        `[AI][教练][${reqId}] SSE 流发生错误 用户ID=${userId} 服务商=${provider ?? 'none'} 模型=${model || 'none'} 耗时毫秒=${elapsedMs}`,
        err,
      );
      await failTurn({
        code: 'internal',
        message:
          this.i18n.t('common.error.internal', { lang }) ??
          'Internal error. Please try again later.',
      });
    } finally {
      // Failed or interrupted platform attempts still retain their actual cost.
      if (platformFunded && (modelUsageEvents.length || lastUsage))
        await persistCoachUsage().catch(() => undefined);
      if (runHeartbeatTimer) clearInterval(runHeartbeatTimer);
      clearRunCheckpointTimer();
      if (v2) {
        try {
          if (runHandle && !runFinished) {
            const reason = abort.signal.reason;
            await finishRun(
              reason === 'user_cancelled' || reason === 'facts_changed'
                ? 'cancelled'
                : reason === 'client_disconnected' ||
                    reason === 'ownership_lost'
                  ? 'interrupted'
                  : 'failed',
            );
          } else if (!runHandle) {
            for (const event of preRunEvents) await rawSink.emit(event);
          }
        } catch (error) {
          this.logger.error(
            `Coach run final checkpoint failed: ${String(error)}`,
          );
        } finally {
          for (const chunk of runClosingChunks)
            await rawSink.emit({ type: 'ui_chunk', chunk });
          rawSink.end();
        }
      }
      if (
        operationStarted &&
        !operationCompleted &&
        !operationFailed &&
        !operationCompletionPending
      ) {
        await persistCoachUsage().catch(() => undefined);
        await this.operations
          .fail({
            userId,
            operationId,
            errorCode: 'AI_OPERATION_INTERRUPTED',
          })
          .catch(() => undefined);
      }
      clearTimeout(totalTimer);
      if (operationHeartbeatTimer) clearInterval(operationHeartbeatTimer);
      sink.offClose(cleanup);
    }
  }
}
