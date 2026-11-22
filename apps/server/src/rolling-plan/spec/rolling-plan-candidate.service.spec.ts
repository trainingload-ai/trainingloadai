import { AiService } from '@/api/ai/ai.service';
import { BadRequestException } from '@nestjs/common';
import {
  ReviewModelCallGuard,
  ReviewModelCallTimeoutError,
  ReviewModelDeferredError,
} from '@/review/review-model-call-guard';
import { coachTaskSubmitResultTool } from '@/api/ai/core/tools/coachTaskSubmitResult.tool';
import { getCoachTools } from '@/api/ai/core/tool.registry';
import { RollingPlanCandidateService } from '../rolling-plan-candidate.service';
import type { RollingPlanCandidateInput } from '../rolling-plan-candidate.types';

const input: RollingPlanCandidateInput = {
  jobId: 'job-month',
  userId: 'athlete',
  lang: 'zh',
  inputRevision: 'external-facts-v1',
  kind: 'MONTH',
  windowStart: '2026-11-01',
  from: '2026-11-19',
  through: '2026-11-30',
  planId: 'plan-rolling',
  facts: { plan: { id: 'plan-rolling' }, loadObservation: { actual: null } },
  policy: { goal: 'Consistency', sportTypes: ['RUN'] },
  monthStrategies: [],
};
const month = {
  kind: 'MONTH',
  reason:
    'Keep the remaining month conservative while load coverage is unknown.',
  strategy: {
    monthStart: '2026-11-01',
    objective: 'Build consistency without catch-up training.',
    loadRange: null,
    durationMinutesRange: { min: 60, max: 120 },
    runningDistanceKmRange: { min: 10, max: 18 },
    weekFocus: [
      {
        weekStart: '2026-11-16',
        focus: 'Easy training',
        loadRange: null,
        durationMinutesRange: { min: 20, max: 40 },
      },
      {
        weekStart: '2026-11-23',
        focus: 'Progress if recovered',
        loadRange: null,
        durationMinutesRange: { min: 30, max: 60 },
      },
      {
        weekStart: '2026-11-30',
        focus: 'Ease into the next month',
        loadRange: null,
        durationMinutesRange: { min: 10, max: 20 },
      },
    ],
  },
};
const weekInput: RollingPlanCandidateInput = {
  ...input,
  kind: 'WEEK',
  windowStart: '2026-11-30',
  from: '2026-11-30',
  through: '2026-12-06',
  monthStrategies: [
    month.strategy,
    { ...month.strategy, monthStart: '2026-12-01' },
  ],
};
const week = {
  kind: 'WEEK',
  reason: 'Respect both month directions.',
  schedule: {
    mode: 'SCHEDULE',
    planId: 'plan-rolling',
    range: { from: '2026-11-30', to: '2026-12-06' },
    rationale: 'Continue easy work.',
    evidenceRefs: [],
    changes: [],
    deletions: [],
    preserveUnmentioned: true,
    additions: [
      {
        candidateKey: 'easy-run',
        workout: {
          weekIndex: 5,
          dayIndex: 4,
          sportType: 'RUN',
          name: 'Easy run',
          text: 'work 25m',
          notes: 'Stay at conversational effort.',
        },
      },
    ],
  },
};

