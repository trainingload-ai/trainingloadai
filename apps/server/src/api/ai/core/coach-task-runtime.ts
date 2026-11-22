import { ConflictException, type Logger } from '@nestjs/common';
import { AiUsageKind } from '@prisma/client';
import type { AiModelPurpose } from '@shared/ai-model';
import { randomUUID } from 'node:crypto';
import { resolveAiModel } from '../ai-model-catalog';
import type { AiOperationLedger } from '../ai-operation-ledger.port';
import { parseOpenAIUsage, type AiUsageService } from '../ai-usage.service';
import {
  CoachRunCancelledError,
  type CoachRunStore,
} from '../coach-run-store.service';
import { sha256Hex, stableJson } from './ai-common.util';
import type { CoachQueryYield } from './coach-query-yield';
import type { CoachTurnInput } from './coach-turn-input';
import { getCoachSkillByName } from './skill.registry';

type CoachTaskRuntime = {
  runs: CoachRunStore;
  operations: AiOperationLedger;
  usage: AiUsageService;
  logger: Logger;
  getModel: (options?: { thinking?: boolean }) => string;
  runTurn: (
    params: CoachTurnInput,
  ) => Promise<AsyncGenerator<CoachQueryYield, void, undefined>>;
};

type BackgroundCoachTaskRun<T> = {
  result: T;
  usage: ReturnType<typeof parseOpenAIUsage>;
  provider: string | null;
  model: string;
  runId: string;
  /** Durable run audit identity; not necessarily a billable operation. */
  operationId: string;
  billingOperationId: string | null;
  replayed: boolean;
  awaitingInput?: boolean;
  sessionId?: string;
};

type AnonymousCoachTaskRun<T> = {
  result: T;
  usage: ReturnType<typeof parseOpenAIUsage>;
  provider: string | null;
  model: string;
};

