import { describe, expect, it, jest } from '@jest/globals';
import { SportType, UserFitnessMetricType } from '@prisma/client';
import { ActivityRecomputeJobService } from '../activity-recompute-job.service';

describe('ActivityRecomputeJobService', () => {
  it('scans a direct MANUAL change through the complete causal suffix', async () => {
    const create = jest.fn(async ({ data }: { data: object }) => ({
      id: 'job-1',
      ...data,
    }));
    const findNextManualFitnessMetric = jest.fn();
    const prisma = {
      activityRecomputeJob: {
        findUnique: jest.fn(async () => null),
        create,
      },
    };
    const service = new ActivityRecomputeJobService(
      prisma as never,
      { get: jest.fn(() => undefined) } as never,
      {
        getActivityRecomputePolicyForUser: jest.fn(async () => ({
          lookbackDays: 7,
          entitlement: 'FREE',
        })),
        getPreferredTimezone: jest.fn(async () => 'UTC'),
        findNextManualFitnessMetric,
      } as never,
    );

    await service.scheduleFitnessMetricChangeRecompute({
      userId: 'user-1',
      metricType: 'FTP',
      originalType: UserFitnessMetricType.FTP,
      sportType: SportType.CYCLING,
      changedTimes: [Date.parse('2026-01-01T00:00:00.000Z')],
    });

    expect(findNextManualFitnessMetric).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recomputeFrom: new Date('2026-01-01T00:00:00.000Z'),
        recomputeTo: expect.any(Date),
        lookbackDays: 7,
        priority: 100,
      }),
    });
  });

  it('does not drop a context change that arrives while the deduplicated job is running', async () => {
    const create = jest.fn(
      async ({ data }: { data: { dedupeKey: string } }) => ({
        id: 'job-followup',
        ...data,
      }),
    );
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'job-running',
        status: 'RUNNING',
        recomputeFrom: new Date('2026-01-01T00:00:00.000Z'),
        recomputeTo: new Date('2026-01-02T00:00:00.000Z'),
      })
      .mockResolvedValueOnce(null);
    const prisma = {
      activityRecomputeJob: { findUnique, create },
    };
    const service = new ActivityRecomputeJobService(
      prisma as never,
      { get: jest.fn(() => undefined) } as never,
      {
        getActivityRecomputePolicyForUser: jest.fn(async () => ({
          lookbackDays: 7,
          entitlement: 'FREE',
        })),
        getPreferredTimezone: jest.fn(async () => 'UTC'),
      } as never,
    );

    const result = await service.scheduleContextChangeRecompute({
      userId: 'user-1',
      contextType: 'PROFILE',
      changedTimes: [Date.parse('2026-01-03T00:00:00.000Z')],
    });

    expect(result.scheduled).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dedupeKey: expect.stringContaining(':followup'),
        recomputeFrom: new Date('2026-01-03T00:00:00.000Z'),
      }),
    });
  });
});
