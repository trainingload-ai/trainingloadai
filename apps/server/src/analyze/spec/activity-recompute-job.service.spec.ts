import { describe, expect, it, jest } from '@jest/globals';
import { SportType, UserFitnessMetricType } from '@prisma/client';
import { ActivityRecomputeJobService } from '../activity-recompute-job.service';

describe('ActivityRecomputeJobService', () => {
  it('scans a direct MANUAL change through the complete causal suffix', async () => {
    const update = jest.fn(async ({ data }: { data: object }) => ({
      id: 'job-1',
      ...data,
    }));
    const findNextManualFitnessMetric = jest.fn();
    const transaction = {
      $executeRaw: jest.fn(async () => 1),
      $queryRaw: jest.fn(async () => [
        {
          id: 'job-1',
          status: 'SCHEDULED',
          recomputeFrom: new Date('2026-01-01T00:00:00.000Z'),
          recomputeTo: new Date('2026-01-02T00:00:00.000Z'),
        },
      ]),
      activityRecomputeJob: {
        update,
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (work: (tx: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
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
    expect(update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        recomputeFrom: new Date('2026-01-01T00:00:00.000Z'),
        recomputeTo: expect.any(Date),
        lookbackDays: 7,
        priority: 100,
      }),
    });
  });

  it('does not drop a context change that arrives while the deduplicated job is running', async () => {
    const update = jest.fn(
      async ({ data }: { data: { dedupeKey: string } }) => ({
        id: 'job-followup',
        ...data,
      }),
    );
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'job-running',
          status: 'RUNNING',
          recomputeFrom: new Date('2026-01-01T00:00:00.000Z'),
          recomputeTo: new Date('2026-01-02T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'job-followup',
          status: 'SCHEDULED',
          recomputeFrom: new Date('2026-01-03T00:00:00.000Z'),
          recomputeTo: new Date('2026-01-04T00:00:00.000Z'),
        },
      ]);
    const transaction = {
      $executeRaw: jest.fn(async () => 1),
      $queryRaw: queryRaw,
      activityRecomputeJob: { update },
    };
    const prisma = {
      $transaction: jest.fn(
        async (work: (tx: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
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
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'job-followup' },
      data: expect.objectContaining({
        dedupeKey: expect.stringContaining(':followup'),
        recomputeFrom: new Date('2026-01-03T00:00:00.000Z'),
      }),
    });
  });
});
