import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { isCoachUpstreamConfigured } from '@/api/ai/core/coach-upstream.adapter';
import { CoachPeriodReviewRuntimeService } from '../coach-period-review-runtime.service';
import { ReviewModelCallGuard } from '../review-model-call-guard';

jest.mock('@/api/ai/core/coach-upstream.adapter', () => ({
  isCoachUpstreamConfigured: jest.fn(() => false),
}));

const upstream = isCoachUpstreamConfigured as jest.MockedFunction<
  typeof isCoachUpstreamConfigured
>;

function createService() {
  const branching = {
    openBranch: jest.fn(async () => ({ branch: { id: 'branch-1' } })),
    squashBranch: jest.fn(async () => ({ decision: { id: 'decision-1' } })),
    rejectDecision: jest.fn(async () => undefined),
  };
  const aiService = {
    generatePlanReviewJudgment: jest.fn(async () => ({
      decision: 'KEEP',
      action: null,
      targetWorkoutId: null,
      rationale: 'Keep the next week.',
      confidence: 0.8,
      evidenceCodes: ['PLAN_ON_TRACK'],
      adjustmentIntent: null,
      provider: 'openrouter',
      model: 'model',
      usage: {},
    })),
  };
  const context = {
    reviewFactHash: 'week-fact',
    meta: {
      promptVersion: 'plan_review_judgment_v4_2',
      scale: 'weekly',
      locale: 'zh',
      timezone: 'Asia/Shanghai',
      reviewedFrom: '2026-08-17',
      reviewedThrough: '2026-08-23',
      athleteToday: '2026-08-24',
      generatedAt: '2026-08-24T00:00:00Z',
    },
    athlete: { sportProfiles: [] },
    plan: { id: 'plan-1', title: 'Base', goal: '5K', status: 'ACTIVE' },
    recent7Days: [],
    reviewWindowSummary: {
      planned: 3,
      done: 2,
      skipped: 0,
      moved: 0,
      incomplete: 1,
      plannedLoad: 100,
      actualLoad: 70,
      extraActivities: 0,
      sportBreakdown: {},
    },
    loadSnapshot: {
      ctl: 40,
      atl: 36,
      tsb: 4,
      currentWeekLoad: 70,
      previousWeekLoad: 80,
      dailyLoadLast7d: [],
      restDaysLast14d: 5,
    },
    upcoming: [
      {
        id: 'w-next',
        date: '2026-08-24',
        weekIndex: 3,
        dayIndex: 1,
        sessionIndex: 1,
        sportType: 'RUN',
        status: 'PLANNED',
        name: 'Easy run',
        notes: null,
        text: 'work 30m',
        structureKind: 'ENDURANCE',
        dslVersion: 1,
        plannedDurationSeconds: 1800,
        plannedSessionRpe: null,
        expectedLoad: 30,
        summary: {
          kind: 'ENDURANCE',
          durationSeconds: 1800,
          stepCount: 1,
          hardSession: false,
        },
        linkedActivityIds: [],
      },
    ],
    competitionContext: { status: 'UNAVAILABLE' },
    recentDecisions: [],
    dataQuality: {
      missing: [],
      hasActivityDetails: true,
      hasPmcTrend: true,
      hasAthleteProfile: false,
    },
  };
  const coachContext = { appendEvent: jest.fn(async () => undefined) };
  const service = new CoachPeriodReviewRuntimeService(
    { coachDecision: { findMany: jest.fn(async () => []) } } as never,
    {
      buildContext: jest.fn(async () => ({
        contextId: 'ctx-1',
        plan: { id: 'plan-1', status: 'ACTIVE' },
      })),
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
    { findRecentReviewEvents: jest.fn(async () => []) } as never,
    {
      build: jest.fn(async ({ scale }: { scale: string }) => ({
        ...context,
        meta: { ...context.meta, scale },
      })),
    } as never,
    { compose: jest.fn(async () => ({ draft: null })) } as never,
    new ReviewModelCallGuard(),
  );
  return { service, branching, coachContext, aiService };
}

const weekly = {
  type: 'WEEKLY' as const,
  userId: 'user-1',
  digestId: 'digest-w',
  periodStart: new Date('2026-08-17T00:00:00Z'),
  periodEnd: new Date('2026-08-24T00:00:00Z'),
};

describe('CoachPeriodReviewRuntimeService v4', () => {
  afterEach(() => upstream.mockReturnValue(false));

  it('does not let one incomplete workout alone force a fallback adjustment', async () => {
    const { service, branching } = createService();
    await expect(service.runForJob(weekly)).resolves.toMatchObject({
      reason: 'keep',
    });
    expect(branching.openBranch).not.toHaveBeenCalled();
  });

  it('applies one model-selected skip to the weekly open reason', async () => {
    upstream.mockReturnValue(true);
    const { service, aiService, branching } = createService();
    aiService.generatePlanReviewJudgment.mockResolvedValueOnce({
      decision: 'ADJUST',
      action: 'SKIP',
      targetWorkoutId: 'w-next',
      rationale: 'Omit the redundant session.',
      confidence: 0.7,
      evidenceCodes: ['STIMULUS_REPLACED'],
      adjustmentIntent: null,
      provider: 'openrouter',
      model: 'model',
      usage: {},
    });
    await service.runForJob(weekly);
    expect(branching.openBranch).toHaveBeenCalledWith(
      expect.objectContaining({ openReason: 'runtime_week_review' }),
    );
    expect(branching.squashBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionType: 'PLAN_WORKOUT_STATUS',
        payload: expect.objectContaining({
          status: 'SKIPPED',
          review: expect.objectContaining({ scale: 'weekly' }),
        }),
      }),
    );
  });

  it('uses the monthly branch and event scale without adjusting more than one workout', async () => {
    upstream.mockReturnValue(true);
    const { service, aiService, branching, coachContext } = createService();
    aiService.generatePlanReviewJudgment.mockResolvedValueOnce({
      decision: 'ADJUST',
      action: 'POSTPONE',
      targetWorkoutId: 'w-next',
      rationale: 'Protect the next phase opening.',
      confidence: 0.7,
      evidenceCodes: ['LOAD_PRESSURE'],
      adjustmentIntent: null,
      provider: 'openrouter',
      model: 'model',
      usage: {},
    });
    await service.runForJob({ ...weekly, type: 'MONTHLY' });
    expect(branching.openBranch).toHaveBeenCalledWith(
      expect.objectContaining({ openReason: 'runtime_month_review' }),
    );
    expect(branching.squashBranch).toHaveBeenCalledTimes(1);
    expect(coachContext.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'REVIEW_MONTHLY',
        payload: expect.objectContaining({ scale: 'monthly' }),
      }),
    );
  });
});