// Persistence and the provider stream are the external boundaries; the task
// lifecycle and model deadline run through the production services.
function runtime(result: unknown, usageReported = true) {
  const ai = Object.create(AiService.prototype) as AiService;
  const checkpoint = jest.fn(async () => undefined);
  const beginBilling = jest.fn(async () => ({
    replay: false,
    operation: { status: 'STARTED' },
  }));
  const recordUsageEvent = jest.fn(async () => undefined);
  const projector = {
    run: {
      runId: 'run-rolling',
      attemptId: 'attempt-1',
      messageId: 'message-1',
    },
    consume: () => [],
    finish: () => [],
  };
  const stream = jest.fn(async (params: Record<string, unknown>) => {
    const task = params.backgroundTask as {
      submitResult: (raw: unknown) => void;
    };
    task.submitResult(result);
    return (async function* () {
      if (usageReported)
        yield {
          type: 'model_usage' as const,
          usage: { inputTokens: 10, outputTokens: 5 },
          model: 'provider-test',
          provider: 'test',
          status: 'SUCCESS' as const,
        };
      yield {
        type: 'result' as const,
        subtype: 'success' as const,
        is_error: false,
        result: '',
      };
    })();
  });
  Object.defineProperties(ai, {
    getCoachModel: { value: () => 'provider-test' },
    runCoachTurn: { value: stream },
    coachRuns: {
      value: {
        beginBackground: jest.fn(async () => ({
          handle: {
            projector,
            revision: 0,
            userId: 'athlete',
            sessionId: 'background:rolling',
            operationId: 'operation-1',
            previousExecutionMs: 0,
          },
        })),
        checkpoint,
        heartbeat: async () => null,
      },
    },
    operations: {
      value: {
        begin: beginBilling,
        get: async () => null,
        heartbeat: async () => undefined,
        markDelivered: async () => ({ status: 'RUNNING' }),
        complete: async () => ({ status: 'COMPLETED' }),
        fail: async () => undefined,
      },
    },
    aiUsage: { value: { recordUsageEvent } },
  });
  const guard = new ReviewModelCallGuard();
  return {
    service: new RollingPlanCandidateService(ai, guard),
    ai,
    guard,
    stream,
    checkpoint,
    beginBilling,
    recordUsageEvent,
  };
}