export class AnonymousCoachTaskExecutionError extends Error {
  constructor(
    cause: unknown,
    readonly usage: ReturnType<typeof parseOpenAIUsage>,
  ) {
    super(
      cause instanceof Error
        ? cause.message
        : String(cause || 'ANONYMOUS_COACH_TASK_FAILED'),
    );
    this.name = 'AnonymousCoachTaskExecutionError';
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

function aggregateCoachUsage(events: unknown[]) {
  const parsed = events.map((usage) => parseOpenAIUsage(usage));
  return {
    inputTokens: parsed.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: parsed.reduce((sum, item) => sum + item.outputTokens, 0),
    cachedInputTokens: parsed.reduce(
      (sum, item) => sum + item.cachedInputTokens,
      0,
    ),
    reported: parsed.some((item) => item.reported),
  };
}

/**
 * Execute a hidden, server-owned coach task through the same ToolLoopAgent as chat.
 * The caller owns scheduling. This method owns the durable run/attempt timeline,
 * AI operation lifecycle, reasoning, tools, result validation and usage aggregation.
 */
export async function executeBackgroundCoachTask<T>(
  runtime: CoachTaskRuntime,
  params: {
    userId: string;
    lang: string;
    taskType: string;
    activeSkillName: string;
    instructions: string;
    validateResult: (result: unknown) => T;
    /** Stable logical identity. When omitted, the complete task input is hashed. */
    dedupeKey?: string;
    triggerType?: string;
    triggerRef?: string;
    /** Task-specific read-tool allowlist. Defaults to the skill's suggestions. */
    allowedToolNames?: readonly string[];
    /** Evidence tools that must complete before structured result submission. */
    requiredToolNames?: readonly string[];
    resumeHistory?: boolean;
    allowUserInteraction?: boolean;
    resultToolName?: string;
    signal?: AbortSignal;
    allowWithoutConsent?: boolean;
    usageKind?: AiUsageKind;
    /** Optional task-specific model override. */
    model?: string;
    /** Provider-neutral model purpose used by the shared model catalog. */
    modelPurpose?: AiModelPurpose;
    /**
     * Who funds this background run. Platform-funded tasks keep the complete
     * CoachRun and usage audit trail, but never enter the user's AI operation
     * admission, credit reservation, or settlement lifecycle.
     */
    funding?: 'USER' | 'PLATFORM';
    /**
     * An API surface may already own admission/delivery/settlement for this
     * operation. Reuse that id for the CoachRun attempt without admitting or
     * settling a second operation.
     */
    callerManagedOperationId?: string;
  },
): Promise<BackgroundCoachTaskRun<T>> {
  const activeSkill = getCoachSkillByName(params.activeSkillName);
  if (!activeSkill) {
    throw new Error(
      `Unknown background coach skill: ${params.activeSkillName}`,
    );
  }
  const allowedToolNames =
    params.allowedToolNames ?? activeSkill.suggestedTools;
  const requiredToolNames = [...new Set(params.requiredToolNames ?? [])];
  const unavailableRequiredTool = requiredToolNames.find(
    (toolName) => !allowedToolNames.includes(toolName),
  );
  if (unavailableRequiredTool) {
    throw new Error(
      `Required background tool is not allowed: ${unavailableRequiredTool}`,
    );
  }
  const prompt = [
    'This is a server-owned background coach task, not an interactive user message.',
    'Use the normal Coach tools to inspect authoritative facts. Do not assume missing training means rest before checking data coverage.',
    params.allowUserInteraction
      ? 'Use ask_user_question only for necessary athlete facts unavailable to read tools. Otherwise submit the structured result. Never modify plans.'
      : 'Do not call mutation or UI presentation tools. Do not write a conversational answer.',
    params.resultToolName
      ? `Finish by calling ${params.resultToolName} exactly once with the complete task-specific result, or wait for an explicitly permitted user question.`
      : 'Finish by calling coach_task_submit_result exactly once with the complete task-specific result.',
    `Task type: ${params.taskType}`,
    params.instructions,
  ].join('\n\n');
  const platformFunded = params.funding === 'PLATFORM';
  const explicitModel = String(params.model ?? '').trim();
  const model =
    explicitModel ||
    (platformFunded
      ? resolveAiModel(params.modelPurpose ?? 'DEFAULT').modelId
      : runtime.getModel({
          thinking: params.modelPurpose === 'REASONING',
        }));
  const usageKind = params.usageKind ?? AiUsageKind.OTHER;
  const inputHash = sha256Hex(
    stableJson({
      taskType: params.taskType,
      funding: params.funding ?? 'USER',
      activeSkillName: params.activeSkillName,
      lang: params.lang,
      model,
      allowedToolNames: [...allowedToolNames],
      requiredToolNames,
      ...(params.resumeHistory ? { resumeHistory: true } : {}),
      ...(params.allowUserInteraction ? { allowUserInteraction: true } : {}),
      ...(params.resultToolName
        ? { resultToolName: params.resultToolName }
        : {}),
      instructions: prompt,
    }),
  );
  const dedupeKey = params.dedupeKey?.trim() || inputHash;
  const callerManagedOperationId = String(
    params.callerManagedOperationId ?? '',
  ).trim();
  if (platformFunded && callerManagedOperationId)
    throw new Error('PLATFORM_TASK_CANNOT_USE_USER_OPERATION');
  const ownsUserOperation = !platformFunded && !callerManagedOperationId;
  const operationId = callerManagedOperationId || randomUUID();
  const begun = await runtime.runs.beginBackground({
    userId: params.userId,
    taskKind: params.taskType,
    lang: params.lang,
    instructions: prompt,
    dedupeKey,
    inputHash,
    operationId,
    triggerType: params.triggerType,
    triggerRef: params.triggerRef,
  });

  if (begun.replay) {
    const stored = begun.replay.result;
    const replayedResult = params.validateResult(stored.result);
    if (ownsUserOperation) {
      const storedOperation = begun.replay.operationId
        ? await runtime.operations.get(params.userId, begun.replay.operationId)
        : null;
      if (
        storedOperation &&
        storedOperation.status !== 'COMPLETED' &&
        storedOperation.status !== 'FAILED'
      ) {
        await runtime.operations.markDelivered({
          userId: params.userId,
          operationId: storedOperation.id,
          resultRef: {
            kind: 'BACKGROUND_COACH_RUN',
            runId: begun.replay.runId,
            taskKind: params.taskType,
          },
        });
        await runtime.operations.complete(params.userId, storedOperation.id);
      }
    }
    return {
      result: replayedResult,
      usage: parseOpenAIUsage(stored.usage),
      provider: stored.provider,
      model: stored.model,
      runId: begun.replay.runId,
      operationId: callerManagedOperationId || begun.replay.operationId,
      billingOperationId: platformFunded
        ? null
        : callerManagedOperationId || begun.replay.operationId,
      replayed: true,
    };
  }

  const handle = begun.handle;
  if (!handle) throw new Error('BACKGROUND_COACH_RUN_NOT_STARTED');
  const runId = handle.projector.run.runId;
  const attemptId = handle.projector.run.attemptId;
  if (ownsUserOperation) {
    let admission: Awaited<ReturnType<AiOperationLedger['begin']>>;
    try {
      admission = await runtime.operations.begin({
        userId: params.userId,
        operationId: handle.operationId,
        idempotencyKey: `background:${runId}:${attemptId}`,
        kind: usageKind,
        purpose: 'DEFAULT',
        metadata: {
          taskKind: params.taskType,
          runId,
          attemptId,
          requestFingerprint: inputHash,
        },
      });
    } catch (error) {
      handle.projector.finish('failed');
      await runtime.runs.checkpoint(handle, 'failed').catch(() => undefined);
      throw error;
    }
    if (admission.replay) {
      handle.projector.finish('failed');
      await runtime.runs.checkpoint(handle, 'failed').catch(() => undefined);
      throw new ConflictException(
        `Background Coach operation was already admitted with status ${admission.operation.status}`,
      );
    }
  }

  let submitted: T | undefined;
  const usageEvents: unknown[] = [];
  let provider: string | null = null;
  let actualModel = model;
  let finalized = false;
  let projectionQueue: Promise<void> = Promise.resolve();
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(params.signal?.reason);
  if (params.signal?.aborted) forwardAbort();
  else params.signal?.addEventListener('abort', forwardAbort, { once: true });
  const project = (event: CoachQueryYield) => {
    const write = projectionQueue.then(async () => {
      const chunks = handle.projector.consume(event);
      if (
        chunks.length > 0 ||
        event.type === 'assistant' ||
        event.type === 'user'
      ) {
        await runtime.runs.checkpoint(handle);
      }
    });
    projectionQueue = write.catch(() => undefined);
    return write;
  };
  const heartbeat = setInterval(() => {
    void (async () => {
      const reason = await runtime.runs.heartbeat(handle);
      if (!platformFunded) {
        await runtime.operations.heartbeat(params.userId, handle.operationId);
      }
      if (reason) controller.abort(reason);
    })().catch(() => controller.abort('background_heartbeat_failed'));
  }, 15_000);

  try {
    const completedToolNames = new Set<string>();
    const stream = await runtime.runTurn({
      session: { user: { id: params.userId } },
      sid: handle.sessionId,
      lang: params.lang,
      prompt,
      intent: params.activeSkillName,
      operationId: handle.operationId,
      executionMode: 'background',
      resumeHistory: params.resumeHistory,
      runtimeRunId: runId,
      platformFunded,
      activeSkillName: params.activeSkillName,
      backgroundTask: {
        taskType: params.taskType,
        resultToolName: params.resultToolName,
        allowedToolNames,
        requiredToolNames,
        completedToolNames,
        submitResult: (raw) => {
          submitted = params.validateResult(raw);
        },
      },
      allowWithoutConsent: params.allowWithoutConsent,
      usageKind,
      model: params.model,
      signal: controller.signal,
      onActivity: async (activity) => {
        await project({ type: 'activity', activity });
      },
    });
    for await (const event of stream) {
      await project(event);
      if (event.type === 'model_usage' && event.status === 'SUCCESS') {
        usageEvents.push(event.usage);
        provider = event.provider ?? provider;
        actualModel = event.model || actualModel;
      }
      if (event.type === 'result' && event.is_error) {
        throw new Error(event.error_code ?? 'BACKGROUND_COACH_TASK_FAILED');
      }
    }
    await projectionQueue;
    const awaitingInput =
      submitted === undefined &&
      params.allowUserInteraction === true &&
      Boolean(handle.projector.pendingInteraction);
    if (submitted === undefined && !awaitingInput) {
      throw new Error('BACKGROUND_COACH_TASK_RESULT_MISSING');
    }
    const usage = aggregateCoachUsage(usageEvents);
    const resultRef = {
      resultType: params.taskType,
      result: submitted,
      usage,
      provider,
      model: actualModel,
    };
    // User-funded usage must exist before its Managed operation is settled.
    // Platform-funded tasks deliberately persist a null operationId: Managed
    // accounting records the model cost against the platform while keeping
    // the CoachRun attempt id as the durable audit identity.
    await runtime.usage.recordUsageEvent({
      userId: params.userId,
      operationId: platformFunded ? null : handle.operationId,
      callKey: `${handle.operationId}:background-aggregate`,
      kind: usageKind,
      provider,
      model: actualModel,
      usage,
      sid: handle.sessionId,
      entityId: params.triggerRef ?? null,
    });
    handle.projector.finish(awaitingInput ? 'awaiting_input' : 'completed');
    await runtime.runs.checkpoint(
      handle,
      awaitingInput ? 'awaiting_input' : 'completed',
      undefined,
      {
        resultType: params.taskType,
        resultRef,
      },
    );
    finalized = true;
    if (ownsUserOperation) {
      await runtime.operations.markDelivered({
        userId: params.userId,
        operationId: handle.operationId,
        resultRef: {
          kind: 'BACKGROUND_COACH_RUN',
          runId,
          taskKind: params.taskType,
        },
      });
      try {
        await runtime.operations.complete(params.userId, handle.operationId);
      } catch (operationError) {
        runtime.logger.warn(
          `[AI][background] run completed before operation settlement task=${params.taskType} run=${runId} operation=${handle.operationId} error=${String(operationError)}`,
        );
      }
    }
    return {
      result: submitted,
      awaitingInput,
      sessionId: handle.sessionId,
      usage,
      provider,
      model: actualModel,
      runId,
      operationId: handle.operationId,
      billingOperationId: platformFunded ? null : handle.operationId,
      replayed: false,
    };
  } catch (error) {
    await projectionQueue.catch(() => undefined);
    if (!finalized) {
      try {
        if (
          !(error instanceof CoachRunCancelledError && error.terminalChunks)
        ) {
          handle.projector.finish('failed');
          await runtime.runs.checkpoint(handle, 'failed');
        }
      } catch (checkpointError) {
        runtime.logger.error(
          `[AI][background] failed to persist terminal run task=${params.taskType} run=${runId} error=${String(checkpointError)}`,
        );
      }
      if (ownsUserOperation) {
        await runtime.operations
          .fail({
            userId: params.userId,
            operationId: handle.operationId,
            errorCode:
              error instanceof Error
                ? error.message.slice(0, 120)
                : 'BACKGROUND_COACH_TASK_FAILED',
          })
          .catch(() => undefined);
      }
    }
    throw error;
  } finally {
    clearInterval(heartbeat);
    params.signal?.removeEventListener('abort', forwardAbort);
  }
}

/**
 * Run an account-less task through the same ToolLoopAgent and Skill runtime.
 *
 * Anonymous marketing tools have no T_user, CoachSession, or AiOperation to
 * attach to. Their caller owns quota, cancellation, and durable audit state;
 * this method owns the model loop, capability envelope, terminal result
 * validation, provider fallback, and aggregate usage.
 */
export async function executeAnonymousCoachTask<T>(
  runtime: Pick<CoachTaskRuntime, 'runTurn' | 'getModel' | 'logger'>,
  params: {
    lang: string;
    taskType: string;
    activeSkillName: string;
    instructions: string;
    validateResult: (result: unknown) => T;
    allowedToolNames?: readonly string[];
    signal?: AbortSignal;
    model?: string;
    requestRef?: string;
  },
): Promise<AnonymousCoachTaskRun<T>> {
  const activeSkill = getCoachSkillByName(params.activeSkillName);
  if (!activeSkill) {
    throw new Error(`Unknown anonymous coach skill: ${params.activeSkillName}`);
  }
  const allowedToolNames = params.allowedToolNames ?? [];
  const prompt = [
    'This is a server-owned anonymous coach task, not an interactive user message.',
    'The caller supplies the complete evidence snapshot. Do not query or mutate account data.',
    'Do not ask the visitor a question and do not write a conversational answer.',
    'Finish by calling coach_task_submit_result exactly once with the complete task-specific result.',
    `Task type: ${params.taskType}`,
    params.instructions,
  ].join('\n\n');
  const fallbackModel = String(params.model ?? '').trim() || runtime.getModel();
  let submitted: T | undefined;
  const usageEvents: unknown[] = [];
  let provider: string | null = null;
  let actualModel = fallbackModel;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(params.signal?.reason);
  if (params.signal?.aborted) forwardAbort();
  else params.signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const stream = await runtime.runTurn({
      session: { user: { id: '' } },
      sid: `anonymous:${params.taskType}`,
      lang: params.lang,
      prompt,
      intent: params.activeSkillName,
      executionMode: 'background',
      activeSkillName: params.activeSkillName,
      backgroundTask: {
        taskType: params.taskType,
        allowedToolNames,
        submitResult: (raw) => {
          submitted = params.validateResult(raw);
        },
      },
      allowWithoutConsent: true,
      usageKind: AiUsageKind.OTHER,
      model: params.model,
      signal: controller.signal,
    });
    for await (const event of stream) {
      if (event.type === 'model_usage' && event.status === 'SUCCESS') {
        usageEvents.push(event.usage);
        provider = event.provider ?? provider;
        actualModel = event.model || actualModel;
      }
      if (event.type === 'result' && event.is_error) {
        throw new Error(event.error_code ?? 'ANONYMOUS_COACH_TASK_FAILED');
      }
    }
    if (submitted === undefined) {
      throw new Error('ANONYMOUS_COACH_TASK_RESULT_MISSING');
    }
    const usage = aggregateCoachUsage(usageEvents);
    runtime.logger.log(
      `[AI][anonymous-background] completed task=${params.taskType} request=${params.requestRef ?? 'untracked'} model=${actualModel}`,
    );
    return { result: submitted, usage, provider, model: actualModel };
  } catch (error) {
    throw new AnonymousCoachTaskExecutionError(
      error,
      aggregateCoachUsage(usageEvents),
    );
  } finally {
    params.signal?.removeEventListener('abort', forwardAbort);
  }
}
