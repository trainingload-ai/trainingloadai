import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { isCoachUpstreamConfigured } from '@/api/ai/core/coach-upstream.adapter';
import { CoachDailyReviewRuntimeService } from '../coach-daily-review-runtime.service';
import {
  ReviewModelCallGuard,
  ReviewModelDeferredError,
} from '../review-model-call-guard';

jest.mock('@/api/ai/core/coach-upstream.adapter', () => ({
  isCoachUpstreamConfigured: jest.fn(() => false),
}));

const upstream = isCoachUpstreamConfigured as jest.MockedFunction<
  typeof isCoachUpstreamConfigured
>;

const workout = {
  id: 'w-next',
  date: '2026-08-18',
  weekIndex: 2,
  dayIndex: 3,
  sessionIndex: 1,
  sportType: 'RUN',
  status: 'PLANNED',
  name: 'Controlled run',
  notes: 'Run steadily for 20 minutes.',
  text: 'work 20m',
  structureKind: 'ENDURANCE',
  dslVersion: 1,
  plannedDurationSeconds: 1200,
  plannedSessionRpe: null,
  expectedLoad: 21.4,
  summary: {
    kind: 'ENDURANCE',
    durationSeconds: 1200,
    stepCount: 1,
    hardSession: false,
  },
  linkedActivityIds: [],
};

function execution(plan: object | null = { id: 'plan-1', status: 'ACTIVE' }) {
  return {
    contextId: 'ctx-1',
    plan,
    anchor: { anchorDate: '2026-08-17' },
  };
}

function review(overrides: Record<string, unknown> = {}) {
  return {
    reviewFactHash: 'review-fact-1',
    meta: {
      promptVersion: 'plan_review_judgment_v4_2',
      scale: 'daily',
      locale: 'zh',
      timezone: 'Asia/Shanghai',
      reviewedFrom: '2026-08-17',
      reviewedThrough: '2026-08-17',
      athleteToday: '2026-08-18',
      generatedAt: '2026-08-18T00:00:00.000Z',
    },
    athlete: { sportProfiles: [] },
    plan: { id: 'plan-1', title: 'Base', goal: '5K', status: 'ACTIVE' },
    recent7Days: [
      {
        date: '2026-08-17',
        plannedWorkouts: [],
        activities: [],
        pmc: { dailyLoad: 0, ctl: 40, atl: 36, tsb: 4 },
      },
    ],
    reviewWindowSummary: {
      planned: 0,
      done: 0,
      skipped: 0,
      moved: 0,
      incomplete: 0,
      plannedLoad: 0,
      actualLoad: 0,
      extraActivities: 0,
      sportBreakdown: {},
    },
    loadSnapshot: {
      ctl: 40,
      atl: 36,
      tsb: 4,
      currentWeekLoad: 20,
      previousWeekLoad: 100,
      dailyLoadLast7d: [],
      restDaysLast14d: 5,
    },
    upcoming: [workout],
    competitionContext: { status: 'UNAVAILABLE' },
    recentDecisions: [],
    dataQuality: {
      missing: [],
      hasActivityDetails: false,
      hasPmcTrend: true,
      hasAthleteProfile: false,
    },
    ...overrides,
  };
}

