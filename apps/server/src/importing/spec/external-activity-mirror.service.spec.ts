import { describe, expect, it, jest } from '@jest/globals';
import { evaluateExternalActivityMirrorMatch } from '../external-activity-mirror-match';
import { ExternalActivityMirrorService } from '../external-activity-mirror.service';

describe('external activity mirror match', () => {
  const activity = {
    startTime: new Date('2026-10-09T23:30:00.000Z'),
    timezone: 'Asia/Shanghai',
    sportType: 'RUN',
    elapsedTime: 3600,
    distance: 10_000,
  };

  it('treats an exact local start as provider-independent identity evidence', () => {
    expect(
      evaluateExternalActivityMirrorMatch({
        mirror: { start_date_local: '2026-10-10T07:30:00' },
        importedRaw: {},
        activity,
        providerAligned: false,
        sameSourceObject: false,
      }),
    ).toMatchObject({
      confidence: 1,
      evidence: {
        exactStartMatch: true,
        providerAligned: false,
        matcherVersion: 'external-mirror-exact-start-v1',
      },
    });
  });

  it('does not widen time-only matching beyond the exact-start tolerance', () => {
    expect(
      evaluateExternalActivityMirrorMatch({
        mirror: { start_date_local: '2026-10-10T07:30:06' },
        importedRaw: {},
        activity,
        providerAligned: false,
        sameSourceObject: false,
      }),
    ).toBeNull();
  });
});

