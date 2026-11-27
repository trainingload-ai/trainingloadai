import { describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { APIConnectionTimeoutError } from 'openai';
import { ConflictException } from '@nestjs/common';
import { COACH_QUESTION_STALE_ERROR_CODE } from '@shared/coach-turn-error';
import { AiController } from '../ai.controller';
import { CoachTurnOrchestrator } from '../coach-turn-orchestrator.service';
import type { AiService } from '../ai.service';
import type { CoachActivityEvent, CoachRunStatus } from '@shared/ai-coach-run-contract';
import type { CoachUiStreamYield } from '../core/coach-ui-message-stream';
import { coachQueryYieldsToUIMessageStream } from '../core/coach-ui-message-stream';
import { CoachRunProjector } from '../core/coach-run-projector';
import type { CoachRunHandle } from '../coach-run-store.service';
import { purposeForActualModel } from '../ai-model-catalog';
import { aiOperationError } from '../ai-operation.error';
import type { PlanStartService } from '../../plan/application/plan-start.service';

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
      async (
        _input: Parameters<AiService['coachStream']>[0],
      ): Promise<AsyncIterable<CoachUiStreamYield>> =>
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
  const checkpoint = async (handle: CoachRunHandle) => {
    runSnapshots.push(JSON.parse(JSON.stringify(handle.projector.envelope().message)));
  };
  const coachRuns = {
    existingRequestBranch: jest.fn(async () => undefined),
    recoverStaleOperation: jest.fn(async (_userId: string, _operationId: string) => false),
    assertLegacyInput: jest.fn(async () => undefined),
    begin: jest.fn(async () => ({
      handle: {
        revision: 0,
        userId: 'user-1',
        sessionId: 'session-1',
        operationId: 'operation-1',
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
    checkpointStreamTerminal: jest.fn(async (handle: CoachRunHandle, _status?: CoachRunStatus) =>
      checkpoint(handle),
    ),
    checkpointStreamProgress: jest.fn(checkpoint),
    checkpointMutationStart: jest.fn(async (
      handle: CoachRunHandle, activity: CoachActivityEvent,
    ) => {
      const chunks = handle.projector.consume({ type: 'activity', activity });
      await checkpoint(handle);
      return chunks;
    }),
    recordLateOutcome: jest.fn(async (
      _handle: CoachRunHandle, _activity: CoachActivityEvent,
    ) => undefined),
    heartbeat: jest.fn(async (): Promise<'user_cancelled' | 'ownership_lost' | null> => null),
  };
  const planStarts = {
    calendarCoachSession: jest.fn<PlanStartService['calendarCoachSession']>(),
  };
  const coachTurns = Object.assign(Object.create(CoachTurnOrchestrator.prototype), {
    prisma: {
      aiCoachSession: { findUnique: jest.fn(async () => null) },
    },
    coachRuns,
    planStarts,
    coachBranching: { appendBranchMessage: jest.fn(async () => undefined) },
    aiService,
    aiUsage,
    operations,
    aiDataConsent: { assertGranted: jest.fn(async () => undefined) },
    i18n: { t: (key: string) => key },
    logger,
  });
  Object.assign(controller, { coachTurns, i18n: { t: (key: string) => key }, logger });
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
    planStarts,
    runSnapshots,
  };
}

describe('durable Coach output contract', () => {
  it('renews an idle streaming attempt every five seconds without checkpointing', async () => {
    jest.useFakeTimers();
    const fixture = setup([]);
    const streaming = deferred<void>();
    const finish = deferred<void>();
    async function* idleStream() {
      streaming.resolve();
      await finish.promise;
      yield success;
    }
    fixture.aiService.coachStream.mockImplementationOnce(async () => idleStream());
    const completion = fixture.run({
      protocolVersion: 2,
      runCommand: { kind: 'start', requestId: 'idle-heartbeat' },
    });

    try {
      await streaming.promise;
      await jest.advanceTimersByTimeAsync(4_999);
      expect(fixture.coachRuns.heartbeat).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(fixture.coachRuns.heartbeat).toHaveBeenCalledTimes(1);
      expect(fixture.runSnapshots).toHaveLength(1);
    } finally {
      finish.resolve();
      await completion;
      jest.useRealTimers();
    }
  });

  it('coalesces text and read-tool progress while persisting write-tool receipts immediately', async () => {
    jest.useFakeTimers();
    const fixture = setup([]);
    const progress = deferred<void>();
    const startWrite = deferred<void>();
    const writeStarted = deferred<void>();
    const writeCompleted = deferred<void>();
    const completeWrite = deferred<void>();
    const finish = deferred<void>();
    const readTool = {
      key: 'read', kind: 'tool', labelKey: 'tool', toolCallId: 'read-1',
    } as const;
    const writeTool = {
      key: 'write',
      kind: 'tool',
      labelKey: 'tool',
      mutation: true,
      toolCallId: 'write-1',
    } as const;
    async function* stream(
      onActivity: Parameters<AiService['coachStream']>[0]['onActivity'],
    ): AsyncGenerator<CoachUiStreamYield> {
      yield { type: 'stream_event', event: { type: 'text_delta', text: 'Plan ready.' } };
      yield { type: 'assistant', message: { content: [
        { type: 'tool_use', id: 'read-1', name: 'training_test', input: {} },
      ] } };
      for (const status of ['queued', 'running', 'completed'] as const)
        await onActivity({ ...readTool, status });
      yield { type: 'user', message: { content: [
        { type: 'tool_result', tool_use_id: 'read-1', content: { ok: true } },
      ] } };
      yield { type: 'assistant', message: { content: [
        { type: 'tool_use', id: 'pmc', name: 'PmcRange', input: {} },
        { type: 'tool_use', id: 'zones', name: 'ProfileZones', input: {} },
      ] } };
      progress.resolve();
      await startWrite.promise;
      await onActivity({ ...writeTool, status: 'running' });
      writeStarted.resolve();
      await completeWrite.promise;
      await onActivity({ ...writeTool, status: 'completed' });
      writeCompleted.resolve();
      await finish.promise;
      yield success;
    }
    fixture.aiService.coachStream.mockImplementationOnce(async ({ onActivity }) =>
      stream(onActivity),
    );
    const completion = fixture.run({
      protocolVersion: 2,
      runCommand: { kind: 'start', requestId: 'coalesced-progress' },
    });

    try {
      await progress.promise;
      expect(fixture.response.write.mock.calls.flat().join('')).toContain('Plan ready.');
      expect(fixture.response.write.mock.calls.flat().join('')).toContain('PmcRange');
      expect(fixture.coachRuns.heartbeat.mock.calls).toHaveLength(0);
      expect(fixture.runSnapshots).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1_999);
      expect(fixture.runSnapshots).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(fixture.runSnapshots).toHaveLength(2);
      expect(fixture.runSnapshots.at(-1)).toMatchObject({
        parts: expect.arrayContaining([expect.objectContaining({
          type: 'text',
          text: 'Plan ready.',
        })]),
      });

      startWrite.resolve();
      await writeStarted.promise;
      expect(fixture.runSnapshots).toHaveLength(3);
      completeWrite.resolve();
      await writeCompleted.promise;
      expect(fixture.runSnapshots).toHaveLength(4);
      expect(fixture.runSnapshots.at(-1)).toMatchObject({
        parts: expect.arrayContaining([expect.objectContaining({
          type: 'data-coach-activity',
          data: expect.objectContaining({ toolCallId: 'write-1', status: 'completed' }),
        })]),
      });
    } finally {
      startWrite.resolve();
      completeWrite.resolve();
      finish.resolve();
      await completion;
      jest.useRealTimers();
    }
  });

  it.each(['ownership_lost', 'user_cancelled'] as const)(
    'observes %s on the next heartbeat and retains an already started write receipt',
    async (reason) => {
      jest.useFakeTimers();
      const fixture = setup([]);
      const writing = deferred<AbortSignal>();
      const finishWrite = deferred<void>();
      const receipt = {
        key: 'write',
        kind: 'tool',
        labelKey: 'tool',
        toolCallId: 'write-1',
        mutation: true,
      } as const;
      fixture.coachRuns.heartbeat.mockResolvedValueOnce(reason);
      if (reason === 'ownership_lost') {
        fixture.coachRuns.checkpointStreamTerminal.mockRejectedValueOnce(
          new ConflictException('The stale attempt was recovered'),
        );
      }
      async function* stream({ onActivity, signal }: Parameters<AiService['coachStream']>[0]) {
        await onActivity({ ...receipt, status: 'running' });
        writing.resolve(signal);
        await finishWrite.promise;
        await onActivity({ ...receipt, status: 'completed' });
      }
      fixture.aiService.coachStream.mockImplementationOnce(async (options) => stream(options));
      const completion = fixture.run({
        protocolVersion: 2,
        runCommand: { kind: 'start', requestId: 'late-write-receipt' },
      });

      try {
        const signal = await writing.promise;
        await jest.advanceTimersByTimeAsync(4_999);
        expect(signal.aborted).toBe(false);
        await jest.advanceTimersByTimeAsync(1);
        expect(signal.reason).toBe(reason);
      } finally {
        finishWrite.resolve();
        await completion;
        jest.useRealTimers();
      }
      if (reason === 'ownership_lost') {
        expect(fixture.coachRuns.recordLateOutcome).toHaveBeenCalledWith(
          expect.anything(), { ...receipt, status: 'completed' },
        );
        const receiptOrder = fixture.coachRuns.recordLateOutcome.mock.invocationCallOrder[0];
        expect(receiptOrder).toBeGreaterThan(
          fixture.coachRuns.checkpointStreamTerminal.mock.invocationCallOrder.at(-1),
        );
        expect(await completion).toContainEqual({
          type: 'ui_chunk',
          chunk: { type: 'error', errorText: expect.any(String) },
        });
        expect(fixture.operations.markDelivered).not.toHaveBeenCalled();
      } else {
        expect(fixture.runSnapshots.at(-1)).toMatchObject({
          parts: expect.arrayContaining([expect.objectContaining({
            type: 'data-coach-activity',
            data: expect.objectContaining({ toolCallId: 'write-1', status: 'completed' }),
          })]),
        });
      }
    },
  );

  it('keeps the lease alive while an awaiting-input checkpoint is pending', async () => {
    jest.useFakeTimers();
    const fixture = setup([
      {
        type: 'assistant',
        message: { content: [{
          type: 'tool_use',
          id: 'question-1',
          name: 'AskUserQuestion',
          input: { questions: [{
            id: 'goal',
            header: 'Goal',
            question: 'What is your goal?',
            options: [{ label: 'Run', value: 'run' }, { label: 'Ride', value: 'ride' }],
          }] },
        }] },
      },
      success,
    ]);
    const saving = deferred<CoachRunStatus>();
    const persisted = deferred<void>();
    fixture.coachRuns.checkpointStreamTerminal.mockImplementationOnce(async (_handle, status) => {
      saving.resolve(status);
      await persisted.promise;
    });
    const completion = fixture.run({
      protocolVersion: 2,
      runCommand: { kind: 'start', requestId: 'pending-question-checkpoint' },
    });

    try {
      expect(await saving.promise).toBe('awaiting_input');
      await jest.advanceTimersByTimeAsync(10_000);
      expect(fixture.coachRuns.heartbeat.mock.calls).toHaveLength(2);
    } finally {
      persisted.resolve();
      await completion;
      jest.useRealTimers();
    }
  });

  it('does not settle a paid turn if the lease is lost before the success checkpoint', async () => {
    const fixture = setup([
      { type: 'stream_event', event: { type: 'text_delta', text: 'Plan ready.' } },
      success,
    ]);
    fixture.coachRuns.checkpointStreamTerminal.mockRejectedValueOnce(
      new ConflictException('Coach execution ownership changed'),
    );

    const output = await fixture.run({
      protocolVersion: 2,
      runCommand: { kind: 'start', requestId: 'expired-success' },
    });
    expect(output).toContainEqual({
      type: 'ui_chunk',
      chunk: { type: 'error', errorText: expect.any(String) },
    });
    expect(fixture.operations.markDelivered).not.toHaveBeenCalled();
    expect(fixture.operations.complete).not.toHaveBeenCalled();
    expect(fixture.operations.fail).toHaveBeenCalledTimes(1);
  });

  it('does not charge a failed paid turn after it delivered a mutation receipt', async () => {
    const fixture = setup([
      {
        type: 'assistant',
        message: { content: [{
          type: 'tool_use',
          id: 'mutation-applied:committed',
          name: 'MutationApplied',
          input: { kind: 'mutation_applied', ok: true, actionId: 'committed' },
        }] },
      },
      success,
    ]);
    fixture.coachRuns.checkpointStreamTerminal.mockRejectedValueOnce(
      new ConflictException('Coach execution ownership changed'),
    );

    const output = await fixture.run({
      protocolVersion: 2,
      runCommand: { kind: 'start', requestId: 'failed-after-mutation' },
    });
    expect(output).toContainEqual(expect.objectContaining({
      type: 'ui_chunk',
      chunk: expect.objectContaining({
        type: 'data-coach-tool',
        data: expect.objectContaining({ name: 'MutationApplied' }),
      }),
    }));
    expect(fixture.operations.markDelivered).not.toHaveBeenCalled();
    expect(fixture.operations.complete).not.toHaveBeenCalled();
    expect(fixture.operations.fail).toHaveBeenCalledTimes(1);
  });

  it('ends an obsolete answer with the stale-question code before calling the model', async () => {
    const { run, coachRuns, aiService, aiUsage, logger } = setup([]);
    coachRuns.begin.mockRejectedValueOnce(
      new ConflictException({
        code: COACH_QUESTION_STALE_ERROR_CODE,
        message: 'Coach question is no longer pending',
      }),
    );

    const output = await run({
      protocolVersion: 2,
      branchId: 'branch-1',
      runCommand: {
        kind: 'answer',
        requestId: 'answer-request',
        submissionId: 'answer-submission',
        runId: 'run-1',
        interactionId: 'old-question',
      },
    });

    expect(output.filter((event) => event.type === 'result')).toEqual([
      expect.objectContaining({
        is_error: true,
        error_code: COACH_QUESTION_STALE_ERROR_CODE,
      }),
    ]);
    expect(coachRuns.begin).toHaveBeenCalledTimes(1);
    expect(aiService.coachStream).not.toHaveBeenCalled();
    expect(aiUsage.recordUsageEvent).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('records a recoverable expired calendar move without starting or charging for the model', async () => {
    const fixture = setup([]);
    const sid = 'calendar-move:preview-1';
    fixture.planStarts.calendarCoachSession.mockResolvedValue({
      sid,
      planId: 'plan-1',
      previewId: 'preview-1',
      branchId: 'branch-1',
      expired: true,
      range: { from: '2026-11-21', to: '2026-11-29' },
      impact: {
        workoutId: 'workout-1',
        from: '2026-11-21',
        to: '2026-11-24',
        reasons: [],
        weeks: [],
      },
    });
    await fixture.run({
      sid,
      protocolVersion: 2,
      runCommand: { kind: 'start', requestId: 'expired-move' },
    });
    expect(fixture.runSnapshots.at(-1)).toMatchObject({
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-turn-error',
          data: expect.objectContaining({ code: 'calendar_move_expired' }),
        }),
      ]),
    });
    expect(fixture.aiService.coachStream).not.toHaveBeenCalled();
    expect(fixture.operations.begin).not.toHaveBeenCalled();
  });

  it('records a calendar confirmation receipt without paid model admission', async () => {
    const fixture = setup([
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'apply-1',
              name: 'CoachDecisionApplied',
              input: {
                kind: 'coach_decision_apply',
                decisionId: 'decision-1',
                result: 'APPLIED',
                receipt: { readbackVerified: true },
              },
            },
          ],
        },
      },
      success,
    ]);
    const sid = 'calendar-move:preview-1';
    const branchId = 'branch-1';
    const calendarEdit = {
      sid,
      branchId,
      planId: 'plan-1',
      previewId: 'preview-1',
      range: { from: '2026-11-21', to: '2026-11-29' },
      impact: {
        workoutId: 'workout-1',
        from: '2026-11-21',
        to: '2026-11-24',
        reasons: [],
        weeks: [],
      },
    };
    fixture.planStarts.calendarCoachSession.mockResolvedValue(calendarEdit);
    const body: Parameters<typeof fixture.run>[0] = {
      sid,
      branchId,
      protocolVersion: 2,
      runCommand: { kind: 'start', requestId: 'confirm-1' },
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'draft-1',
            content: {
              kind: 'coach_decision_confirmation',
              decisionId: 'decision-1',
              repliesToAssistantMessageId: 'proposal-1',
            },
          },
        ],
      },
    };
    const events = await fixture.run(body);

    expect(fixture.aiService.coachStream).toHaveBeenCalledWith(
      expect.objectContaining({ sid, branchId, calendarEdit }),
    );
    expect(JSON.stringify(events)).toContain('readbackVerified');
    const snapshot = fixture.runSnapshots.at(-1);
    expect(snapshot).toMatchObject({
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-run',
          data: expect.objectContaining({ status: 'completed' }),
        }),
      ]),
    });
    expect(fixture.operations.begin).not.toHaveBeenCalled();
    expect(fixture.operations.complete).not.toHaveBeenCalled();
    expect(fixture.aiUsage.recordUsageEvent).not.toHaveBeenCalled();

    const replay = setup([]);
    replay.planStarts.calendarCoachSession.mockResolvedValue(calendarEdit);
    Object.assign(replay.coachRuns, {
      existingRequestBranch: jest.fn(async () => branchId),
      begin: jest.fn(async () => ({
        replay: { id: 'message-1', message: snapshot, operationId: 'operation-1' },
      })),
    });
    const replayedEvents = await replay.run(body);
    expect(replay.planStarts.calendarCoachSession).toHaveBeenCalledWith(
      'user-1',
      sid,
      undefined,
      { allowApplied: true, reportExpired: true },
    );
    expect(JSON.stringify(replayedEvents)).toContain('readbackVerified');
    expect(replay.aiService.coachStream).not.toHaveBeenCalled();
    expect(replay.operations.get).not.toHaveBeenCalled();
  });

  it('keeps a disconnected empty stream interrupted without a model failure receipt', async () => {
    const fixture = setup([]);
    fixture.aiService.coachStream.mockImplementation(async () => ({
      async *[Symbol.asyncIterator]() {
        fixture.response.emit('close');
        yield success;
      },
    }));
    await fixture.run({
      protocolVersion: 2,
      runCommand: { kind: 'start', requestId: 'request-disconnected' },
    });
    const message = fixture.runSnapshots.at(-1);
    expect(JSON.stringify(message)).not.toContain('model_unavailable');
    expect(message).toMatchObject({
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-run',
          data: expect.objectContaining({ status: 'interrupted' }),
        }),
      ]),
    });
    expect(fixture.operations.complete).not.toHaveBeenCalled();
  });

  it('continues an owned Athlete State answer without user admission or a paid operation', async () => {
    const fixture = setup([
      {
        type: 'model_usage',
        usage: { inputTokens: 5, outputTokens: 2 },
        model: 'test-model',
        provider: 'test',
        status: 'SUCCESS',
      },
      {
        type: 'stream_event',
        event: {
          type: 'text_delta',
          text: 'State updated.',
          modelStepId: 'step-1',
          placement: 'answer',
        },
      },
      success,
    ]);
    const assertAccess = jest.fn(async () => undefined);
    Object.assign(fixture.coachRuns, {
      isAthleteStateContinuation: jest.fn(async () => true),
      answerBranch: jest.fn(async () => null),
    });
    Object.assign(fixture.aiService, {
      assertAthleteStateAccess: assertAccess,
    });
    // Any attempted paid admission would fail for this athlete.
    fixture.operations.begin.mockImplementation(async () => {
      throw new Error('INSUFFICIENT_CREDITS');
    });
    await fixture.run({
      protocolVersion: 2,
      runCommand: {
        kind: 'answer',
        requestId: 'request',
        runId: 'run-1',
        interactionId: 'question',
        submissionId: 'reply',
      },
    });
    expect(assertAccess).toHaveBeenCalledWith('user-1');
    expect(fixture.operations.begin).not.toHaveBeenCalled();
    expect(fixture.operations.complete).not.toHaveBeenCalled();
    expect(fixture.operations.markDelivered).not.toHaveBeenCalled();
    expect(fixture.aiService.coachStream).toHaveBeenCalledWith(
      expect.objectContaining({
        platformFunded: true,
        activeSkillName: 'athlete-state',
        runtimeRunId: 'run-1',
      }),
    );
    expect(fixture.aiUsage.recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: null,
        callKey: 'attempt-1:coach-model:0',
      }),
    );
  });
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