function createService(
  args: {
    execution?: ReturnType<typeof execution>;
    review?: ReturnType<typeof review>;
    recentEvents?: Array<{ dedupeKey?: string | null; payload?: unknown }>;
    guard?: ReviewModelCallGuard;
  } = {},
) {
  const branching = {
    openBranch: jest.fn(async () => ({ branch: { id: 'branch-1' } })),
    squashBranch: jest.fn(async () => ({ decision: { id: 'decision-1' } })),
    rejectDecision: jest.fn(async () => undefined),
  };
  const coachContext = { appendEvent: jest.fn(async () => undefined) };
  const aiService = {
    generateDailyPlanReviewJudgment: jest.fn(async () => ({
      decision: 'KEEP',
      action: null,
      targetWorkoutId: null,
      rationale: 'Keep the plan.',
      confidence: 0.8,
      evidenceCodes: ['PLAN_ON_TRACK'],
      adjustmentIntent: null,
      provider: 'openrouter',
      model: 'model',
      usage: {},
    })),
  };
  const adjustments = {
    compose: jest.fn(async () => ({
      draft: null,
      beforeLoad: 21.4,
      afterLoad: null,
      attempts: 2,
      failure: 'invalid',
    })),
  };
  const service = new CoachDailyReviewRuntimeService(
    {
      coachDecision: { findMany: jest.fn(async () => []) },
    } as never,
    {
      buildContext: jest.fn(async () => args.execution ?? execution()),
    } as never,
    coachContext as never,
    branching as never,
    aiService as never,
    { recordUsageEvent: jest.fn(async () => undefined) } as never,
    {
      getPreferredLocale: jest.fn(async () => 'zh'),
      getPreferredTimezone: jest.fn(async () => 'Asia/Shanghai'),
    } as never,
    { t: jest.fn((key: string) => key) } as never,
    {
      findRecentReviewEvents: jest.fn(async () => args.recentEvents ?? []),
    } as never,
    { build: jest.fn(async () => args.review ?? review()) } as never,
    adjustments as never,
    args.guard ?? new ReviewModelCallGuard(),
  );
  return { service, branching, coachContext, aiService, adjustments };
}

const job = {
  userId: 'user-1',
  digestId: 'digest-1',
  periodStart: new Date('2026-08-17T00:00:00.000Z'),
  periodEnd: new Date('2026-08-18T00:00:00.000Z'),
};