describe('ExternalActivityMirrorService', () => {
  it('stops before loading activity context when the user has no unresolved mirrors', async () => {
    const prisma = {
      importSourceObject: {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(),
      },
      activity: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const service = new ExternalActivityMirrorService(prisma as never, {
      sourceObjects: (client?: { importSourceObject: typeof prisma.importSourceObject }) =>
        client?.importSourceObject ?? prisma.importSourceObject,
    } as never);

    await expect(
      service.resolveForImportedActivity({
        userId: 'user-1',
        activityId: 42,
        provider: 'upload',
        sourceObjectId: 'upload-source-1',
      }),
    ).resolves.toEqual({ kind: 'NO_MIRRORS' });

    expect(prisma.importSourceObject.findUnique).not.toHaveBeenCalled();
    expect(prisma.activity.findFirst).not.toHaveBeenCalled();
    expect(prisma.activity.findMany).not.toHaveBeenCalled();
  });

  it('unwraps nested provider payloads and resolves the matching mirror', async () => {
    const tx = {
      activitySource: { upsert: jest.fn(async () => ({})) },
      importSourceObject: { update: jest.fn(async () => ({})) },
    };
    const prisma = {
      importSourceObject: {
        findUnique: jest.fn(async () => ({
          sourceKind: 'UNKNOWN',
          provider: 'unknown',
          rawPayload: {
            original: {
              listActivity: {
                start_date_local: '2026-10-10T07:30:00',
              },
            },
          },
        })),
        findMany: jest.fn(async () => [
          {
            id: 'mirror-1',
            sourceKind: 'INTERVALS_ICU',
            provider: 'intervals_icu',
            sourceUid: 'intervals:user-1:i123',
            accountRef: '0',
            externalId: 'i123',
            originProvider: 'unknown',
            rawPayload: {
              listActivity: {
                start_date_local: '2026-10-10T07:30:00',
              },
            },
          },
        ]),
      },
      activity: {
        findFirst: jest.fn(async () => ({
          id: 42,
          startTime: new Date('2026-10-09T23:30:00.000Z'),
          timezone: 'Asia/Shanghai',
          sportType: 'RUNNING',
          elapsedTime: 3600,
          distance: 10_000,
        })),
        findMany: jest.fn(async () => [
          {
            id: 42,
            startTime: new Date('2026-10-09T23:30:00.000Z'),
            timezone: 'Asia/Shanghai',
            sportType: 'RUNNING',
            elapsedTime: 3600,
            distance: 10_000,
            activitySources: [
              {
                sourceObjectId: 'unknown-source-1',
                sourceKind: 'UNKNOWN',
                provider: 'unknown',
              },
            ],
          },
        ]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new ExternalActivityMirrorService(prisma as never, {
      sourceObjects: (client?: { importSourceObject: typeof prisma.importSourceObject }) =>
        client?.importSourceObject ?? prisma.importSourceObject,
    } as never);

    await expect(
      service.resolveForImportedActivity({
        userId: 'user-1',
        activityId: 42,
        provider: 'unknown',
        sourceObjectId: 'unknown-source-1',
      }),
    ).resolves.toEqual({
      kind: 'RESOLVED',
      mirrorId: 'mirror-1',
      activityId: 42,
    });

    expect(tx.activitySource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          activityId: 42,
          sourceObjectId: 'mirror-1',
          isPrimary: false,
        }),
      }),
    );
    expect(tx.importSourceObject.update).toHaveBeenCalledWith({
      where: { id: 'mirror-1' },
      data: expect.objectContaining({
        resolvedActivityId: 42,
        resolutionStatus: 'RESOLVED',
      }),
    });
  });

  it('falls back to shared fuzzy evidence outside the exact-start tolerance', async () => {
    const tx = {
      activitySource: { upsert: jest.fn(async () => ({})) },
      importSourceObject: { update: jest.fn(async () => ({})) },
    };
    const prisma = {
      importSourceObject: {
        findUnique: jest.fn(async () => ({
          sourceKind: 'FILE',
          provider: 'upload',
          rawPayload: { original: {} },
        })),
        findMany: jest.fn(async () => [
          {
            id: 'mirror-1',
            sourceKind: 'INTERVALS_ICU',
            provider: 'intervals_icu',
            sourceUid: 'intervals:user-1:i123',
            accountRef: '0',
            externalId: 'i123',
            originProvider: 'unknown',
            rawPayload: {
              listActivity: {
                start_date_local: '2026-10-10T07:30:00',
                sport_type: 'Run',
                moving_time: 3600,
                distance: 10_000,
              },
            },
          },
        ]),
      },
      activity: {
        findFirst: jest.fn(async () => ({
          id: 42,
          startTime: new Date('2026-10-09T23:30:20.000Z'),
          timezone: 'Asia/Shanghai',
          sportType: 'RUNNING',
          elapsedTime: 3595,
          distance: 10_020,
        })),
        findMany: jest.fn(async () => [
          {
            id: 42,
            startTime: new Date('2026-10-09T23:30:20.000Z'),
            timezone: 'Asia/Shanghai',
            sportType: 'RUNNING',
            elapsedTime: 3595,
            distance: 10_020,
            activitySources: [
              {
                sourceObjectId: 'upload-source-1',
                sourceKind: 'FILE',
                provider: 'upload',
              },
            ],
          },
        ]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new ExternalActivityMirrorService(prisma as never, {
      sourceObjects: (client?: { importSourceObject: typeof prisma.importSourceObject }) =>
        client?.importSourceObject ?? prisma.importSourceObject,
    } as never);

    await expect(
      service.resolveForImportedActivity({
        userId: 'user-1',
        activityId: 42,
        provider: 'upload',
        sourceObjectId: 'upload-source-1',
      }),
    ).resolves.toEqual({
      kind: 'RESOLVED',
      mirrorId: 'mirror-1',
      activityId: 42,
    });

    expect(tx.activitySource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          activityId: 42,
          metadata: expect.objectContaining({
            resolution: 'external_activity_match',
            originProvider: 'unknown',
            materializedProvider: 'upload',
            confidence: 0.85,
          }),
        }),
      }),
    );
  });

  it('resolves a unique exact local-start mirror regardless of provider', async () => {
    const tx = {
      activitySource: { upsert: jest.fn(async () => ({})) },
      importSourceObject: { update: jest.fn(async () => ({})) },
    };
    const prisma = {
      importSourceObject: {
        findUnique: jest.fn(async () => ({
          sourceKind: 'FILE',
          provider: 'upload',
          rawPayload: { original: {} },
        })),
        findMany: jest.fn(async () => [
          {
            id: 'mirror-1',
            sourceKind: 'INTERVALS_ICU',
            provider: 'intervals_icu',
            sourceUid: 'intervals:user-1:i123',
            accountRef: '0',
            externalId: 'i123',
            originProvider: 'unknown',
            rawPayload: {
              listActivity: {
                start_date_local: '2026-10-10T07:30:00',
              },
            },
          },
        ]),
      },
      activity: {
        findFirst: jest.fn(async () => ({
          id: 42,
          startTime: new Date('2026-10-09T23:30:00.000Z'),
          timezone: 'Asia/Shanghai',
          sportType: 'RUNNING',
          elapsedTime: 3600,
          distance: 10_000,
        })),
        findMany: jest.fn(async () => [
          {
            id: 42,
            startTime: new Date('2026-10-09T23:30:00.000Z'),
            timezone: 'Asia/Shanghai',
            sportType: 'RUNNING',
            elapsedTime: 3600,
            distance: 10_000,
            activitySources: [
              {
                sourceObjectId: 'upload-source-1',
                sourceKind: 'FILE',
                provider: 'upload',
              },
            ],
          },
        ]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new ExternalActivityMirrorService(prisma as never, {
      sourceObjects: (client?: { importSourceObject: typeof prisma.importSourceObject }) =>
        client?.importSourceObject ?? prisma.importSourceObject,
    } as never);

    await expect(
      service.resolveForImportedActivity({
        userId: 'user-1',
        activityId: 42,
        provider: 'upload',
        sourceObjectId: 'upload-source-1',
      }),
    ).resolves.toEqual({
      kind: 'RESOLVED',
      mirrorId: 'mirror-1',
      activityId: 42,
    });

    expect(tx.activitySource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          activityId: 42,
          metadata: expect.objectContaining({
            originProvider: 'unknown',
            materializedProvider: 'upload',
            confidence: 1,
            evidence: expect.objectContaining({
              exactStartMatch: true,
              providerAligned: false,
              matcherVersion: 'external-mirror-exact-start-v1',
            }),
          }),
        }),
      }),
    );
  });

  it('keeps the mirror ambiguous when a second formal activity is equally credible', async () => {
    const prisma = {
      importSourceObject: {
        findUnique: jest.fn(async () => ({
          sourceKind: 'FILE',
          provider: 'upload',
          rawPayload: { original: {} },
        })),
        findMany: jest.fn(async () => [
          {
            id: 'mirror-1',
            sourceKind: 'INTERVALS_ICU',
            provider: 'intervals_icu',
            sourceUid: 'intervals:user-1:i123',
            accountRef: '0',
            externalId: 'i123',
            originProvider: 'unknown',
            rawPayload: {
              listActivity: {
                start_date_local: '2026-10-10T07:30:00',
                sport_type: 'Run',
                moving_time: 3600,
                distance: 10_000,
              },
            },
          },
        ]),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      activity: {
        findFirst: jest.fn(async () => ({
          id: 42,
          startTime: new Date('2026-10-09T23:30:00.000Z'),
          timezone: 'Asia/Shanghai',
          sportType: 'RUNNING',
          elapsedTime: 3600,
          distance: 10_000,
        })),
        findMany: jest.fn(async () =>
          [42, 43].map((id) => ({
            id,
            startTime: new Date('2026-10-09T23:30:00.000Z'),
            timezone: 'Asia/Shanghai',
            sportType: 'RUNNING',
            elapsedTime: 3600,
            distance: 10_000,
            activitySources: [
              {
                sourceObjectId: `${id === 42 ? 'upload' : 'intervals'}-source-1`,
                sourceKind: id === 42 ? 'FILE' : 'INTERVALS_ICU',
                provider: id === 42 ? 'upload' : 'intervals',
              },
            ],
          })),
        ),
      },
      $transaction: jest.fn(),
    };
    const service = new ExternalActivityMirrorService(prisma as never, {
      sourceObjects: (client?: { importSourceObject: typeof prisma.importSourceObject }) =>
        client?.importSourceObject ?? prisma.importSourceObject,
    } as never);

    await expect(
      service.resolveForImportedActivity({
        userId: 'user-1',
        activityId: 42,
        provider: 'upload',
        sourceObjectId: 'upload-source-1',
      }),
    ).resolves.toEqual({
      kind: 'AMBIGUOUS_ACTIVITY',
      mirrorIds: ['mirror-1'],
    });

    expect(prisma.importSourceObject.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['mirror-1'] } },
      data: {
        resolutionStatus: 'NOT_FOUND',
        resolutionReason: 'ORIGIN_ACTIVITY_AMBIGUOUS',
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not let two mirrors claim the same formal activity', async () => {
    const prisma = {
      importSourceObject: {
        findUnique: jest.fn(async () => ({
          sourceKind: 'FILE',
          provider: 'upload',
          rawPayload: { original: {} },
        })),
        findMany: jest.fn(async () =>
          ['mirror-1', 'mirror-2'].map((id) => ({
            id,
            sourceKind: 'INTERVALS_ICU',
            provider: 'intervals_icu',
            sourceUid: `intervals:user-1:${id}`,
            accountRef: '0',
            externalId: id,
            originProvider: 'unknown',
            rawPayload: {
              listActivity: {
                start_date_local: '2026-10-10T07:30:00',
              },
            },
          })),
        ),
        updateMany: jest.fn(async () => ({ count: 2 })),
      },
      activity: {
        findFirst: jest.fn(async () => ({
          id: 42,
          startTime: new Date('2026-10-09T23:30:00.000Z'),
          timezone: 'Asia/Shanghai',
          sportType: 'RUNNING',
          elapsedTime: 3600,
          distance: 10_000,
        })),
        findMany: jest.fn(async () => [
          {
            id: 42,
            startTime: new Date('2026-10-09T23:30:00.000Z'),
            timezone: 'Asia/Shanghai',
            sportType: 'RUNNING',
            elapsedTime: 3600,
            distance: 10_000,
            activitySources: [
              {
                sourceObjectId: 'upload-source-1',
                provider: 'upload',
              },
            ],
          },
        ]),
      },
      $transaction: jest.fn(),
    };
    const service = new ExternalActivityMirrorService(prisma as never, {
      sourceObjects: (client?: { importSourceObject: typeof prisma.importSourceObject }) =>
        client?.importSourceObject ?? prisma.importSourceObject,
    } as never);

    await expect(
      service.resolveForImportedActivity({
        userId: 'user-1',
        activityId: 42,
        provider: 'upload',
        sourceObjectId: 'upload-source-1',
      }),
    ).resolves.toEqual({
      kind: 'AMBIGUOUS_MIRRORS',
      mirrorIds: ['mirror-1', 'mirror-2'],
    });

    expect(prisma.importSourceObject.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['mirror-1', 'mirror-2'] } },
      data: {
        resolutionStatus: 'NOT_FOUND',
        resolutionReason: 'ORIGIN_ACTIVITY_AMBIGUOUS',
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('marks zero and multiple origin candidates without leaving mirrors routing', async () => {
    const prisma = {
      importSourceObject: {
        findMany: jest.fn(async () => [
          {
            id: 'missing',
            rawPayload: {
              listActivity: { start_date_local: '2026-10-10T07:00:00' },
            },
          },
          {
            id: 'ambiguous',
            rawPayload: {
              listActivity: { start_date_local: '2026-10-10T08:00:00' },
            },
          },
          {
            id: 'unique',
            rawPayload: {
              listActivity: { start_date_local: '2026-10-10T09:00:00' },
            },
          },
        ]),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const service = new ExternalActivityMirrorService(prisma as never, {
      sourceObjects: (client?: { importSourceObject: typeof prisma.importSourceObject }) =>
        client?.importSourceObject ?? prisma.importSourceObject,
    } as never);

    await service.classifySyncRequestCandidates('request-1', [
      '2026-10-10T08:00:00',
      '2026-10-10T08:00:00.000',
      '2026-10-10T09:00:00',
    ]);

    expect(prisma.importSourceObject.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['missing'] } },
      data: {
        resolutionStatus: 'NOT_FOUND',
        resolutionReason: 'ORIGIN_ACTIVITY_NOT_FOUND',
      },
    });
    expect(prisma.importSourceObject.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ambiguous'] } },
      data: {
        resolutionStatus: 'NOT_FOUND',
        resolutionReason: 'ORIGIN_ACTIVITY_AMBIGUOUS',
      },
    });
  });

  it('turns a routing mirror into a retryable failure when origin import dies', async () => {
    const prisma = {
      importSourceObject: {
        findUnique: jest.fn(async () => ({
          sourceKind: 'UNKNOWN',
          provider: 'unknown',
          rawPayload: {
            original: {
              listActivity: {
                start_date_local: '2026-10-10T07:30:00',
              },
            },
          },
        })),
        findMany: jest.fn(async () => [
          {
            id: 'mirror-1',
            rawPayload: {
              listActivity: {
                start_date_local: '2026-10-10T07:30:00',
              },
            },
          },
        ]),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const service = new ExternalActivityMirrorService(prisma as never, {
      sourceObjects: (client?: { importSourceObject: typeof prisma.importSourceObject }) =>
        client?.importSourceObject ?? prisma.importSourceObject,
    } as never);

    await service.markOriginImportFailed({
      userId: 'user-1',
      sourceObjectId: 'unknown-source-1',
    });

    expect(prisma.importSourceObject.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['mirror-1'] } },
      data: {
        resolutionStatus: 'BLOCKED',
        resolutionReason: 'ORIGIN_SYNC_FAILED',
      },
    });
  });
});