describe('RollingPlanCandidateService', () => {
  beforeEach(() => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      AI_PROVIDER: 'openai',
      OPENAI_DEFAULT_MODEL: 'provider-test',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a month candidate and its durable run without pretending unknown actual load is zero', async () => {
    const { service } = runtime(month);
    await expect(service.propose(input)).resolves.toEqual({
      result: month,
      runId: 'run-rolling',
    });
  });

  it('returns one cross-month natural week using both month strategies', async () => {
    const { service } = runtime(week);
    await expect(service.propose(weekInput)).resolves.toEqual({
      result: week,
      runId: 'run-rolling',
    });
  });

  it('rejects an incomplete evidence input before admitting a model run', async () => {
    const { service, stream } = runtime(month);
    await expect(
      service.propose({ ...input, facts: null }),
    ).rejects.toMatchObject({ code: 'ROLLING_CANDIDATE_INPUT_INVALID' });
    expect(stream).not.toHaveBeenCalled();
  });

  it.each([
    { request: input, result: month },
    { request: weekInput, result: week },
    {
      request: { ...weekInput, kind: 'ADJUST' as const },
      result: { ...week, kind: 'ADJUST' },
    },
  ])(
    'records platform usage for automatic $request.kind runs without starting a user charge',
    async ({ request, result }) => {
      const { service, stream, beginBilling, recordUsageEvent } =
        runtime(result);
      await service.propose(request);

      expect(beginBilling).not.toHaveBeenCalled();
      expect(stream.mock.calls[0][0]).toMatchObject({ platformFunded: true });
      expect(recordUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({ operationId: null, entityId: request.jobId }),
      );
    },
  );

  it('keeps the fixed read-only envelope and both required evidence gates in the production task', async () => {
    const { service, stream } = runtime(month);
    await service.propose(input);
    const turn = stream.mock.calls[0][0];
    expect(turn).toMatchObject({
      executionMode: 'background',
      activeSkillName: 'rolling-plan',
      resumeHistory: false,
    });
    expect(turn.allowWithoutConsent).toBeUndefined();
    const task = turn.backgroundTask as {
      allowedToolNames: string[];
      requiredToolNames: string[];
      completedToolNames: Set<string>;
    };
    expect(task.allowedToolNames).toEqual([
      'training.data_coverage',
      'plan.by_id',
      'workout.intensity_strategy',
    ]);
    expect(task.requiredToolNames).toEqual([
      'training.data_coverage',
      'plan.by_id',
    ]);
    const tools = await getCoachTools({
      ctx: {
        session: { user: { id: 'athlete' } },
        trainingDataCoverage: {},
        backgroundTask: task,
      } as never,
      scopeBySkill: false,
      candidateToolNames: [
        ...task.allowedToolNames,
        'coach_task_submit_result',
      ],
    });
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'coach_task_submit_result',
      'plan.by_id',
      'training.data_coverage',
      'workout.intensity_strategy',
    ]);
    expect(tools.every((tool) => (tool.kind ?? 'read') === 'read')).toBe(true);
    const ctx = { backgroundTask: task } as never;
    task.completedToolNames.add('training.data_coverage');
    expect(
      await coachTaskSubmitResultTool.validateInput!(ctx, { result: month }),
    ).toMatchObject({ ok: false, code: 'REQUIRED_EVIDENCE_MISSING' });
    task.completedToolNames.add('plan.by_id');
    expect(
      await coachTaskSubmitResultTool.validateInput!(ctx, { result: month }),
    ).toEqual({ ok: true });
    const data = String(turn.prompt).match(
      /ROLLING_TASK_DATA_BEGIN\n([\s\S]*)\nROLLING_TASK_DATA_END/,
    )!;
    expect(JSON.parse(data[1])).toEqual(input);
  });

  it('returns a stable personal-setting blocker after completing the run without opening a question', async () => {
    const { service, checkpoint, stream } = runtime({
      kind: 'NEEDS_INPUT',
      reason: 'No confirmed availability supports the requested training.',
    });
    await expect(service.propose(input)).rejects.toMatchObject({
      code: 'ROLLING_CANDIDATE_NEEDS_INPUT',
      reason: 'No confirmed availability supports the requested training.',
    });
    expect(checkpoint).toHaveBeenLastCalledWith(
      expect.anything(),
      'completed',
      undefined,
      expect.objectContaining({ resultType: 'ROLLING_PLAN_MONTH' }),
    );
    expect(String(stream.mock.calls[0][0].prompt)).not.toContain(
      'wait for an explicitly permitted user question',
    );
  });

  it('defers repeated provider failures through the shared guard instead of returning fallback training', async () => {
    const { service, stream } = runtime(month);
    stream.mockRejectedValue(new Error('provider unavailable'));
    await expect(service.propose(input)).rejects.toThrow(
      'provider unavailable',
    );
    await expect(service.propose(input)).rejects.toThrow(
      'provider unavailable',
    );
    await expect(service.propose(input)).rejects.toBeInstanceOf(
      ReviewModelDeferredError,
    );
    await expect(service.propose(input)).rejects.toBeInstanceOf(
      ReviewModelDeferredError,
    );
    expect(stream).toHaveBeenCalledTimes(3);
  });

  it('propagates consent and funding failures without counting them as provider failures', async () => {
    const { service, stream, guard } = runtime(month);
    stream.mockRejectedValue(
      new BadRequestException('AI_DATA_CONSENT_REQUIRED'),
    );
    for (let i = 0; i < 4; i++)
      await expect(service.propose(input)).rejects.toThrow(
        'AI_DATA_CONSENT_REQUIRED',
      );
    expect(guard.pausedUntilAt()).toBeNull();
    stream.mockRejectedValueOnce(
      new BadRequestException('AI_INSUFFICIENT_BALANCE'),
    );
    await expect(service.propose(input)).rejects.toThrow(
      'AI_INSUFFICIENT_BALANCE',
    );
    expect(guard.pausedUntilAt()).toBeNull();
  });

  it('rejects a result with missing provider usage and trips the guard on repetition', async () => {
    const { service } = runtime(month, false);
    await expect(service.propose(input)).rejects.toMatchObject({
      code: 'ROLLING_CANDIDATE_USAGE_MISSING',
    });
    await expect(service.propose(input)).rejects.toMatchObject({
      code: 'ROLLING_CANDIDATE_USAGE_MISSING',
    });
    await expect(service.propose(input)).rejects.toBeInstanceOf(
      ReviewModelDeferredError,
    );
  });

  it('aborts the actual background call at the shared model deadline', async () => {
    jest.useFakeTimers();
    const savedTimeout = process.env.REVIEW_MODEL_CALL_TIMEOUT_MS;
    process.env.REVIEW_MODEL_CALL_TIMEOUT_MS = '10000';
    try {
      const { service, stream } = runtime(month);
      stream.mockImplementation(async (params) => {
        const signal = params.signal as AbortSignal;
        await new Promise<never>((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          }),
        );
        return (async function* () {})();
      });
      const pending = service.propose(input);
      const rejected = expect(pending).rejects.toBeInstanceOf(
        ReviewModelCallTimeoutError,
      );
      await jest.advanceTimersByTimeAsync(10000);
      await rejected;
      expect((stream.mock.calls[0][0].signal as AbortSignal).aborted).toBe(
        true,
      );
    } finally {
      if (savedTimeout === undefined)
        delete process.env.REVIEW_MODEL_CALL_TIMEOUT_MS;
      else process.env.REVIEW_MODEL_CALL_TIMEOUT_MS = savedTimeout;
      jest.useRealTimers();
    }
  });

  it('rejects a month focus that only covers past weeks', async () => {
    const { service } = runtime({
      ...month,
      strategy: {
        ...month.strategy,
        weekFocus: [{ weekStart: '2026-11-02', focus: 'Catch up' }],
      },
    });
    await expect(service.propose(input)).rejects.toMatchObject({
      code: 'ROLLING_CANDIDATE_INVALID',
    });
  });

  it.each([
    ['different plan', { ...week.schedule, planId: 'other-plan' }],
    [
      'earlier range',
      { ...week.schedule, range: { from: '2026-11-29', to: '2026-12-06' } },
    ],
    [
      'later range',
      { ...week.schedule, range: { from: '2026-11-30', to: '2026-12-07' } },
    ],
    ['new availability', { ...week.schedule, scheduleConstraints: {} }],
    [
      'new quality contract',
      { ...week.schedule, qualityContractTransition: {} },
    ],
    ['new automation policy', { ...week.schedule, rolling: {} }],
  ])(
    'rejects a schedule candidate that escapes its bound: %s',
    async (_, schedule) => {
      const { service } = runtime({ ...week, schedule });
      await expect(service.propose(weekInput)).rejects.toMatchObject({
        code: 'ROLLING_CANDIDATE_INVALID',
      });
    },
  );

  it('preserves source identities and expected revisions in an adjustment candidate', async () => {
    const result = {
      ...week,
      kind: 'ADJUST',
      schedule: {
        ...week.schedule,
        additions: [],
        changes: [
          {
            sourceWorkoutId: 'future-course',
            expectedRevision: 3,
            workout: week.schedule.additions[0].workout,
          },
        ],
        preserved: [
          { sourceWorkoutId: 'athlete-edited-course', expectedRevision: 7 },
        ],
      },
    };
    const { service } = runtime(result);
    await expect(
      service.propose({ ...weekInput, kind: 'ADJUST' }),
    ).resolves.toEqual({ result, runId: 'run-rolling' });
  });

  it.each([
    { ...input, from: '2026-11-31' },
    { ...input, through: '2026-12-01' },
    { ...weekInput, windowStart: '2026-12-01' },
    { ...weekInput, through: '2026-12-07' },
    { ...weekInput, inputRevision: '' },
  ])(
    'rejects an invalid or unbounded job input before invoking the provider',
    async (invalid) => {
      const { service, stream } = runtime(month);
      await expect(service.propose(invalid)).rejects.toMatchObject({
        code: 'ROLLING_CANDIDATE_INPUT_INVALID',
      });
      expect(stream).not.toHaveBeenCalled();
    },
  );
});
