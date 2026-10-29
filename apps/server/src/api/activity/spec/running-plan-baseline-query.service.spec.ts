import { describe, expect, it, jest } from '@jest/globals';

import { RunningPlanBaselineQueryService } from '../running-plan-baseline-query.service';

describe('RunningPlanBaselineQueryService', () => {
  it('uses the all-history longest run while keeping recent baseline windows', async () => {
    const activity = {
      findMany: jest.fn(async () => [
        {
          id: 1,
          startTime: new Date('2026-08-28T08:00:00.000Z'),
          timerTime: 2_400,
          elapsedTime: 2_500,
          distance: 6_000,
          activityPerformanceTTs: [],
        },
      ]),
      aggregate: jest.fn(async () => ({ _max: { distance: 15_000.4 } })),
    };
    const service = new RunningPlanBaselineQueryService({ activity } as never);

    const result = await service.get(
      'user-1',
      new Date('2026-08-30T12:00:00.000Z'),
    );

    expect(result.longestRunDistanceMeters).toBe(15_000);
    expect(result.longestContinuousRunMinutes).toBe(40);
    expect(activity.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ _max: { distance: true } }),
    );
  });

  it('returns no historical longest run when no completed run has distance', async () => {
    const activity = {
      findMany: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _max: { distance: null } })),
    };
    const service = new RunningPlanBaselineQueryService({ activity } as never);

    const result = await service.get(
      'user-1',
      new Date('2026-08-30T12:00:00.000Z'),
    );

    expect(result.longestRunDistanceMeters).toBeNull();
  });
});