describe('Activity review language through the controller', () => {
  it.each([
    [undefined, 'en'],
    ['zh-CN', 'zh'],
    ['zh-TW', 'zh-hant'],
    ['ja', 'ja'],
    ['de', 'de'],
    ['pt-BR', 'pt-BR'],
  ])('uses the supported language for %s when reading the review cache', async (locale, expected) => {
    const probeActivityAiAnalysisRoute = jest.fn(async () => ({
      kind: 'CACHED',
      content: 'review',
    }));
    const controller: AiController = Object.assign(Object.create(AiController.prototype), {
      aiService: { probeActivityAiAnalysisRoute },
    });

    await controller.streamActivityAiAnalysis('activity', 'athlete', null, true, locale, 'operation');

    expect(probeActivityAiAnalysisRoute).toHaveBeenCalledWith(
      'activity',
      'athlete',
      true,
      expected,
      false,
    );
  });
});

describe('AI coach client output contract through the controller', () => {
  it('uses Traditional Chinese for a Chinese prompt with a Taiwan locale', async () => {
    const fixture = setup([success]);

    await fixture.run({ lang: 'zh-TW', q: '今天適合怎麼訓練？' });

    expect(fixture.aiService.coachStream).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'zh-hant' }),
    );
  });

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

    expect(await run({ purpose: 'REASONING' })).toEqual([
      text,
      {
        ...settledSuccess,
        operation: { ...settledSuccess.operation, purpose: 'DEFAULT' },
      },
    ]);
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

  it('retries admission after releasing the expired Coach operation from another session', async () => {
    const { run, aiService, operations, coachRuns } = setup([
      { type: 'stream_event', event: { type: 'text_delta', text: '训练建议' } },
      success,
    ]);
    operations.begin.mockRejectedValueOnce(
      aiOperationError('AI_OPERATION_IN_PROGRESS', { operationId: 'orphan' }),
    );
    coachRuns.recoverStaleOperation.mockResolvedValueOnce(true);

    await run({ protocolVersion: 2, runCommand: { kind: 'start', requestId: 'request-1' } });

    expect(coachRuns.recoverStaleOperation).toHaveBeenCalledWith('user-1', 'orphan');
    expect(operations.fail).toHaveBeenCalledWith({
      userId: 'user-1',
      operationId: 'orphan',
      errorCode: 'COACH_RUN_LEASE_EXPIRED',
    });
    expect(operations.begin).toHaveBeenCalledTimes(2);
    expect(aiService.coachStream).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['AI_OPERATION_IN_PROGRESS', true],
    ['AI_OPERATION_COMPLETION_PENDING', false],
  ] as const)('preserves a live or settling operation (%s)', async (code, checkLease) => {
    const { run, aiService, operations, coachRuns } = setup([]);
    operations.begin.mockRejectedValueOnce(
      aiOperationError(code, { operationId: 'active' }),
    );

    await run({ protocolVersion: 2, runCommand: { kind: 'start', requestId: 'request-1' } });

    expect(coachRuns.recoverStaleOperation).toHaveBeenCalledTimes(checkLease ? 1 : 0);
    expect(operations.fail).not.toHaveBeenCalled();
    expect(operations.begin).toHaveBeenCalledTimes(1);
    expect(aiService.coachStream).not.toHaveBeenCalled();
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
