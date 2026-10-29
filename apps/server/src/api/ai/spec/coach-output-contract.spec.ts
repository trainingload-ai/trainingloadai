import { describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { APIConnectionTimeoutError } from 'openai';
import { AiController } from '../ai.controller';
import type { CoachUiStreamYield } from '../core/coach-ui-message-stream';
import { coachQueryYieldsToUIMessageStream } from '../core/coach-ui-message-stream';
import { CoachRunProjector } from '../core/coach-run-projector';
import type { CoachRunHandle } from '../coach-run-store.service';
import { purposeForActualModel } from '../ai-model-catalog';

// Authentication is outside this output-contract test; keep the real controller
// and stream serializers while isolating the ESM-only authentication package.
jest.mock('@thallesp/nestjs-better-auth', () => ({
  Session: () => () => undefined,
}));
jest.mock('@/oauth/oauth-hybrid-auth.guard', () => ({
  OAuthHybridAuthGuard: class {},
}));

const success: CoachUiStreamYield = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: '',
};

const settledSuccess = {
  ...success,
  operation: {
    operationId: 'operation-1',
    status: 'COMPLETED',
    purpose: 'DEFAULT',
    replayed: false,
    pending: false,
    recovery: { kind: 'COACH_SESSION', sid: 'session-1', branchId: null },
    completedAt: '2026-01-01T00:00:00.000Z',
    errorCode: null,
  },
};

async function* fromEvents(events: CoachUiStreamYield[]) {
  yield* events;
}

function setup(events: CoachUiStreamYield[]) {
  const aiService = {
    coachAppendUserTurn: jest.fn(async () => 'session-1'),
    coachAppendAssistantTurn: jest.fn(async (_args: unknown) => 'message-1'),
    coachAssistantDelivered: jest.fn(async () => undefined),
    coachAppendTurnFailure: jest.fn(
      async (_args: unknown) => 'failure-message-1',
    ),
    coachStream: jest.fn(
      async (): Promise<AsyncIterable<CoachUiStreamYield>> =>
        fromEvents(events),
    ),
  };
  const aiUsage = {
    recordUsageEvent: jest.fn(async () => undefined),
    recordUsageEvents: jest.fn(async () => undefined),
  };
  const operation = (overrides: Record<string, unknown> = {}) => ({
    id: 'operation-1',
    userId: 'user-1',
    idempotencyKey: 'operation-1',
    kind: 'COACH_CHAT',
    purpose: 'DEFAULT',
    actualPurposes: ['DEFAULT'],
    status: 'RUNNING',
    resultRef: null,
    completedAt: null,
    errorCode: null,
    metadata: null,
    heartbeatAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2026-01-01T01:00:00.000Z'),
    ...overrides,
  });
  const operations = {
    peekReplay: jest.fn(
      async (): Promise<
        | { replay: false }
        | {
            replay: true;
            operation: ReturnType<typeof operation>;
          }
      > => ({ replay: false }),
    ),
    begin: jest.fn(async () => ({
      replay: false,
      operation: operation(),
    })),
    get: jest.fn(async () => operation()),
    heartbeat: jest.fn(async () => undefined),
    updateKind: jest.fn(async () => undefined),
    markDelivered: jest.fn(async () => operation()),
    complete: jest.fn(async () =>
      operation({
        status: 'COMPLETED',
        completedAt: new Date('2026-01-01T00:00:00.000Z'),
        resultRef: {
          kind: 'COACH_SESSION',
          sid: 'session-1',
          branchId: null,
        },
      }),
    ),
    fail: jest.fn(async () => undefined),
  };
  const logger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const controller = Object.create(AiController.prototype) as AiController;
  const runSnapshots: unknown[] = [];
  const coachRuns = {
    existingRequestBranch: jest.fn(async () => undefined),
    assertLegacyInput: jest.fn(async () => undefined),
    begin: jest.fn(async () => ({
      handle: {
        revision: 0,
        userId: 'user-1',
        sessionId: 'session-1',
        previousExecutionMs: 0,
        projector: new CoachRunProjector({
          run: {
            runId: 'run-1',
            attemptId: 'attempt-1',
            messageId: 'message-1',
            revision: 0,
            status: 'running',
            startedAt: new Date().toISOString(),
            previousExecutionMs: 0,
            executionMs: 0,
          },
        }),
      },
    })),
    checkpoint: jest.fn(async (handle: CoachRunHandle) => {
      runSnapshots.push(
        JSON.parse(JSON.stringify(handle.projector.envelope().message)),
      );
    }),
    heartbeat: jest.fn(async () => null),
  };
  Object.assign(controller, {
    coachRuns,
    aiService,
    aiUsage,
    operations,
    aiDataConsent: { assertGranted: jest.fn(async () => undefined) },
    i18n: { t: (key: string) => key },
    logger,
  });
  const wire: string[] = [];
  const response = Object.assign(new EventEmitter(), {
    writableEnded: false,
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk: string) => {
      wire.push(chunk);
      return true;
    }),
    end: jest.fn(() => {
      response.writableEnded = true;
    }),
  });

  async function run(body: Parameters<AiController['coach']>[2] = {}) {
    await controller.coach(
      'user-1',
      { user: { id: 'user-1' } } as Parameters<AiController['coach']>[1],
      {
        operationId: 'operation-1',
        sid: 'session-1',
        lang: 'zh',
        q: '继续',
        ...body,
      },
      undefined,
      response as unknown as Response,
    );
    expect(response.end).toHaveBeenCalledTimes(1);
    expect(response.listenerCount('close')).toBe(0);
    return wire
      .join('')
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice(5)) as CoachUiStreamYield);
  }

  return {
    run,
    aiService,
    aiUsage,
    operations,
    logger,
    response,
    coachRuns,
    runSnapshots,
  };
}

