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

  it.each([
    [
      '2026-03-08T00:30:00.000Z',
      undefined,
      undefined,
      'UTC',
      '2026-03-08T02:00:00.000Z',
    ],
    [
      '2026-03-07T23:59:00.000Z',
      'Bad/Profile',
      'Bad/Override',
      'UTC',
      '2026-03-08T02:00:00.000Z',
    ],
    [
      '2026-03-08T04:50:00.000Z',
      'America/New_York',
      undefined,
      'America/New_York',
      '2026-03-08T07:00:00.000Z',
    ],
    [
      '2026-03-08T00:30:00.000Z',
      undefined,
      'Asia/Shanghai',
      'Asia/Shanghai',
      '2026-03-08T18:00:00.000Z',
    ],
  ])(
    'schedules a recompute in a validated timezone at %s (%s, %s)',
    async (now, preferred, fallback, zone, availableAt) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(now));
      try {
        const update = jest.fn(async ({ data }: { data: object }) => ({
          id: 'job',
          ...data,
        }));
        const tx = {
          $executeRaw: jest.fn(async () => 1),
          $queryRaw: jest.fn(async () => [
            {
              id: 'job',
              status: 'SCHEDULED',
              recomputeFrom: new Date('2026-01-01T00:00:00.000Z'),
              recomputeTo: new Date(now),
            },
          ]),
          activityRecomputeJob: { update },
        };
        const service = new ActivityRecomputeJobService(
          {
            $transaction: async (
              callback: (transaction: typeof tx) => unknown,
            ) => callback(tx),
          } as never,
          {
            get: (key: string) =>
              ({
                'activityRecomputePolicy.defaultTimezone': fallback,
                'activityRecomputePolicy.nightlyJitterMinutes': 0,
              })[key],
          } as never,
          {
            getPreferredTimezone: async () => preferred,
            getActivityRecomputePolicyForUser: async () => ({
              lookbackDays: 7,
              entitlement: 'FREE',
            }),
          } as never,
        );
        await service.scheduleContextChangeRecompute({
          userId: 'user-1',
          contextType: 'PROFILE',
          changedTimes: [Date.parse('2026-01-01T00:00:00.000Z')],
        });
        expect(update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              availableAt: new Date(availableAt),
              triggerPayload: expect.objectContaining({ timezone: zone }),
            }),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    },
  );

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
