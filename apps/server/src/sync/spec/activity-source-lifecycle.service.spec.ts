import { describe, expect, it, jest } from '@jest/globals';
import {
  ActivitySourceLifecycleService,
  selectFallbackActivitySource,
} from '../activity-source-lifecycle.service';
import { ImportingJobService } from '../../importing/importing-job.service';
import { ImportingJobRepository } from '../../importing/persistence/importing-job.repository';

function createService(prisma: unknown) {
  return new ActivitySourceLifecycleService(
    prisma as never,
    new ImportingJobService(new ImportingJobRepository(prisma as never)),
  );
}

const payload = {
  source: { kind: 'FILE', sourceUid: 'manual-1' },
  identity: { dedupeKey: 'dedupe-1', datasetChecksum: 'checksum-1' },
  summary: { sportType: 'RUN', startTime: '2026-08-01T00:00:00.000Z' },
  laps: [],
  records: [],
  lengths: [],
};

describe('ActivitySourceLifecycleService', () => {
  it('selects the highest-quality source with a replayable snapshot', () => {
    const base = {
      activityId: 1,
      sourceKind: 'FILE',
      sourceUid: 'source',
      provider: null,
      externalId: null,
      sourceObjectId: 'object-1',
      isPrimary: false,
      canonicalSnapshot: { payload },
    };
    const selected = selectFallbackActivitySource([
      {
        ...base,
        id: 'low',
        createdAt: new Date('2026-01-01'),
        metadata: { datasetQuality: { score: 40 } },
      },
      {
        ...base,
        id: 'high',
        createdAt: new Date('2026-01-02'),
        metadata: { datasetQuality: { score: 80 } },
      },
      {
        ...base,
        id: 'no-snapshot',
        createdAt: new Date('2025-01-01'),
        metadata: { datasetQuality: { score: 100 } },
        canonicalSnapshot: null,
      },
    ] as never);

    expect(selected?.id).toBe('high');
  });

  it('backfills fallback ranking from canonical payload when quality metadata is absent', () => {
    const base = {
      activityId: 1,
      sourceKind: 'FILE',
      sourceUid: 'source',
      provider: null,
      externalId: null,
      sourceObjectId: 'object-1',
      isPrimary: false,
      createdAt: new Date('2026-01-01'),
      metadata: null,
    };
    const selected = selectFallbackActivitySource([
      {
        ...base,
        id: 'summary-only',
        canonicalSnapshot: { payload },
      },
      {
        ...base,
        id: 'records',
        createdAt: new Date('2026-01-02'),
        canonicalSnapshot: {
          payload: {
            ...payload,
            summary: { ...payload.summary, elapsedTime: 60 },
            records: Array.from({ length: 60 }, () => ({ heartRate: 150 })),
          },
        },
      },
    ] as never);

    expect(selected?.id).toBe('records');
  });

  it('finds provider sources even without mappings and queues the new primary snapshot', async () => {
    const removed = {
      id: 'provider-source',
      activityId: 42,
      isPrimary: true,
    };
    const fallback = {
      id: 'manual-source',
      activityId: 42,
      sourceKind: 'FILE',
      sourceUid: 'manual-1',
      provider: null,
      externalId: null,
      sourceObjectId: 'source-object-1',
      isPrimary: false,
      createdAt: new Date('2026-01-01'),
      metadata: { datasetQuality: { score: 50 } },
      canonicalSnapshot: { payload },
    };
    const tx = {
      activityThirdPartyMapping: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async () => null),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      thirdPartyActivity: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        findFirst: jest.fn(async () => null),
      },
      activitySource: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValueOnce([removed])
          .mockResolvedValueOnce([fallback]),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async () => fallback),
      },
      importBatchJob: {
        create: jest.fn(async () => ({ id: 'rebuild-batch' })),
      },
      importItemJob: {
        createMany: jest.fn(async () => ({ count: 1 })),
      },
      importSourceObject: { upsert: jest.fn() },
      activity: {
        findMany: jest.fn(async () => [
          {
            id: 42,
            sportType: 'RUN',
            startTime: new Date('2026-08-01T00:00:00.000Z'),
          },
        ]),
        update: jest.fn(async () => ({ id: 42 })),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      userPostProcessJob: { create: jest.fn() },
    };
    const prisma = {
      thirdPartyActivity: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = createService(prisma);

    await expect(
      service.deactivateProviderData({
        userId: 'user-1',
        provider: 'intervals_icu' as never,
      }),
    ).resolves.toMatchObject({ requeuedActivities: 1, activities: 0 });

    expect(tx.activitySource.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          userId: 'user-1',
          provider: 'intervals_icu',
          isActive: true,
        },
      }),
    );

    expect(tx.activitySource.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['manual-source'] } },
      data: { isPrimary: true },
    });
    expect(tx.activitySource.update).not.toHaveBeenCalled();
    expect(tx.importItemJob.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          sourceUid: 'manual-1',
          position: 0,
          sourceRef: { kind: 'canonical_payload', payload },
          analysisRequired: true,
        }),
      ],
    });
  });

  it('reselects multiple primary sources with one pair of bulk writes', async () => {
    const removedSources = [41, 42].map((activityId) => ({
      id: `provider-${activityId}`,
      activityId,
      isPrimary: true,
    }));
    const fallbackSources = [41, 42].map((activityId) => ({
      id: `manual-${activityId}`,
      activityId,
      sourceKind: 'FILE',
      sourceUid: `manual-${activityId}`,
      provider: null,
      externalId: null,
      sourceObjectId: `source-object-${activityId}`,
      isPrimary: false,
      createdAt: new Date('2026-01-01'),
      metadata: { datasetQuality: { score: 50 } },
      canonicalSnapshot: { payload },
    }));
    const tx = {
      activityThirdPartyMapping: {
        findMany: jest.fn(async () => []),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      thirdPartyActivity: {
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      activitySource: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValueOnce(removedSources)
          .mockResolvedValueOnce(fallbackSources),
        updateMany: jest.fn(async () => ({ count: 2 })),
        update: jest.fn(),
      },
      activity: {
        findMany: jest.fn(async () =>
          [41, 42].map((id) => ({
            id,
            sportType: 'RUN',
            startTime: new Date('2026-08-01T00:00:00.000Z'),
            state: 1,
          })),
        ),
        updateMany: jest.fn(async () => ({ count: 2 })),
      },
      importSourceObject: { upsert: jest.fn() },
      importBatchJob: {
        create: jest.fn(async () => ({ id: 'rebuild-batch' })),
      },
      importItemJob: {
        createMany: jest.fn(async () => ({ count: 2 })),
      },
      userPostProcessJob: { create: jest.fn() },
    };
    const service = createService({
      thirdPartyActivity: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as never);

    await expect(
      service.deactivateProviderData({
        userId: 'user-1',
        provider: 'intervals_icu' as never,
      }),
    ).resolves.toMatchObject({ requeuedActivities: 2 });

    expect(tx.activitySource.updateMany).toHaveBeenCalledWith({
      where: { activityId: { in: [41, 42] }, isPrimary: true },
      data: { isPrimary: false },
    });
    expect(tx.activitySource.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['manual-41', 'manual-42'] } },
      data: { isPrimary: true },
    });
    expect(tx.activitySource.update).not.toHaveBeenCalled();
    expect(tx.activity.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [41, 42] } },
      data: {
        processingStatus: 'MATERIALIZED',
        processingUpdatedAt: expect.any(Date),
        readyAt: null,
      },
    });
  });

  it('queues one maintenance post-process for a recent hidden activity', async () => {
    const tx = {
      activityThirdPartyMapping: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValueOnce([{ activityId: 42 }])
          .mockResolvedValueOnce([]),
        findFirst: jest.fn(async () => null),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      thirdPartyActivity: {
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      activitySource: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValueOnce([
            { id: 'provider-source', activityId: 42, isPrimary: true },
          ])
          .mockResolvedValueOnce([]),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      activity: {
        findMany: jest.fn(async () => [
          {
            id: 42,
            sportType: 'RUN',
            startTime: new Date(),
            state: 1,
          },
        ]),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      importBatchJob: {
        create: jest.fn(async () => ({ id: 'maintenance-batch' })),
      },
      importItemJob: { create: jest.fn() },
      userPostProcessJob: {
        create: jest.fn(async () => ({ id: 'maintenance-post' })),
      },
    };
    const service = createService({
      thirdPartyActivity: {
        findMany: jest.fn(async () => [{ id: 7, externalId: 'activity-7' }]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as never);

    await expect(
      service.deactivateProviderData({
        userId: 'user-1',
        provider: 'intervals_icu' as never,
      }),
    ).resolves.toMatchObject({ activities: 1, requeuedActivities: 0 });

    expect(tx.importBatchJob.create).toHaveBeenCalledTimes(1);
    expect(tx.importItemJob.create).not.toHaveBeenCalled();
    expect(tx.userPostProcessJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        batchJobId: 'maintenance-batch',
        affectedSportTypes: ['RUN'],
        recomputeFrom: expect.any(Date),
      }),
    });
  });

  it('does not refresh global metrics for a hidden activity older than 60 days', async () => {
    const tx = {
      activityThirdPartyMapping: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValueOnce([{ activityId: 42 }])
          .mockResolvedValueOnce([]),
        findFirst: jest.fn(async () => null),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      thirdPartyActivity: {
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      activitySource: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValueOnce([
            { id: 'provider-source', activityId: 42, isPrimary: true },
          ])
          .mockResolvedValueOnce([]),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      activity: {
        findMany: jest.fn(async () => [
          {
            id: 42,
            sportType: 'RUN',
            startTime: new Date('2020-01-01T00:00:00.000Z'),
            state: 1,
          },
        ]),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      importBatchJob: { create: jest.fn() },
      importItemJob: { create: jest.fn() },
      userPostProcessJob: { create: jest.fn() },
    };
    const service = createService({
      thirdPartyActivity: {
        findMany: jest.fn(async () => [{ id: 7, externalId: 'activity-7' }]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as never);

    await service.deactivateProviderData({
      userId: 'user-1',
      provider: 'intervals_icu' as never,
    });

    expect(tx.importBatchJob.create).not.toHaveBeenCalled();
    expect(tx.userPostProcessJob.create).not.toHaveBeenCalled();
  });

  it('does not widen a missing targeted identity into provider-wide source removal', async () => {
    const tx = {
      activityThirdPartyMapping: {
        findMany: jest.fn(async () => []),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      thirdPartyActivity: {
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      activitySource: {
        findMany: jest.fn(async () => []),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      activity: { findMany: jest.fn(async () => []) },
      importBatchJob: { create: jest.fn() },
      userPostProcessJob: { create: jest.fn() },
    };
    const service = createService({
      thirdPartyActivity: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as never);

    await service.deactivateProviderData({
      userId: 'user-1',
      provider: 'intervals_icu' as never,
      thirdPartyActivityIds: [999],
    });

    expect(tx.activitySource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: 'intervals_icu',
          OR: [{ id: { in: [] } }],
        }),
      }),
    );
  });

  it('keeps a legacy activity visible when a remaining source has no snapshot', async () => {
    const legacySource = {
      id: 'legacy-manual-source',
      activityId: 42,
      sourceKind: 'FILE',
      sourceUid: 'legacy-file',
      provider: null,
      externalId: null,
      sourceObjectId: null,
      isPrimary: false,
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      metadata: null,
      canonicalSnapshot: null,
    };
    const tx = {
      activityThirdPartyMapping: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValueOnce([{ activityId: 42 }])
          .mockResolvedValueOnce([]),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      thirdPartyActivity: {
        updateMany: jest.fn(async () => ({ count: 1 })),
        findFirst: jest.fn(async () => null),
      },
      activitySource: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValueOnce([
            { id: 'provider-source', activityId: 42, isPrimary: true },
          ])
          .mockResolvedValueOnce([legacySource]),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async () => legacySource),
      },
      activity: {
        findMany: jest.fn(async () => [
          {
            id: 42,
            sportType: 'RUN',
            startTime: new Date('2020-01-01T00:00:00.000Z'),
          },
        ]),
        update: jest.fn(),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      importBatchJob: { create: jest.fn() },
      importItemJob: { create: jest.fn() },
      userPostProcessJob: { create: jest.fn() },
    };
    const service = createService({
      thirdPartyActivity: {
        findMany: jest.fn(async () => [{ id: 7, externalId: 'activity-7' }]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as never);

    await expect(
      service.deactivateProviderData({
        userId: 'user-1',
        provider: 'intervals_icu' as never,
      }),
    ).resolves.toMatchObject({ activities: 0, requeuedActivities: 0 });

    expect(tx.activitySource.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [legacySource.id] } },
      data: { isPrimary: true },
    });
    expect(tx.activitySource.update).not.toHaveBeenCalled();
    expect(tx.activity.update).not.toHaveBeenCalled();
    expect(tx.activity.updateMany).not.toHaveBeenCalled();
    expect(tx.importBatchJob.create).not.toHaveBeenCalled();
  });

  it('does not reactivate a user-hidden activity while reselecting a provider fallback', async () => {
    const fallback = {
      id: 'manual-source',
      activityId: 42,
      sourceKind: 'FILE',
      sourceUid: 'manual-1',
      provider: null,
      externalId: null,
      sourceObjectId: 'source-object-1',
      isPrimary: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      metadata: { datasetQuality: { score: 50 } },
      canonicalSnapshot: { payload },
    };
    const tx = {
      activityThirdPartyMapping: {
        findMany: jest.fn(async () => []),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      thirdPartyActivity: { updateMany: jest.fn(async () => ({ count: 0 })) },
      activitySource: {
        findMany: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValueOnce([
            { id: 'provider-source', activityId: 42, isPrimary: true },
          ])
          .mockResolvedValueOnce([fallback]),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async () => fallback),
      },
      activity: {
        findMany: jest.fn(async () => [
          {
            id: 42,
            sportType: 'RUN',
            startTime: new Date('2026-08-01T00:00:00.000Z'),
            state: 0,
          },
        ]),
        update: jest.fn(),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      importBatchJob: { create: jest.fn() },
      importItemJob: { create: jest.fn() },
      userPostProcessJob: { create: jest.fn() },
    };
    const service = createService({
      thirdPartyActivity: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as never);

    await service.deactivateProviderData({
      userId: 'user-1',
      provider: 'intervals_icu' as never,
    });

    expect(tx.activitySource.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [fallback.id] } },
      data: { isPrimary: true },
    });
    expect(tx.activitySource.update).not.toHaveBeenCalled();
    expect(tx.activity.update).not.toHaveBeenCalled();
    expect(tx.importBatchJob.create).not.toHaveBeenCalled();
  });
});
