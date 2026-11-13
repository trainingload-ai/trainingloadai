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
import { UserAnalysisConfigService } from '../user-analysis-config.service';

function analysisConfigs(prisma: object, users: UserQueryService) {
  return new UserAnalysisConfigService(prisma as never, users);
}

describe('UserService.applyTimelineProjectionBatch', () => {
  it('archives then physically deletes stale AUTO before writing exact UTC projections without emitting invalidation', async () => {
    const events = { emitAsync: jest.fn(async () => []) };
    const calls: string[] = [];
    const old = {
      id: 'old-auto',
      userId: 'user-1',
      type: UserFitnessMetricType.FTP,
      sport: SportType.CYCLING,
      value: 250,
      value2: null,
      source: MetricSource.AUTO,
      recordedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      changeSource: ChangeSource.SYSTEM_CALCULATED,
      originProvider: null,
      originExternalId: null,
      originChecksum: null,
      originPayload: null,
      originSyncedAt: null,
      projectionVersion: null,
      projectionRunId: null,
      projectionFingerprint: null,
    };
    const tx = {
      $queryRaw: jest.fn(async () => []),
      userFitnessMetric: {
        findMany: jest.fn(async () => [old]),
        deleteMany: jest.fn(async () => {
          calls.push('delete');
          return { count: 1 };
        }),
        create: jest.fn(async ({ data }: { data: object }) => {
          calls.push('create');
          return data;
        }),
      },
      userFitnessMetricProjectionAudit: {
        upsert: jest.fn(async () => {
          calls.push('archive');
          return {};
        }),
      },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const users = new UserQueryService(
      new UserIdentityRepository(prisma as never),
    );
    const service = new UserService(
      prisma as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      events as never,
      users,
      analysisConfigs(prisma, users),
      {
        observe: async (
          _userId: unknown,
          _tx: unknown,
          write: () => Promise<unknown>,
        ) => write(),
      } as never,
    );
    const effectiveAt = new Date('2026-01-01T12:34:56.789Z');

    await service.applyTimelineProjectionBatch(
      {
        userId: 'user-1',
        projectionRunId: 'run-1',
        replacementReason: 'TEST_REPLAY',
        replaceFrom: new Date('2026-01-01T00:00:00.000Z'),
        replaceTo: new Date('2026-01-02T00:00:00.000Z'),
        scopes: [{ type: UserFitnessMetricType.FTP, sport: SportType.CYCLING }],
        projections: [
          {
            type: UserFitnessMetricType.FTP,
            sport: SportType.CYCLING,
            value: 275,
            value2: null,
            effectiveAt,
            projectionVersion: 1,
            projectionFingerprint: 'fingerprint-1',
            originPayload: { sourceActivityIds: [42] },
          },
        ],
      },
      tx as never,
    );

    expect(calls).toEqual(['archive', 'delete', 'create']);
    expect(tx.userFitnessMetricProjectionAudit.upsert).toHaveBeenCalledWith({
      where: {
        originalMetricId_replacementRunId: {
          originalMetricId: 'old-auto',
          replacementRunId: 'run-1',
        },
      },
      update: {},
      create: expect.objectContaining({
        originalMetricId: 'old-auto',
        originalCreatedAt: old.createdAt,
        changeSource: old.changeSource,
        originProvider: old.originProvider,
        originExternalId: old.originExternalId,
        originChecksum: old.originChecksum,
        originSyncedAt: old.originSyncedAt,
      }),
    });
    expect(tx.userFitnessMetric.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: MetricSource.AUTO,
        recordedAt: effectiveAt,
        projectionRunId: 'run-1',
        projectionFingerprint: 'fingerprint-1',
      }),
    });
    expect(events.emitAsync).not.toHaveBeenCalled();
  });

  it('archives and removes stale ESTIMATED projections so they cannot be promoted later', async () => {
    const stale = {
      id: 'stale-estimate',
      userId: 'user-1',
      type: UserFitnessMetricType.FTP,
      sport: SportType.CYCLING,
      value: 250,
      value2: null,
      source: MetricSource.ESTIMATED,
      recordedAt: new Date('2026-01-01T12:00:00.000Z'),
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
      changeSource: ChangeSource.SYSTEM_CALCULATED,
      originProvider: null,
      originExternalId: null,
      originChecksum: null,
      originPayload: null,
      originSyncedAt: null,
      projectionVersion: 1,
      projectionRunId: 'old-run',
      projectionFingerprint: 'old-fingerprint',
    };
    const tx = {
      $queryRaw: jest.fn(async () => []),
      userFitnessMetric: {
        findMany: jest.fn(async () => [stale]),
        deleteMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(),
      },
      userFitnessMetricProjectionAudit: {
        upsert: jest.fn(async () => ({})),
      },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const users = new UserQueryService(
      new UserIdentityRepository(prisma as never),
    );
    const service = new UserService(
      prisma as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      { emitAsync: jest.fn(async () => []) } as never,
      users,
      analysisConfigs(prisma, users),
      {
        observe: async (
          _userId: unknown,
          _tx: unknown,
          write: () => Promise<unknown>,
        ) => write(),
      } as never,
    );

    const result = await service.saveTimelineEstimatesBatch(
      {
        userId: 'user-1',
        projectionRunId: 'new-run',
        replacementReason: 'AUTO_UPDATE_DISABLED',
        replaceFrom: new Date('2026-01-01T00:00:00.000Z'),
        replaceTo: new Date('2026-01-02T00:00:00.000Z'),
        scopes: [{ type: UserFitnessMetricType.FTP, sport: SportType.CYCLING }],
        projections: [],
      },
      tx as never,
    );

    expect(result).toEqual({
      archived: 1,
      deleted: 1,
      written: 0,
      unchanged: 0,
    });
    expect(tx.userFitnessMetricProjectionAudit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          originalMetricId: 'stale-estimate',
          source: MetricSource.ESTIMATED,
          replacementRunId: 'new-run',
        }),
      }),
    );
    expect(tx.userFitnessMetric.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['stale-estimate'] } },
    });
    expect(tx.userFitnessMetric.create).not.toHaveBeenCalled();
  });

  it('does not borrow future body metrics when resolving a historical activity', async () => {
    const bodyFindMany = jest.fn(async () => []);
    const prisma = {
      userProfile: { findUnique: jest.fn(async () => null) },
      userAnalysisConfigVersion: { findFirst: jest.fn(async () => null) },
      userBodyMetric: { findMany: bodyFindMany },
      userFitnessMetric: { findMany: jest.fn(async () => []) },
    };
    const users = new UserQueryService(
      new UserIdentityRepository(prisma as never),
    );
    const service = new UserService(
      prisma as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      { emitAsync: jest.fn(async () => []) } as never,
      users,
      analysisConfigs(prisma, users),
      {
        observe: async (
          _userId: unknown,
          _tx: unknown,
          write: () => Promise<unknown>,
        ) => write(),
      } as never,
    );
    const asOf = new Date('2020-01-01T00:00:00.000Z');

    const profile = await service.getComposedUserProfile(
      'user-1',
      SportType.RUN,
      asOf,
    );

    expect(profile?.weight).toBeUndefined();
    expect(bodyFindMany).toHaveBeenCalledTimes(1);
    expect(bodyFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: { in: expect.any(Array) },
        effectiveDate: { lte: asOf },
      },
      orderBy: { effectiveDate: 'desc' },
    });
  });

  const effectiveAt = new Date('2026-01-01T12:34:56.789Z');
  const replaceFrom = new Date('2026-01-01T00:00:00.000Z');
  const replaceTo = new Date('2026-01-02T00:00:00.000Z');

  function point(
    type: UserFitnessMetricType,
    sport: SportType,
    value: number,
    extra: { value2?: number | null; effectiveAt?: Date } = {},
  ) {
    return {
      type,
      sport,
      value,
      value2: extra.value2 ?? null,
      effectiveAt: extra.effectiveAt ?? effectiveAt,
      projectionVersion: 1,
      projectionFingerprint: `${type}-${value}`,
      originPayload: { sourceActivityIds: [42] },
    };
  }

  function projectionService(options: {
    existing?: object[];
    context?: object[];
  }) {
    const created: Array<{
      type: UserFitnessMetricType;
      value: number;
      value2: number | null;
      source: MetricSource;
    }> = [];
    const tx = {
      $queryRaw: jest.fn(async () => []),
      userFitnessMetric: {
        findMany: jest.fn(
          async (args: { where?: { source?: MetricSource } }) => {
            const source = args?.where?.source;
            if (
              source === MetricSource.AUTO ||
              source === MetricSource.ESTIMATED
            ) {
              return options.existing ?? [];
            }
            return options.context ?? [];
          },
        ),
        deleteMany: jest.fn(async () => ({
          count: options.existing?.length ?? 0,
        })),
        create: jest.fn(
          async ({ data }: { data: (typeof created)[number] }) => {
            created.push(data);
            return data;
          },
        ),
      },
      userFitnessMetricProjectionAudit: {
        upsert: jest.fn(async () => ({})),
      },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const users = new UserQueryService(
      new UserIdentityRepository(prisma as never),
    );
    const service = new UserService(
      prisma as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
      { emitAsync: jest.fn(async () => []) } as never,
      users,
      analysisConfigs(prisma, users),
      {
        observe: async (
          _userId: unknown,
          _tx: unknown,
          write: () => Promise<unknown>,
        ) => write(),
      } as never,
    );
    return { service, tx, created };
  }

  it('does not persist out-of-range AUTO projections, including CP W′ stored in value2', async () => {
    const stale = {
      id: 'oor-w-prime',
      userId: 'user-1',
      type: UserFitnessMetricType.W_PRIME,
      sport: SportType.RUN,
      value: 124430,
      value2: null,
      source: MetricSource.AUTO,
      recordedAt: effectiveAt,
      createdAt: effectiveAt,
      changeSource: ChangeSource.SYSTEM_CALCULATED,
      originProvider: null,
      originExternalId: null,
      originChecksum: null,
      originPayload: null,
      originSyncedAt: null,
      projectionVersion: 1,
      projectionRunId: 'old-run',
      projectionFingerprint: 'W_PRIME-124430',
    };
    const { service, tx, created } = projectionService({ existing: [stale] });

    await service.applyTimelineProjectionBatch(
      {
        userId: 'user-1',
        projectionRunId: 'run-oor',
        replacementReason: 'DATA_REPAIR_REPLAY',
        replaceFrom,
        replaceTo,
        scopes: [
          { type: UserFitnessMetricType.W_PRIME, sport: SportType.RUN },
          { type: UserFitnessMetricType.CP, sport: SportType.RUN },
          { type: UserFitnessMetricType.FTP, sport: SportType.RUN },
          { type: UserFitnessMetricType.P_MAX, sport: SportType.RUN },
        ],
        projections: [
          point(UserFitnessMetricType.W_PRIME, SportType.RUN, 124430),
          point(UserFitnessMetricType.CP, SportType.RUN, 280, {
            value2: 124430,
          }),
          point(UserFitnessMetricType.FTP, SportType.RUN, 266),
          point(UserFitnessMetricType.P_MAX, SportType.RUN, 4200),
        ],
      },
      tx as never,
    );

    expect(created.map((row) => [row.type, row.value, row.source])).toEqual([
      [UserFitnessMetricType.FTP, 266, MetricSource.AUTO],
    ]);
    expect(tx.userFitnessMetric.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['oor-w-prime'] } },
    });
  });

  it('still writes an in-range AUTO pair and rejects a relatively inconsistent FTP', async () => {
    const { service, tx, created } = projectionService({
      context: [
        {
          type: UserFitnessMetricType.CP,
          sport: SportType.CYCLING,
          source: MetricSource.MANUAL,
          value: 250,
          recordedAt: new Date('2025-12-01T00:00:00.000Z'),
        },
      ],
    });
    const later = new Date('2026-01-01T18:00:00.000Z');

    await service.applyTimelineProjectionBatch(
      {
        userId: 'user-1',
        projectionRunId: 'run-relative',
        replacementReason: 'DATA_REPAIR_REPLAY',
        replaceFrom,
        replaceTo,
        scopes: [
          { type: UserFitnessMetricType.CP, sport: SportType.CYCLING },
          { type: UserFitnessMetricType.FTP, sport: SportType.CYCLING },
          { type: UserFitnessMetricType.W_PRIME, sport: SportType.CYCLING },
        ],
        projections: [
          point(UserFitnessMetricType.CP, SportType.CYCLING, 250, {
            value2: 20000,
          }),
          point(UserFitnessMetricType.FTP, SportType.CYCLING, 80),
          point(UserFitnessMetricType.CP, SportType.CYCLING, 250, {
            value2: 20000,
            effectiveAt: later,
          }),
          point(UserFitnessMetricType.FTP, SportType.CYCLING, 237, {
            effectiveAt: later,
          }),
          point(UserFitnessMetricType.W_PRIME, SportType.CYCLING, 20000, {
            effectiveAt: later,
          }),
        ],
      },
      tx as never,
    );

    expect(created.map((row) => [row.type, row.value, row.value2])).toEqual([
      [UserFitnessMetricType.CP, 250, 20000],
      [UserFitnessMetricType.FTP, 237, null],
      [UserFitnessMetricType.W_PRIME, 20000, null],
    ]);
    expect(tx.userFitnessMetric.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: UserFitnessMetricType.CP,
        value: 250,
        value2: 20000,
        recordedAt: later,
        source: MetricSource.AUTO,
      }),
    });
    expect(
      created.some(
        (row) => row.type === UserFitnessMetricType.FTP && row.value === 80,
      ),
    ).toBe(false);
  });

  it('does not let an AUTO row inside the replacement window veto a new in-range projection', async () => {
    const { service, tx, created } = projectionService({
      context: [
        {
          type: UserFitnessMetricType.CP,
          sport: SportType.CYCLING,
          source: MetricSource.AUTO,
          value: 400,
          recordedAt: effectiveAt,
        },
      ],
    });

    await service.applyTimelineProjectionBatch(
      {
        userId: 'user-1',
        projectionRunId: 'run-window',
        replacementReason: 'DATA_REPAIR_REPLAY',
        replaceFrom,
        replaceTo,
        scopes: [{ type: UserFitnessMetricType.FTP, sport: SportType.CYCLING }],
        projections: [point(UserFitnessMetricType.FTP, SportType.CYCLING, 240)],
      },
      tx as never,
    );

    expect(created.map((row) => row.value)).toEqual([240]);
  });

  it('rejects slow automatic running CS and keeps the same estimate when it is not AUTO', async () => {
    const auto = projectionService({});
    await auto.service.applyTimelineProjectionBatch(
      {
        userId: 'user-1',
        projectionRunId: 'run-cs',
        replacementReason: 'DATA_REPAIR_REPLAY',
        replaceFrom,
        replaceTo,
        scopes: [{ type: UserFitnessMetricType.CS, sport: SportType.RUN }],
        projections: [
          point(UserFitnessMetricType.CS, SportType.RUN, 1.5),
          point(UserFitnessMetricType.CS, SportType.RUN, 2, {
            effectiveAt: new Date('2026-01-01T18:00:00.000Z'),
          }),
        ],
      },
      auto.tx as never,
    );
    expect(auto.created.map((row) => row.value)).toEqual([2]);

    const estimated = projectionService({});
    await estimated.service.saveTimelineEstimatesBatch(
      {
        userId: 'user-1',
        projectionRunId: 'run-cs-estimate',
        replacementReason: 'AUTO_UPDATE_DISABLED',
        replaceFrom,
        replaceTo,
        scopes: [
          { type: UserFitnessMetricType.CS, sport: SportType.RUN },
          { type: UserFitnessMetricType.W_PRIME, sport: SportType.RUN },
          { type: UserFitnessMetricType.FTP, sport: SportType.RUN },
        ],
        projections: [
          point(UserFitnessMetricType.CS, SportType.RUN, 1.5),
          point(UserFitnessMetricType.W_PRIME, SportType.RUN, 124430),
          point(UserFitnessMetricType.FTP, SportType.RUN, 266, {
            effectiveAt: new Date('2026-01-01T18:00:00.000Z'),
          }),
        ],
      },
      estimated.tx as never,
    );

    expect(
      estimated.created.map((row) => [row.type, row.value, row.source]),
    ).toEqual([
      [UserFitnessMetricType.CS, 1.5, MetricSource.ESTIMATED],
      [UserFitnessMetricType.FTP, 266, MetricSource.ESTIMATED],
    ]);
  });

  it('keeps LTHR reference rules on the AUTO timeline', async () => {
    const { service, tx, created } = projectionService({});
    const later = new Date('2026-01-01T18:00:00.000Z');

    await service.applyTimelineProjectionBatch(
      {
        userId: 'user-1',
        projectionRunId: 'run-lthr',
        replacementReason: 'DATA_REPAIR_REPLAY',
        replaceFrom,
        replaceTo,
        scopes: [
          { type: UserFitnessMetricType.LTHR, sport: SportType.RUN },
          { type: UserFitnessMetricType.MAX_HR, sport: SportType.UNKNOWN },
        ],
        projections: [
          point(UserFitnessMetricType.LTHR, SportType.RUN, 170),
          point(UserFitnessMetricType.MAX_HR, SportType.UNKNOWN, 190, {
            effectiveAt: later,
          }),
          point(UserFitnessMetricType.LTHR, SportType.RUN, 170, {
            effectiveAt: later,
          }),
          point(UserFitnessMetricType.LTHR, SportType.RUN, 114, {
            effectiveAt: new Date('2026-01-01T20:00:00.000Z'),
          }),
        ],
      },
      tx as never,
    );

    expect(created.map((row) => [row.type, row.value])).toEqual([
      [UserFitnessMetricType.MAX_HR, 190],
      [UserFitnessMetricType.LTHR, 170],
    ]);
  });
});
