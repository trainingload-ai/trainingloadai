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
});
