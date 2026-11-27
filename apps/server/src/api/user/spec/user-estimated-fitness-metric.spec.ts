import { describe, expect, it, jest } from '@jest/globals';
import {
  ChangeSource,
  MetricSource,
  SportType,
  UserFitnessMetricType,
} from '@prisma/client';

import { UserService } from '../user.service';
import { UserQueryService } from '../user-query.service';
import { UserIdentityRepository } from '../persistence/user-identity.repository';
import { powerModelOriginPayload } from '../power-metric-evidence';

function userServiceDependencies(prisma: object, autoEnabled = true) {
  return [
    {} as never,
    { emitAsync: jest.fn(async () => []) } as never,
    new UserQueryService(new UserIdentityRepository(prisma as never)),
    {
      resolveAutoUpdateAt: jest.fn(async () => autoEnabled),
      recordAutoUpdateVersion: jest.fn(async () => ({})),
    } as never,
  ] as const;
}

type AsyncFn = (...args: unknown[]) => Promise<unknown>;

type FitnessMetricRow = {
  id: string;
  userId: string;
  type: UserFitnessMetricType;
  sport: SportType;
  value: number;
  value2: number | null;
  source: MetricSource;
  recordedAt: Date;
  createdAt: Date;
  changeSource: ChangeSource | null;
  originProvider: null;
  originExternalId: null;
  originChecksum: null;
  originPayload: null;
  originSyncedAt: null;
  projectionVersion: number | null;
  projectionRunId: string | null;
  projectionFingerprint: string | null;
};

function createMetric(
  data: Partial<FitnessMetricRow> & { source: MetricSource },
): FitnessMetricRow {
  return {
    id: data.id ?? `metric-${data.source}`,
    userId: data.userId ?? 'user-1',
    type: data.type ?? UserFitnessMetricType.LTHR,
    sport: data.sport ?? SportType.RUN,
    value: data.value ?? 170,
    value2: data.value2 ?? null,
    source: data.source,
    recordedAt: data.recordedAt ?? new Date('2026-08-04T00:00:00.000Z'),
    createdAt: data.createdAt ?? new Date('2026-08-04T00:00:00.000Z'),
    changeSource: data.changeSource ?? null,
    originProvider: null,
    originExternalId: null,
    originChecksum: null,
    originPayload: null,
    originSyncedAt: null,
    projectionVersion: null,
    projectionRunId: null,
    projectionFingerprint: null,
    ...data,
  };
}

function createService(options?: {
  autoEnabled?: boolean;
  estimatedRows?: FitnessMetricRow[];
  autoRows?: FitnessMetricRow[];
  currentMetric?: FitnessMetricRow | null;
}) {
  const created: FitnessMetricRow[] = [];
  const prisma = {
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn<AsyncFn>(async (callback) =>
      (callback as (tx: unknown) => Promise<unknown>)(prisma),
    ),
    userAutoUpdateConfig: {
      findMany: jest.fn<AsyncFn>(async () => []),
      findUnique: jest.fn<AsyncFn>(async () => ({
        enabled: options?.autoEnabled ?? true,
      })),
      upsert: jest.fn<AsyncFn>(
        async ({
          create,
          update,
        }: {
          create: { metric: UserFitnessMetricType };
          update: { enabled: boolean };
        }) => ({
          metric: create.metric,
          enabled: update.enabled,
        }),
      ),
    },
    userFitnessMetric: {
      findMany: jest.fn<AsyncFn>(
        async (args: {
          where?: { source?: MetricSource | { in?: MetricSource[] } };
        }) => {
          if (args?.where?.source === MetricSource.ESTIMATED) {
            return options?.estimatedRows ?? [];
          }
          if (args?.where?.source === MetricSource.AUTO) {
            return options?.autoRows ?? [];
          }
          if (
            typeof args?.where?.source === 'object' &&
            args.where.source?.in
          ) {
            return [
              createMetric({
                id: 'max-hr-baseline',
                type: UserFitnessMetricType.MAX_HR,
                sport: SportType.UNKNOWN,
                source: MetricSource.MANUAL,
                value: 200,
              }),
              createMetric({
                id: 'rest-hr-baseline',
                type: UserFitnessMetricType.RESTING_HR,
                sport: SportType.UNKNOWN,
                source: MetricSource.MANUAL,
                value: 60,
              }),
            ];
          }
          return options?.estimatedRows ?? [];
        },
      ),
      findFirst: jest.fn<AsyncFn>(async () => options?.currentMetric ?? null),
      create: jest.fn<AsyncFn>(
        async ({ data }: { data: Parameters<typeof createMetric>[0] }) => {
          const row = createMetric(data);
          created.push(row);
          return row;
        },
      ),
      update: jest.fn<AsyncFn>(
        async ({ data }: { data: Parameters<typeof createMetric>[0] }) =>
          createMetric(data),
      ),
    },
  };
  const service = new UserService(
    prisma as never,
    {} as never,
    { get: jest.fn() } as never,
    ...userServiceDependencies(prisma, options?.autoEnabled ?? true),
    {
      observe: async (
        _userId: unknown,
        _tx: unknown,
        write: () => Promise<unknown>,
      ) => write(),
    } as never,
  );
  return { service, prisma, created };
}

