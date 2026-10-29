import { describe, expect, it, jest } from '@jest/globals';
import { planRecentTool } from '../planRecent.tool';

function plan(status: 'ACTIVE' | 'COMPLETED', id: string) {
  return {
    id,
    userId: 'user-1',
    title: id,
    sourceType: 'MANUAL',
    status,
    periodWeeks: 4,
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-07-28T00:00:00.000Z'),
    currentWeekIndex: status === 'ACTIVE' ? 2 : null,
    currentDayIndex: status === 'ACTIVE' ? 3 : null,
    workouts: [],
    coachSummary:
      status === 'COMPLETED'
        ? {
            adherenceScore: 84,
            progressLabel: 'UP',
            keyDrivers: { completionRate: 84 },
            riskFlags: { skippedCount: 2 },
            nextCycleSuggestion: { suggestedProgressLabel: 'UP' },
            markdown: '- completionRate: 84%',
          }
        : null,
  };
}

function context(active: unknown, completed: unknown) {
  const findFirst = jest
    .fn()
    .mockResolvedValueOnce(active as never)
    .mockResolvedValueOnce(completed as never);
  return {
    findFirst,
    ctx: {
      session: { user: { id: 'user-1' } },
      planQuery: { findCoachPlanSnapshot: findFirst },
    } as never,
  };
}

describe('planRecentTool', () => {
  it('prefers the active plan without querying completed history', async () => {
    const { ctx, findFirst } = context(plan('ACTIVE', 'active-plan'), null);
    const result = await planRecentTool.execute(ctx, {
      asOf: '2026-07-10',
      includeAllWorkouts: true,
    });

    expect(result.plan?.id).toBe('active-plan');
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('falls back to the latest completed plan and exposes its cycle review', async () => {
    const { ctx, findFirst } = context(
      null,
      plan('COMPLETED', 'completed-plan'),
    );
    const result = await planRecentTool.execute(ctx, {
      asOf: '2026-08-01',
      includeAllWorkouts: true,
    });

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(result.plan?.id).toBe('completed-plan');
    expect(result.plan?.status).toBe('COMPLETED');
    expect(result.plan?.cycleReview?.adherenceScore).toBe(84);
  });
});