describe('durable Coach output contract', () => {
  it('publishes the persisted final projection then operation state before closing', async () => {
    const fixture = setup([
      {
        type: 'activity',
        activity: {
          key: 'lookup',
          kind: 'tool',
          labelKey: 'tool',
          status: 'completed',
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'text_delta',
          text: '训练建议',
          modelStepId: 'step-1',
          placement: 'answer',
        },
      },
      success,
    ]);
    const events = await fixture.run({
      protocolVersion: 2,
      runCommand: { kind: 'start', requestId: 'request-1' },
    });
    const chunks = events.flatMap((event) =>
      event.type === 'ui_chunk' ? [event.chunk] : [],
    );
    expect(chunks[0]).toMatchObject({ type: 'start', messageId: 'message-1' });
    expect(chunks.at(-1)).toMatchObject({ type: 'finish' });
    expect(chunks).toContainEqual(
      expect.objectContaining({ type: 'data-coach-operation' }),
    );
    expect(fixture.runSnapshots.at(-1)).toMatchObject({
      version: 2,
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-run',
          data: expect.objectContaining({ status: 'completed' }),
        }),
      ]),
    });
    expect(fixture.aiService.coachAppendAssistantTurn).not.toHaveBeenCalled();
    expect(fixture.operations.begin).toHaveBeenCalledTimes(1);
    expect(fixture.operations.complete).toHaveBeenCalledTimes(1);
  });
});