describe('UserService estimated fitness metric tracks', () => {
  it('returns the effective AUTO timeline for metric charts', async () => {
    const autoRows = [
      createMetric({
        id: 'vo2-auto-1',
        type: UserFitnessMetricType.VO2_MAX,
        sport: SportType.UNKNOWN,
        source: MetricSource.AUTO,
        value: 42,
      }),
    ];
    const { service, prisma } = createService({
      estimatedRows: [
        createMetric({
          id: 'vo2-estimate-1',
          type: UserFitnessMetricType.VO2_MAX,
          sport: SportType.UNKNOWN,
          source: MetricSource.ESTIMATED,
          value: 99,
        }),
      ],
      autoRows,
    });

    const rows = await service.listAutoFitnessMetricsForChart(
      'user-1',
      UserFitnessMetricType.VO2_MAX,
      SportType.UNKNOWN,
    );

    expect(rows).toEqual([
      expect.objectContaining({ id: 'vo2-auto-1', value: 42 }),
    ]);
    expect(prisma.userFitnessMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: MetricSource.AUTO }),
      }),
    );
  });

  it('always writes ESTIMATED and does not update AUTO when auto update is disabled', async () => {
    const { service, created } = createService({ autoEnabled: false });

    await service.upsertFitnessMetric(
      'user-1',
      UserFitnessMetricType.LTHR,
      172,
      SportType.RUN,
      undefined,
      MetricSource.AUTO,
      new Date('2026-08-04T12:00:00.000Z'),
    );

    expect(created.map((row) => row.source)).toEqual([MetricSource.ESTIMATED]);
    expect(created[0]?.value).toBe(172);
  });

  const cyclingPowerEvidence = {
    originPayload: powerModelOriginPayload([
      { seconds: 1200, watts: 300, activityId: 9 },
    ]),
  };

  describe.each([false, true])(
    'pace precision with automatic updates enabled=%s',
    (autoEnabled) => {
      it.each([UserFitnessMetricType.TP, UserFitnessMetricType.CS])(
        'keeps fractional %s in every written track',
        async (type) => {
          const { service, created } = createService({ autoEnabled });
          const value = 3.123456;
          const value2 =
            type === UserFitnessMetricType.TP ? 1000 / value : 123.456789;
          await service.upsertFitnessMetric(
            'user-1',
            type,
            value,
            SportType.RUN,
            value2,
            MetricSource.AUTO,
            new Date('2026-08-04T12:00:00.000Z'),
          );

          expect(
            created.map((row) => [row.source, row.value, row.value2]),
          ).toEqual([
            [MetricSource.ESTIMATED, value, value2],
            ...(autoEnabled ? [[MetricSource.AUTO, value, value2]] : []),
          ]);
        },
      );
    },
  );

  it('writes ESTIMATED and AUTO when auto update is enabled', async () => {
    const { service, created } = createService({ autoEnabled: true });

    await service.upsertFitnessMetric(
      'user-1',
      UserFitnessMetricType.FTP,
      285,
      SportType.CYCLING,
      undefined,
      MetricSource.AUTO,
      new Date('2026-08-04T12:00:00.000Z'),
      cyclingPowerEvidence,
    );

    expect(created.map((row) => row.source)).toEqual([
      MetricSource.ESTIMATED,
      MetricSource.AUTO,
    ]);
    expect(created.every((row) => row.originPayload)).toBe(true);
    expect(created.find((row) => row.source === MetricSource.AUTO)?.recordedAt).toEqual(
      new Date('2026-08-04T12:00:00.000Z'),
    );
  });

  it('does not publish an automatic power metric without peak evidence', async () => {
    const { service, prisma, created } = createService({ autoEnabled: true });

    await expect(
      service.upsertFitnessMetric(
        'user-1',
        UserFitnessMetricType.CP,
        250,
        SportType.CYCLING,
        undefined,
        MetricSource.AUTO,
        new Date('2026-08-04T12:00:00.000Z'),
      ),
    ).resolves.toBeNull();
    await expect(
      service.upsertAutoFitnessMetrics('user-1', SportType.CYCLING, [
        { type: UserFitnessMetricType.CP, value: 250 },
        { type: UserFitnessMetricType.FTP, value: 238 },
      ]),
    ).resolves.toEqual([]);

    expect(created).toHaveLength(0);
    expect(prisma.userFitnessMetric.create).not.toHaveBeenCalled();
  });

  it('does not persist an AUTO calendar-day snap and still persists MANUAL', async () => {
    const { service, created } = createService({ autoEnabled: true });
    const midnight = new Date('2026-07-16T00:00:00.000Z');

    const rejected = await service.upsertFitnessMetric(
      'legacy-athlete',
      UserFitnessMetricType.LTHR,
      168,
      SportType.RUN,
      undefined,
      MetricSource.AUTO,
      midnight,
      {
        originPayload: {
          method: 'PASSIVE_30M_TAIL20',
          observationIds: ['obs-1'],
        },
      },
    );
    const manual = await service.upsertFitnessMetric(
      'legacy-athlete',
      UserFitnessMetricType.LTHR,
      164,
      SportType.RUN,
      undefined,
      MetricSource.MANUAL,
      midnight,
    );

    expect(rejected).toBeNull();
    expect(created.map((row) => row.source)).toEqual([
      MetricSource.ESTIMATED,
      MetricSource.MANUAL,
    ]);
    expect(manual).toEqual(
      expect.objectContaining({
        source: MetricSource.MANUAL,
        value: 164,
        recordedAt: midnight,
      }),
    );
  });

  it('publishes one power model with one transaction and one user lock', async () => {
    const { service, prisma, created } = createService({ autoEnabled: true });
    const recordedAt = new Date('2026-10-13T12:00:00.000Z');

    await service.upsertAutoFitnessMetrics(
      'user-1',
      SportType.CYCLING,
      [
        { type: UserFitnessMetricType.CP, value: 401 },
        { type: UserFitnessMetricType.FTP, value: 381 },
        { type: UserFitnessMetricType.P_MAX, value: 800 },
        { type: UserFitnessMetricType.W_PRIME, value: 84_655 },
      ],
      recordedAt,
      cyclingPowerEvidence,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 15_000,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(8);
    expect(created.map(({ type, source }) => [type, source])).toEqual([
      [UserFitnessMetricType.CP, MetricSource.ESTIMATED],
      [UserFitnessMetricType.CP, MetricSource.AUTO],
      [UserFitnessMetricType.FTP, MetricSource.ESTIMATED],
      [UserFitnessMetricType.FTP, MetricSource.AUTO],
      [UserFitnessMetricType.P_MAX, MetricSource.ESTIMATED],
      [UserFitnessMetricType.P_MAX, MetricSource.AUTO],
      [UserFitnessMetricType.W_PRIME, MetricSource.ESTIMATED],
      [UserFitnessMetricType.W_PRIME, MetricSource.AUTO],
    ]);
  });

  it('queues same-user writes before opening the next transaction', async () => {
    const { service, prisma } = createService();
    let opened = 0;
    let releaseFirst!: () => void;
    let markFirstOpened!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstOpened = new Promise<void>((resolve) => {
      markFirstOpened = resolve;
    });
    prisma.$transaction.mockImplementation(async (...args: unknown[]) => {
      const callback = args[0] as (tx: unknown) => Promise<unknown>;
      opened += 1;
      if (opened === 1) {
        markFirstOpened();
        await firstGate;
      }
      return callback(prisma);
    });

    const first = service.upsertFitnessMetric(
      'user-1',
      UserFitnessMetricType.VO2_MAX,
      50,
      SportType.UNKNOWN,
      undefined,
      MetricSource.MANUAL,
    );
    await firstOpened;
    const second = service.upsertFitnessMetric(
      'user-1',
      UserFitnessMetricType.VO2_MAX,
      51,
      SportType.UNKNOWN,
      undefined,
      MetricSource.MANUAL,
    );
    await Promise.resolve();

    expect(opened).toBe(1);
    releaseFirst();
    await Promise.all([first, second]);
    expect(opened).toBe(2);
  });

  it('promotes the latest ESTIMATED value for each sport when auto update is enabled', async () => {
    const estimatedRows = [
      createMetric({
        id: 'run-new',
        source: MetricSource.ESTIMATED,
        sport: SportType.RUN,
        value: 173,
        recordedAt: new Date('2026-08-03T00:00:00.000Z'),
      }),
      createMetric({
        id: 'run-old',
        source: MetricSource.ESTIMATED,
        sport: SportType.RUN,
        value: 169,
        recordedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
      createMetric({
        id: 'cycling-new',
        source: MetricSource.ESTIMATED,
        sport: SportType.CYCLING,
        value: 166,
        recordedAt: new Date('2026-08-02T00:00:00.000Z'),
      }),
    ];
    const { service, created } = createService({
      autoEnabled: false,
      estimatedRows,
    });

    await service.updateAutoUpdateConfig(
      'user-1',
      UserFitnessMetricType.LTHR,
      true,
    );

    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: MetricSource.AUTO,
          sport: SportType.RUN,
          value: 173,
        }),
        expect.objectContaining({
          source: MetricSource.AUTO,
          sport: SportType.CYCLING,
          value: 166,
        }),
      ]),
    );
    expect(created).toHaveLength(2);
  });

  it('records a fresh AUTO value on enable even when it equals the older AUTO value', async () => {
    const latestEstimate = createMetric({
      id: 'estimated-latest',
      source: MetricSource.ESTIMATED,
      value: 173,
      recordedAt: new Date('2026-08-03T00:00:00.000Z'),
    });
    const olderAuto = createMetric({
      id: 'auto-old',
      source: MetricSource.AUTO,
      value: 173,
      recordedAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    const { service, created } = createService({
      autoEnabled: false,
      estimatedRows: [latestEstimate],
      currentMetric: olderAuto,
    });

    await service.updateAutoUpdateConfig(
      'user-1',
      UserFitnessMetricType.LTHR,
      true,
    );

    expect(created).toEqual([
      expect.objectContaining({
        source: MetricSource.AUTO,
        value: 173,
      }),
    ]);
  });

  it('only promotes ESTIMATED when the switch transitions to enabled', async () => {
    const { service, prisma, created } = createService({
      autoEnabled: true,
      estimatedRows: [
        createMetric({ source: MetricSource.ESTIMATED, value: 173 }),
      ],
    });

    await service.updateAutoUpdateConfig(
      'user-1',
      UserFitnessMetricType.LTHR,
      true,
    );

    expect(prisma.userFitnessMetric.findMany).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });

  it('uses the ESTIMATED track for the client-facing estimated values', async () => {
    const { service } = createService();
    const getMetric = jest
      .spyOn(service, 'getUserFitnessMetric')
      .mockImplementation(async (_userId, type, _at, sport, source) =>
        createMetric({
          type,
          sport: sport ?? SportType.RUN,
          source: source ?? MetricSource.MANUAL,
          value:
            source === MetricSource.ESTIMATED
              ? 180
              : source === MetricSource.AUTO
                ? 170
                : 160,
          recordedAt:
            source === MetricSource.MANUAL
              ? new Date('2026-08-03T00:00:00.000Z')
              : new Date('2026-08-04T00:00:00.000Z'),
        }),
      );

    const pairs = await service.getFitnessMetricPairs({
      userId: 'user-1',
      sportType: SportType.RUN,
    });

    expect(pairs.estimated.LTHR).toBe(180);
    expect(pairs.manual.LTHR).toBe(160);
    expect(pairs.automatic.LTHR).toBe(170);
    expect(pairs.effective.LTHR).toBe(170);
    expect(pairs.effectiveDetails.LTHR).toEqual({
      value: 170,
      source: MetricSource.AUTO,
      recordedAt: new Date('2026-08-04T00:00:00.000Z'),
    });
    expect(getMetric).toHaveBeenCalledWith(
      'user-1',
      UserFitnessMetricType.LTHR,
      undefined,
      SportType.RUN,
      MetricSource.ESTIMATED,
      false,
    );
  });

  it('returns stored speed for Coach and keeps rounded pace seconds for dashboard clients', async () => {
    const { service } = createService();
    jest
      .spyOn(service, 'getUserFitnessMetric')
      .mockImplementation(async (_user, type, _date, sport, source) =>
        type === UserFitnessMetricType.TP && source === MetricSource.AUTO
          ? createMetric({
              type,
              sport: sport ?? SportType.RUN,
              source,
              value: sport === SportType.SWIM ? 1.25 : 4.4,
              recordedAt: new Date('2026-08-04T00:00:00Z'),
            })
          : null,
      );
    for (const [sportType, speed, pace] of [
      [SportType.RUN, 4.4, 227],
      [SportType.SWIM, 1.25, 80],
    ] as const) {
      const args = { userId: 'user-1', sportType };
      expect((await service.getFitnessMetricPairs(args)).effective.TP).toBe(
        pace,
      );
      const forCoach = await service.getFitnessMetricPairs({
        ...args,
        paceRepresentation: 'speed',
      });
      expect(forCoach.effectiveDetails.TP).toMatchObject({
        value: speed,
        source: 'AUTO',
      });
    }
  });

  it('preserves SYSTEM_IMPORTED rows when replacing editable manual fitness metrics', async () => {
    const { service, prisma } = createService();
    const deleteMany = jest.fn(async () => ({ count: 0 }));
    const upsert = jest.fn(async () => ({
      id: 'm1',
      recordedAt: new Date('2026-11-26T00:00:00.000Z'),
    }));
    Object.assign(prisma.userFitnessMetric, { deleteMany, upsert });

    await service.replaceManualFitnessMetricsForDialog({
      userId: 'user-1',
      type: UserFitnessMetricType.FTP,
      sportType: SportType.CYCLING,
      metrics: [{ effectiveDate: '2026-11-26', value: '275' }],
      tx: prisma as never,
    });

    expect(deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'user-1',
        type: UserFitnessMetricType.FTP,
        source: MetricSource.MANUAL,
        sport: SportType.CYCLING,
        OR: [{ changeSource: null }, { changeSource: 'USER_MANUAL' }],
      }),
    });
  });

  it('observes AthleteState fitness facts when replacing manual fitness metrics', async () => {
    const { service, prisma } = createService();
    const observe = jest.fn(
      async (_userId: unknown, _tx: unknown, write: () => Promise<unknown>) =>
        write(),
    );
    (
      service as unknown as { stateFitness: { observe: typeof observe } }
    ).stateFitness = { observe };
    const deleteMany = jest.fn(async () => ({ count: 0 }));
    const upsert = jest.fn(async () => ({
      id: 'm1',
      recordedAt: new Date('2026-11-26T00:00:00.000Z'),
    }));
    Object.assign(prisma.userFitnessMetric, { deleteMany, upsert });

    await service.replaceManualFitnessMetricsForDialog({
      userId: 'user-1',
      type: UserFitnessMetricType.FTP,
      sportType: SportType.CYCLING,
      metrics: [{ effectiveDate: '2026-11-26', value: '275' }],
      tx: prisma as never,
    });

    expect(observe).toHaveBeenCalledWith(
      'user-1',
      prisma,
      expect.any(Function),
    );
  });

  it('does not leak current profile thresholds when resolving historical power zones with an explicit snapshot', async () => {
    const { service, prisma } = createService();
    Object.assign(prisma, {
      userZoneSetting: { findUnique: jest.fn(async () => null) },
    });
    const composedSpy = jest
      .spyOn(service, 'getComposedUserProfile')
      .mockResolvedValue({ ftp: 300, powerZoneModel: 'FRIEL' } as never);

    const resolved = await service.getPowerZoneSettingResolved(
      'user-1',
      SportType.CYCLING,
      { powerZoneModel: 'FRIEL' },
    );

    expect(composedSpy).not.toHaveBeenCalled();
    expect(resolved.zones).toEqual([]);
  });

  it('rejects out-of-range body weight and invalid IANA timezones in replaceUserBodyMetrics', async () => {
    const { service } = createService();

    await expect(
      service.replaceUserBodyMetrics('user-1', 'WEIGHT', [
        { effectiveDate: '2026-11-26', value: '-5' },
      ]),
    ).rejects.toThrow('Invalid body weight');

    await expect(
      service.replaceUserBodyMetrics('user-1', 'TIMEZONE', [
        { effectiveDate: '2026-11-26', value: 'Not/A_Real_Zone' },
      ]),
    ).rejects.toThrow('Invalid IANA timezone');
  });
});
