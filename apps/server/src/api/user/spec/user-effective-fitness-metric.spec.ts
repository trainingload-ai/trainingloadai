import { describe, expect, it, jest } from '@jest/globals';
import { MetricSource, SportType, UserFitnessMetricType } from '@prisma/client';

import { UserService } from '../user.service';
import { UserQueryService } from '../user-query.service';
import { UserIdentityRepository } from '../persistence/user-identity.repository';

function userServiceDependencies(prisma: object) {
  return [
    {} as never,
    { emitAsync: jest.fn(async () => []) } as never,
    new UserQueryService(new UserIdentityRepository(prisma as never)),
  ] as const;
}

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

function metric(overrides: Record<string, unknown>) {
  return {
    id: String(overrides.id ?? 'metric'),
    userId: 'user-1',
    type: UserFitnessMetricType.LTHR,
    sport: SportType.RUN,
    source: MetricSource.AUTO,
    recordedAt: new Date('2026-08-04T00:00:00.000Z'),
    value: 170,
    value2: null,
    ...overrides,
  };
}

function createService(rows: ReturnType<typeof metric>[]) {
  const prisma = {
    userFitnessMetric: {
      findMany: jest.fn<AsyncFn>(async () => rows),
      findFirst: jest.fn<AsyncFn>(async () => null),
    },
  };
  const service = new UserService(
    prisma as never,
    {} as never,
    { get: jest.fn() } as never,
    ...userServiceDependencies(prisma),
  );
  return { service, prisma };
}

describe('UserService effective fitness metric reads', () => {
  it('queries MANUAL and AUTO up to the requested instant and lets MANUAL win a timestamp tie', async () => {
    const at = new Date('2026-08-04T12:00:00.000Z');
    const { service, prisma } = createService([
      metric({ id: 'auto', source: MetricSource.AUTO, value: 171 }),
      metric({ id: 'manual', source: MetricSource.MANUAL, value: 173 }),
    ]);

    const selected = await service.getEffectiveUserFitnessMetric(
      'user-1',
      UserFitnessMetricType.LTHR,
      at,
      SportType.RUN,
    );

    expect(selected?.id).toBe('manual');
    expect(prisma.userFitnessMetric.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: UserFitnessMetricType.LTHR,
        source: { in: [MetricSource.MANUAL, MetricSource.AUTO] },
        sport: { in: [SportType.RUN, SportType.UNKNOWN] },
        recordedAt: { lte: at },
      },
      orderBy: { recordedAt: 'desc' },
      distinct: ['sport', 'source'],
    });
  });

  it('walks backward from the cutoff and returns the newest usable past value', async () => {
    const at = new Date('2026-08-04T12:00:00.000Z');
    const rows = [
      metric({
        id: 'future-auto',
        recordedAt: new Date('2026-08-05T00:00:00.000Z'),
        source: MetricSource.AUTO,
        value: 180,
      }),
      metric({
        id: 'older-manual',
        recordedAt: new Date('2026-08-01T00:00:00.000Z'),
        source: MetricSource.MANUAL,
        value: 168,
      }),
      metric({
        id: 'latest-past-auto',
        recordedAt: new Date('2026-08-03T00:00:00.000Z'),
        source: MetricSource.AUTO,
        value: 172,
      }),
    ];
    const prisma = {
      userFitnessMetric: {
        findMany: jest.fn<AsyncFn>(
          async (args: { where: { recordedAt?: { lte?: Date } } }) => {
            const cutoff = args.where.recordedAt?.lte;
            return rows.filter(
              (row) =>
                !cutoff ||
                (row.recordedAt as Date).getTime() <= cutoff.getTime(),
            );
          },
        ),
      },
    };
    const service = new UserService(
      prisma as never,
      {} as never,
      { get: jest.fn() } as never,
      ...userServiceDependencies(prisma),
    );

    const selected = await service.getEffectiveUserFitnessMetric(
      'user-1',
      UserFitnessMetricType.LTHR,
      at,
      SportType.RUN,
    );

    expect(selected?.id).toBe('latest-past-auto');
    expect(selected?.value).toBe(172);
  });

  it('fills missing activity snapshot fields from effective MANUAL/AUTO history', async () => {
    const prisma = {
      activityFitnessMetricsSnapshot: {
        findUnique: jest.fn<AsyncFn>(async () => ({
          maxHrValue: 190,
          restHrValue: null,
          lthrValue: null,
        })),
      },
      userFitnessMetric: {
        findMany: jest.fn<AsyncFn>(
          async (args: { where: { type: UserFitnessMetricType } }) => {
            if (args.where.type === UserFitnessMetricType.RESTING_HR) {
              return [
                metric({
                  type: UserFitnessMetricType.RESTING_HR,
                  sport: SportType.UNKNOWN,
                  source: MetricSource.MANUAL,
                  value: 48,
                }),
              ];
            }
            if (args.where.type === UserFitnessMetricType.LTHR) {
              return [metric({ source: MetricSource.AUTO, value: 172 })];
            }
            return [];
          },
        ),
      },
    };
    const service = new UserService(
      prisma as never,
      {} as never,
      { get: jest.fn() } as never,
      ...userServiceDependencies(prisma),
    );

    await expect(
      service.getUserHeartRateThreshold('user-1', SportType.RUN, undefined, 42),
    ).resolves.toEqual({
      maxHeartRate: 190,
      restingHeartRate: 48,
      lactateThresholdHeartRate: 172,
    });
  });

  it('does not remove the time cutoff when a source-specific lookup misses', async () => {
    const at = new Date('2026-08-02T07:00:00.000Z');
    const { service, prisma } = createService([]);

    await expect(
      service.getUserFitnessMetric(
        'user-1',
        UserFitnessMetricType.FTP,
        at,
        SportType.CYCLING,
        MetricSource.AUTO,
      ),
    ).resolves.toBeNull();

    expect(prisma.userFitnessMetric.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.userFitnessMetric.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 'user-1',
        type: UserFitnessMetricType.FTP,
        source: MetricSource.AUTO,
        sport: SportType.CYCLING,
        recordedAt: { lte: at },
      },
      orderBy: { recordedAt: 'desc' },
    });
    expect(prisma.userFitnessMetric.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'user-1',
        type: UserFitnessMetricType.FTP,
        source: MetricSource.AUTO,
        sport: SportType.UNKNOWN,
        recordedAt: { lte: at },
      },
      orderBy: { recordedAt: 'desc' },
    });
  });

  it('does not let a composed historical profile fall forward to future fitness metrics', async () => {
    const at = new Date('2026-08-02T07:00:00.000Z');
    const prisma = {
      userProfile: { findUnique: jest.fn<AsyncFn>(async () => null) },
      userBodyMetric: { findMany: jest.fn<AsyncFn>(async () => []) },
      userFitnessMetric: { findMany: jest.fn<AsyncFn>(async () => []) },
    };
    const service = new UserService(
      prisma as never,
      {} as never,
      { get: jest.fn() } as never,
      ...userServiceDependencies(prisma),
    );

    const profile = await service.getComposedUserProfile(
      'user-1',
      SportType.RUN,
      at,
    );

    expect(profile?.lthr).toBeUndefined();
    expect(prisma.userFitnessMetric.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.userFitnessMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ recordedAt: { lte: at } }),
      }),
    );
  });
});