async function readUiChunks(events: CoachUiStreamYield[]) {
  const reader = coachQueryYieldsToUIMessageStream(
    fromEvents(events),
  ).getReader();
  const chunks: unknown[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
}

const modelUnavailableResult = expect.objectContaining({
  is_error: true,
  error_code: 'model_unavailable',
  result: 'common.error.ai_coach_model_unavailable',
});

describe('AI coach client output contract through the controller', () => {
  it.each([
    ['empty success', [success]],
    ['missing terminal', []],
    [
      'whitespace-only success',
      [
        { type: 'stream_event', event: { type: 'text_delta', text: ' \n' } },
        success,
      ],
    ],
    [
      'reasoning-only success',
      [
        {
          type: 'stream_event',
          event: { type: 'reasoning_delta', text: 'private deliberation' },
        },
        success,
      ],
    ],
  ] satisfies Array<[string, CoachUiStreamYield[]]>)(
    'returns one explicit error and persists a UI-only failure for %s',
    async (_name, events) => {
      const { run, aiService } = setup(events);
      const output = await run();
      expect(output.filter((event) => event.type === 'result')).toEqual([
        modelUnavailableResult,
      ]);
      expect(JSON.stringify(output)).not.toContain('private deliberation');
      expect(aiService.coachAppendUserTurn).toHaveBeenCalledTimes(1);
      expect(aiService.coachAppendAssistantTurn).not.toHaveBeenCalled();
      expect(aiService.coachAppendTurnFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          sid: 'session-1',
          lang: 'zh',
          code: 'model_unavailable',
          content: 'common.error.ai_coach_model_unavailable',
        }),
      );

      // The same guarded events must also become an explicit error in the
      // AI SDK transport, not a successful finish with an empty bubble, and
      // carry the inline failure part the client renders (and retries from).
      const chunks = await readUiChunks(output);
      expect(chunks).toContainEqual({
        type: 'data-coach-turn-error',
        id: 'coach-turn-error',
        data: {
          code: 'model_unavailable',
          message: 'common.error.ai_coach_model_unavailable',
        },
      });
      expect(chunks).toContainEqual({
        type: 'error',
        errorText: 'common.error.ai_coach_model_unavailable',
      });
      expect(chunks).toContainEqual({ type: 'finish', finishReason: 'error' });
    },
  );

  it('delivers and persists a normal text reply', async () => {
    const text: CoachUiStreamYield = {
      type: 'stream_event',
      event: { type: 'text_delta', text: '已读取你的同步配置。' },
    };
    const { run, aiService, aiUsage, operations } = setup([text, success]);
    expect(await run()).toEqual([text, settledSuccess]);
    expect(aiService.coachAppendAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({ content: '已读取你的同步配置。' }),
    );
    expect(aiUsage.recordUsageEvent).toHaveBeenCalledTimes(1);
    expect(operations.markDelivered).toHaveBeenCalledWith(
      expect.objectContaining({
        resultRef: {
          kind: 'COACH_SESSION',
          sid: 'session-1',
          messageId: 'message-1',
          branchId: null,
        },
      }),
    );
  });

  it('records every actual model call with its resolved purpose', async () => {
    const text: CoachUiStreamYield = {
      type: 'stream_event',
      event: { type: 'text_delta', text: '已完成深度分析。' },
    };
    const retriedFlash: CoachUiStreamYield = {
      type: 'model_usage',
      usage: { promptTokens: 1000, outputTokens: 100 },
      provider: 'deepseek',
      model: 'deepseek-flash',
      status: 'RETRY',
    };
    const deliveredPro: CoachUiStreamYield = {
      type: 'model_usage',
      usage: { promptTokens: 2000, outputTokens: 500 },
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      status: 'SUCCESS',
    };
    const { run, aiUsage, operations } = setup([
      text,
      retriedFlash,
      deliveredPro,
      success,
    ]);

    expect(await run({ purpose: 'REASONING' })).toEqual([text, {
      ...settledSuccess,
      operation: { ...settledSuccess.operation, purpose: 'DEFAULT' },
    }]);
    const flashPurpose = purposeForActualModel({
      provider: 'deepseek',
      modelId: 'deepseek-flash',
      requestedPurpose: 'REASONING',
    });
    const proPurpose = purposeForActualModel({
      provider: 'deepseek',
      modelId: 'deepseek-v4-pro',
      requestedPurpose: 'REASONING',
    });
    expect(aiUsage.recordUsageEvent.mock.calls).toEqual([
      [
        expect.objectContaining({
          model: 'deepseek-flash',
          purpose: flashPurpose,
          status: 'RETRY',
        }),
      ],
      [
        expect.objectContaining({
          model: 'deepseek-v4-pro',
          purpose: proPurpose,
          status: 'SUCCESS',
        }),
      ],
    ]);
    expect(operations.complete).toHaveBeenCalledTimes(1);
  });

  it('accepts and persists a question card without requiring prose', async () => {
    const card: CoachUiStreamYield = {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'question-1',
            name: 'AskUserQuestion',
            input: {
              questions: [
                {
                  id: 'provider',
                  header: '同步平台',
                  question: '你要查看哪个平台的同步配置？',
                  options: [
                    { label: 'Garmin', value: 'garmin' },
                    { label: 'Strava', value: 'strava' },
                  ],
                },
              ],
            },
          },
        ],
      },
    };
    const { run, aiService } = setup([card, success]);
    expect(await run()).toEqual([card, settledSuccess]);
    expect(aiService.coachAppendAssistantTurn).toHaveBeenCalledTimes(1);
    expect(aiService.coachAppendAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({ message: card.message }),
    );
  });

  it('preserves the unsafe-output error instead of replacing it with an empty error', async () => {
    const blocked: CoachUiStreamYield = {
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      error_code: 'unsafe_ai_output_blocked',
      result: '本次回答生成异常，已停止输出。请重试。',
    };
    const { run, aiService } = setup([blocked]);
    expect(await run()).toEqual([blocked]);
    expect(aiService.coachAppendAssistantTurn).not.toHaveBeenCalled();
    expect(aiService.coachAppendTurnFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '本次回答生成异常，已停止输出。请重试。',
        code: 'unsafe_ai_output_blocked',
      }),
    );
  });

  it('records completed upstream calls as platform cost when delivery fails', async () => {
    const usage: CoachUiStreamYield = {
      type: 'model_usage',
      usage: { promptTokens: 1200, outputTokens: 80 },
      provider: 'deepseek',
      model: 'deepseek-flash',
      status: 'SUCCESS',
    };
    const blocked: CoachUiStreamYield = {
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      error_code: 'unsafe_ai_output_blocked',
      result: '本次回答生成异常，已停止输出。请重试。',
    };
    const { run, aiUsage, operations } = setup([usage, blocked]);

    expect(await run()).toEqual([blocked]);
    expect(aiUsage.recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'deepseek-flash',
        status: 'SUCCESS',
      }),
    );
    expect(operations.complete).not.toHaveBeenCalled();
    expect(operations.fail).toHaveBeenCalledTimes(1);
  });

  it('does not request a model reply or synthesize an error for a saved-draft receipt', async () => {
    const { run, aiService } = setup([]);
    expect(
      await run({
        q: '',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'draft-1',
              content: { kind: 'coach_plan_draft_saved', planId: 'plan-1' },
            },
          ],
        },
      }),
    ).toEqual([]);
    expect(aiService.coachAppendUserTurn).toHaveBeenCalledTimes(1);
    expect(aiService.coachStream).not.toHaveBeenCalled();
    expect(aiService.coachAppendAssistantTurn).not.toHaveBeenCalled();
  });

  it('persists the user turn before model admission so a failed first send is recoverable', async () => {
    const { run, aiService, operations, logger } = setup([]);
    const callOrder: string[] = [];
    aiService.coachAppendUserTurn = jest.fn(async () => {
      callOrder.push('append');
      return 'session-1';
    });
    operations.begin = jest.fn(async () => {
      callOrder.push('begin');
      throw Object.assign(new Error('AI_MODEL_PURPOSE_UNAVAILABLE'), {
        getResponse: () => ({ code: 'AI_MODEL_PURPOSE_UNAVAILABLE' }),
      });
    });

    const output = await run({ q: '你好' });

    expect(callOrder).toEqual(['append', 'begin']);
    expect(aiService.coachAppendUserTurn).toHaveBeenCalledWith(
      expect.objectContaining({ content: '你好', sid: 'session-1' }),
    );
    expect(aiService.coachStream).not.toHaveBeenCalled();
    // An unavailable tier is a model failure for the athlete: one actionable
    // error (switch model, retry), logged and persisted for refresh.
    expect(output.filter((event) => event.type === 'result')).toEqual([
      modelUnavailableResult,
    ]);
    expect(aiService.coachAppendTurnFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'model_unavailable' }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('模型用途不可用'),
    );
  });

  it.each([
    ['an SDK timeout', new APIConnectionTimeoutError()],
    [
      'a provider HTTP error',
      Object.assign(new Error('503 Service Unavailable'), { status: 503 }),
    ],
    [
      'an upstream rate limit',
      Object.assign(new Error('429'), { status: 429 }),
    ],
    [
      'a stalled stream',
      Object.assign(new Error('idle'), {
        code: 'AI_COACH_STREAM_IDLE_TIMEOUT',
      }),
    ],
    [
      'a step hard timeout',
      Object.assign(new Error('step'), { code: 'AI_COACH_STEP_TIMEOUT' }),
    ],
  ])(
    'turns %s into a persisted model-unavailable failure',
    async (_name, error) => {
      const { run, aiService, operations, logger } = setup([]);
      aiService.coachStream = jest.fn(async () => {
        throw error;
      });

      const output = await run({ q: '今天怎么练' });

      expect(output.filter((event) => event.type === 'result')).toEqual([
        modelUnavailableResult,
      ]);
      expect(aiService.coachAppendTurnFailure).toHaveBeenCalledTimes(1);
      expect(aiService.coachAppendTurnFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          sid: 'session-1',
          code: 'model_unavailable',
          content: 'common.error.ai_coach_model_unavailable',
        }),
      );
      expect(
        logger.warn.mock.calls.length + logger.error.mock.calls.length,
      ).toBeGreaterThan(0);
      expect(operations.complete).not.toHaveBeenCalled();
      expect(operations.fail).toHaveBeenCalledTimes(1);
    },
  );

  it('persists an unexpected server error as an internal failure', async () => {
    const { run, aiService, logger } = setup([]);
    aiService.coachStream = jest.fn(async () => {
      throw new TypeError('boom');
    });

    const output = await run();

    expect(output.filter((event) => event.type === 'result')).toEqual([
      expect.objectContaining({
        is_error: true,
        error_code: 'internal',
        result: 'common.error.internal',
      }),
    ]);
    expect(aiService.coachAppendTurnFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'internal',
        content: 'common.error.internal',
      }),
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('does not persist a failure when the client disconnects', async () => {
    const { run, aiService, response } = setup([]);
    aiService.coachStream = jest.fn(async () => {
      response.emit('close');
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });

    await run();

    expect(aiService.coachAppendTurnFailure).not.toHaveBeenCalled();
  });

  it('does not call the model after operation admission fails', async () => {
    const { run, aiService, operations } = setup([]);
    operations.begin = jest.fn(async () => {
      throw Object.assign(new Error('AI_OPERATION_REJECTED'), {
        getResponse: () => ({ code: 'AI_OPERATION_REJECTED' }),
      });
    });

    const output = await run();

    expect(output.filter((event) => event.type === 'result')).toEqual([
      expect.objectContaining({
        is_error: true,
        error_code: 'internal',
      }),
    ]);
    expect(aiService.coachStream).not.toHaveBeenCalled();
  });

  it('does not append a user turn when replaying a completed operation', async () => {
    const { run, aiService, operations } = setup([]);
    operations.peekReplay = jest.fn(async () => ({
      replay: true as const,
      operation: {
        id: 'operation-1',
        userId: 'user-1',
        idempotencyKey: 'operation-1',
        kind: 'COACH_CHAT',
        purpose: 'DEFAULT',
        actualPurposes: ['DEFAULT'],
        status: 'COMPLETED',
        resultRef: { kind: 'COACH_SESSION', sid: 'session-1' },
        completedAt: new Date('2026-01-01T00:00:00.000Z'),
        errorCode: null,
        metadata: null,
        heartbeatAt: new Date('2026-01-01T00:00:00.000Z'),
        expiresAt: new Date('2026-01-01T01:00:00.000Z'),
      },
    }));

    const output = await run({ q: '你好' });

    expect(aiService.coachAppendUserTurn).not.toHaveBeenCalled();
    expect(operations.begin).not.toHaveBeenCalled();
    expect(aiService.coachStream).not.toHaveBeenCalled();
    expect(output.filter((event) => event.type === 'result')).toEqual([
      expect.objectContaining({
        is_error: false,
        operation: expect.objectContaining({
          replayed: true,
          status: 'COMPLETED',
        }),
      }),
    ]);
  });
});