describe('CoachDailyReviewRuntimeService v4', () => {
  afterEach(() => {
    upstream.mockReturnValue(false);
  });

  it('skips when no active plan exists', async () => {
    const { service } = createService({ execution: execution(null) });
    await expect(service.runForDailyJob(job)).resolves.toEqual({
      skipped: true,
      reason: 'no_active_plan',
    });
  });

  it('keeps without creating a card when evidence does not agree on risk', async () => {
    const { service, branching, coachContext } = createService();
    await expect(service.runForDailyJob(job)).resolves.toMatchObject({
      reason: 'keep',
    });
    expect(branching.openBranch).not.toHaveBeenCalled();
    expect(coachContext.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          decision: 'KEEP',
          promptVersion: 'plan_review_judgment_v5_3',
        }),
      }),
    );
  });

  it('keeps silently when only rule-authored fallback copy is available', async () => {
    const incident = review({
      recent7Days: [
        {
          date: '2026-08-17',
          plannedWorkouts: [],
          activities: [
            {
              id: 1,
              sportType: 'RUN',
              load: 26.9,
              dayPeriod: 'evening',
              linkedWorkoutId: null,
            },
          ],
          pmc: { dailyLoad: 26.9, ctl: 40, atl: 43, tsb: -3 },
        },
      ],
    });
    const { service, branching } = createService({ review: incident });
    await expect(service.runForDailyJob(job)).resolves.toMatchObject({
      reason: 'keep',
    });
    expect(branching.openBranch).not.toHaveBeenCalled();
    expect(branching.squashBranch).not.toHaveBeenCalled();
  });

  it('uses the composer for a content adjustment and emits PLAN_WORKOUT_UPDATE', async () => {
    upstream.mockReturnValue(true);
    const { service, aiService, adjustments, branching } = createService();
    aiService.generateDailyPlanReviewJudgment.mockResolvedValueOnce({
      decision: 'ADJUST',
      action: 'REDUCE_VOLUME',
      targetWorkoutId: 'w-next',
      rationale: 'Shorten the session after the extra work.',
      confidence: 0.8,
      evidenceCodes: ['EXTRA_ACTIVITY'],
      adjustmentIntent: { magnitude: 'SMALL', preserve: ['session_goal'] },
      provider: 'openrouter',
      model: 'model',
      usage: {},
    });
    adjustments.compose.mockResolvedValueOnce({
      draft: {
        planId: 'plan-1',
        workoutId: 'w-next',
        title: 'Shorter controlled run',
        reason: 'Absorb the extra work.',
        before: {
          weekIndex: 2,
          dayIndex: 3,
          sessionIndex: 1,
          sportType: 'RUN',
          text: 'work 20m',
          scheduledDate: '2026-08-18',
        },
        after: {
          weekIndex: 2,
          dayIndex: 3,
          sessionIndex: 1,
          sportType: 'RUN',
          text: 'work 15m',
          notes: 'Run easily for 15 minutes.',
          scheduledDate: '2026-08-18',
        },
        changes: [{ field: 'duration', before: '20 min', after: '15 min' }],
      },
      beforeLoad: 21.4,
      afterLoad: 16,
      attempts: 1,
      failure: null,
    });
    await service.runForDailyJob(job);
    expect(branching.squashBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionType: 'PLAN_WORKOUT_UPDATE',
        payload: expect.objectContaining({
          dto: expect.objectContaining({ text: 'work 15m' }),
          adjustment: expect.objectContaining({ kind: 'reduce_volume' }),
        }),
      }),
    );
  });

  it('records composer failure and creates no invalid adjustment card', async () => {
    upstream.mockReturnValue(true);
    const { service, aiService, branching, coachContext } = createService();
    aiService.generateDailyPlanReviewJudgment.mockResolvedValueOnce({
      decision: 'ADJUST',
      action: 'RECOVERY',
      targetWorkoutId: 'w-next',
      rationale: 'Convert this to recovery work.',
      confidence: 0.7,
      evidenceCodes: ['SHORT_RECOVERY'],
      adjustmentIntent: { magnitude: 'SMALL', preserve: ['movement'] },
      provider: 'openrouter',
      model: 'model',
      usage: {},
    });

    await expect(service.runForDailyJob(job)).resolves.toMatchObject({
      reason: 'keep',
    });
    expect(branching.openBranch).not.toHaveBeenCalled();
    expect(branching.squashBranch).not.toHaveBeenCalled();
    expect(coachContext.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionId: null,
        payload: expect.objectContaining({
          adjustmentGeneration: 'adjustment_generation_failed',
          presentation: 'SILENT',
          rationale: '',
          evidenceCodes: expect.arrayContaining([
            'ADJUSTMENT_GENERATION_FAILED',
          ]),
        }),
      }),
    );
  });

  it('keeps the conservative fallback for an isolated model failure', async () => {
    upstream.mockReturnValue(true);
    const { service, aiService, coachContext } = createService();
    aiService.generateDailyPlanReviewJudgment.mockRejectedValueOnce(
      new Error('Request timed out.'),
    );

    await expect(service.runForDailyJob(job)).resolves.toMatchObject({
      skipped: false,
    });
    expect(aiService.generateDailyPlanReviewJudgment).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(coachContext.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          upstreamFailureCode: 'UPSTREAM_TIMEOUT',
        }),
      }),
    );
  });

  it('does not persist a fallback judgment once the review run is stopped', async () => {
    upstream.mockReturnValue(true);
    const guard = new ReviewModelCallGuard();
    (guard as unknown as { pausedUntil: Date }).pausedUntil = new Date(
      Date.now() + 60_000,
    );
    const { service, aiService, coachContext } = createService({ guard });

    await expect(service.runForDailyJob(job)).rejects.toBeInstanceOf(
      ReviewModelDeferredError,
    );
    expect(aiService.generateDailyPlanReviewJudgment).not.toHaveBeenCalled();
    expect(coachContext.appendEvent).not.toHaveBeenCalled();
  });

  it('deduplicates the complete review evidence hash', async () => {
    const { service, branching } = createService({
      recentEvents: [{ payload: { factHash: 'review-fact-1' } }],
    });
    await expect(service.runForDailyJob(job)).resolves.toEqual({
      skipped: true,
      reason: 'duplicate',
    });
    expect(branching.openBranch).not.toHaveBeenCalled();
  });
});
