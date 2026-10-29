import { describe, expect, it, jest } from '@jest/globals';
import { trainingPlanContextTool } from '../trainingPlanContext.tool';

function context() {
  return {
    session: { user: { id: 'user-1' } },
    i18n: { t: jest.fn((key: string) => key) },
    prisma: {
      coachSummary: {
        findMany: jest.fn(async () => [
          {
            planId: 'completed-plan-1',
            adherenceScore: 88,
            progressLabel: 'UP',
            keyDrivers: { completionRate: 88, complianceRate: 93 },
            riskFlags: { skippedCount: 3, movedCount: 1 },
            nextCycleSuggestion: { suggestedProgressLabel: 'UP' },
          },
        ]),
      },
    },
    planService: {
      listPlans: jest.fn<
        () => Promise<{ plans: Array<Record<string, unknown>> }>
      >(async () => ({
        plans: [
          {
            id: 'active-plan-1',
            title: 'Active marathon build',
            status: 'ACTIVE',
            sourceType: 'AI',
            periodWeeks: 12,
            startDate: '2026-07-20',
            endDate: '2026-10-11',
            updatedAt: new Date('2026-08-02T10:00:00Z'),
            currentWeekIndex: 2,
            currentDayIndex: 1,
            workoutCount: 48,
            completedWorkoutCount: 7,
            sessionCompletionRate: 88,
            estimatedLoadTotal: 2400,
            actualLoadTotal: 370,
            complianceRate: 91,
          },
          {
            id: 'completed-plan-1',
            title: 'Previous base block',
            status: 'COMPLETED',
            sourceType: 'MANUAL',
            periodWeeks: 6,
            startDate: '2026-05-25',
            endDate: '2026-07-05',
            updatedAt: new Date('2026-07-06T10:00:00Z'),
            workoutCount: 24,
            completedWorkoutCount: 21,
            sessionCompletionRate: 88,
            estimatedLoadTotal: 1100,
            actualLoadTotal: 1020,
            complianceRate: 93,
          },
          {
            title: 'Unsaved idea',
            status: 'DRAFT',
            updatedAt: new Date('2026-08-03T10:00:00Z'),
          },
        ],
      })),
    },
    coachTools: {
      currentTime: jest.fn(async () => ({
        server: { date: '2026-08-02' },
        user: { date: '2026-08-03' },
      })),
      profileCurrent: jest.fn(async () => ({
        sportType: 'RUN',
        demographics: { age: 36, gender: 'MALE' },
        body: { heightCm: 178, weightKg: 70 },
      })),
      trainingBaseline: jest.fn(async () => ({
        personalizationReadiness: 'adequate',
        averageWeek: { activityCount: 4, activeDays: 4, totalDistanceKm: 42 },
      })),
      trainingReadiness: jest.fn(async () => ({
        latestAvailableDate: '2026-08-03',
        current: { ATL: 82, CTL: 48, TSB: -34 },
        windows: { last28: { totalLoad: 720, activeDays: 17 } },
      })),
      pmcRange: jest.fn(async () => ({
        from: '2026-07-07',
        to: '2026-08-03',
        granularity: 'day',
        points: [{ date: '2026-08-03', ATL: 82, CTL: 48, TSB: -34 }],
        summary: {
          activeDays: 17,
          restDays: 11,
          totalLoad: 720,
          avgDailyLoad: 25.7,
        },
      })),
      metricCurrent: jest.fn(async () => ({
        asOf: '2026-08-03',
        items: [
          { metric: 'weight', value: 70 },
          { metric: 'vo2Max', effectiveCurrent: 51.2 },
          { metric: 'cs', effectiveCurrent: 4.1 },
        ],
      })),
      metricHistory: jest.fn(
        async (_ctx: unknown, input: { metric: string }) => ({
          metric: input.metric,
          source: input.metric === 'weight' ? 'body' : 'auto',
          unit: input.metric === 'weight' ? 'kg' : undefined,
          range: { from: '2026-05-06', to: '2026-08-03' },
          summary: { count: 2, deltaFromStart: 1.2 },
          points: [
            { date: '2026-07-01', value: 50 },
            { date: '2026-08-01', value: 51.2 },
          ],
        }),
      ),
      bestsSummary: jest.fn(async () => ({
        sportType: 'RUN',
        mode: 'distance',
        itemCount: 1,
        items: [{ key: '5k', paceSec: 240, timeSec: 1200 }],
      })),
      workoutIntensityStrategy: jest.fn(async () => ({
        anchorDate: '2026-08-03',
        recentData: { activityCount: 12 },
        thresholds: { pace: { cs: 4.1, vo2max: 51.2 } },
        recommendation: { primaryMetric: 'pace', expression: 'zone' },
      })),
    },
  };
}

describe('trainingPlanContextTool', () => {
  it('aggregates current readiness, 28-day PMC, body data, and capability trends', async () => {
    const ctx = context();
    const output = await trainingPlanContextTool.execute(ctx as never, {
      asOf: '2026-08-03',
      sportType: 'RUN',
    });

    expect(output).toMatchObject({
      kind: 'training_plan_context',
      asOf: '2026-08-03',
      sportType: 'RUN',
      profile: { body: { heightCm: 178, weightKg: 70 } },
      planHistory: {
        primaryReference: 'ACTIVE',
        currentActive: {
          title: 'Active marathon build',
          status: 'ACTIVE',
          completedWorkoutCount: 7,
          complianceRate: 91,
        },
        latestCompleted: {
          title: 'Previous base block',
          status: 'COMPLETED',
          completedWorkoutCount: 21,
          complianceRate: 93,
          cycleReview: {
            adherenceScore: 88,
            progressLabel: 'UP',
            riskFlags: { skippedCount: 3, movedCount: 1 },
          },
        },
      },
      recentTraining: {
        readiness: { current: { TSB: -34 } },
        pmc28: { from: '2026-07-07', to: '2026-08-03' },
      },
      dataQuality: {
        personalizationReadiness: 'adequate',
        latestPmcDate: '2026-08-03',
        missingCoreFields: [],
      },
    });
    expect(output.capabilities.metricTrends as unknown[]).toHaveLength(3);
    expect(ctx.coachTools.trainingBaseline).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ weeks: 4, excludeCurrentWeek: true }),
    );
    expect(ctx.coachTools.pmcRange).toHaveBeenCalledWith(ctx, {
      from: '2026-07-07',
      to: '2026-08-03',
      granularity: 'day',
    });
    expect(ctx.planService.listPlans).toHaveBeenCalledWith('user-1');
  });

  it('falls back to the latest completed plan and ignores drafts and cancelled plans', async () => {
    const ctx = context();
    ctx.planService.listPlans.mockResolvedValueOnce({
      plans: [
        {
          title: 'Newest draft',
          status: 'DRAFT',
          updatedAt: new Date('2026-08-03T10:00:00Z'),
        },
        {
          id: 'older-completed-plan',
          title: 'Older completed plan',
          status: 'COMPLETED',
          endDate: '2026-06-01',
          updatedAt: new Date('2026-06-01T10:00:00Z'),
        },
        {
          id: 'latest-completed-plan',
          title: 'Latest completed plan',
          status: 'COMPLETED',
          endDate: '2026-07-15',
          updatedAt: new Date('2026-07-15T10:00:00Z'),
        },
        {
          title: 'Cancelled plan',
          status: 'CANCELLED',
          updatedAt: new Date('2026-08-02T10:00:00Z'),
        },
      ],
    });

    const output = await trainingPlanContextTool.execute(ctx as never, {
      asOf: '2026-08-03',
      sportType: 'RUN',
    });

    expect(output.planHistory).toMatchObject({
      primaryReference: 'LATEST_COMPLETED',
      currentActive: null,
      latestCompleted: {
        title: 'Latest completed plan',
        status: 'COMPLETED',
      },
    });
  });

  it('uses the user-local date when asOf is omitted', async () => {
    const ctx = context();
    const output = await trainingPlanContextTool.execute(ctx as never, {
      sportType: 'run',
    });

    expect(output.asOf).toBe('2026-08-03');
    expect(ctx.coachTools.currentTime).toHaveBeenCalledWith(ctx);
  });

  it('rejects malformed anchor dates', async () => {
    const result = await trainingPlanContextTool.validateInput!(
      context() as never,
      {
        asOf: '03/08/2026',
      },
    );

    expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });
});
