import { describe, expect, it, jest } from '@jest/globals';
import { CanonicalActivityMaterializer } from '../canonical-activity.materializer';
import { ActivityAssociationService } from '../activity-association.service';
import { ActivityDatasetSelectorService } from '../activity-dataset-selector.service';
import { SensorFileQueryService } from '../../sensor/sensor-file-query.service';
import { SensorFileRepository } from '../../sensor/persistence/sensor-file.repository';
import { ActivityIngestService } from '../../api/activity/activity-ingest.service';
import type { CanonicalActivityPayload } from '../canonical-activity.types';

function intervalsPayload(): CanonicalActivityPayload {
  return {
    source: {
      kind: 'INTERVALS_ICU',
      sourceUid: 'intervals_icu:user-1:i166508699#0',
      externalId: 'i166508699',
      accountRef: 'athlete-1',
      fileName: 'activity.fit',
      fileKey: 'activities/activity.fit',
    },
    identity: { dedupeKey: 'canonical-dedupe-key' },
    summary: {
      name: 'Morning Run',
      sportType: 'RUN',
      startTime: '2026-07-20T06:00:00.000Z',
      endTime: '2026-07-20T07:00:00.000Z',
    },
    laps: [],
    metadata: { source: 'intervals_icu' },
  } as never;
}

function legacyActivity() {
  return {
    id: 42,
    userId: 'user-1',
    thirdPartyProvider: 'intervals_icu',
    thirdPartyActivityId: 'i166508699',
    sportDefinitionCode: null,
  };
}

function createMaterializerPrisma(overrides?: Record<string, unknown>) {
  const prisma = {
    canonicalActivitySnapshot: {
      upsert: jest.fn(async () => ({ id: 'snapshot-1' })),
    },
    activitySource: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(
        async () => null,
      ),
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(
        async () => null,
      ),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(
        async () => [],
      ),
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(
        async () => null,
      ),
      updateMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(
        async () => ({ count: 0 }),
      ),
      upsert: jest.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
        id: 'source-1',
      })),
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
        id: 'source-1',
      })),
    },
    activity: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(
        async () => null,
      ),
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(async () =>
        legacyActivity(),
      ),
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(
        async () => [],
      ),
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(async () =>
        legacyActivity(),
      ),
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
        ...legacyActivity(),
        id: 100,
        thirdPartyActivityId: null,
      })),
    },
    activityLap: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    activityParquetFile: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      upsert: jest.fn(async () => ({ id: 'parquet-1' })),
    },
    storageObjectGarbage: {
      upsert: jest.fn(async () => ({ id: 'garbage-1' })),
    },
    activityZone: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    activityCoggan: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    activityBikeScore: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    activitySwimScore: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    activityGOVSS: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    activityCalculatedPower: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    activityTrimp: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    activityVO2Max: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    activityTrainingEffect: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    activityPeakMetric: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    activityPerformanceTT: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    activityFitnessMetricsSnapshot: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    activityPolyline: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    activityPolylineSegment: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    activityAiReview: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    userBestMetric: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    userBestTT: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    activityMapThumbJob: {
      findUnique: jest.fn(async () => null),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    activityThirdPartyMapping: {
      findUnique: jest.fn(async () => null),
      updateMany: jest.fn(async () => ({ count: 0 })),
      upsert: jest.fn(async () => ({ id: 'mapping-1' })),
    },
    thirdPartyActivity: {
      update: jest.fn(async () => ({ id: 7, state: 1 })),
    },
    $transaction: jest.fn(async (callback: (client: never) => unknown) =>
      callback(prisma as never),
    ),
    $executeRawUnsafe: jest.fn(async () => 1),
    ...overrides,
  };
  const sportCatalog = {
    fromProvider: jest.fn(async () => null),
    resolve: jest.fn(async () => ({ code: 'ROAD_RUNNING' })),
  };
  const timezoneInitializer = {
    initializeFromAvailableSignals: jest.fn<
      (...args: unknown[]) => Promise<unknown>
    >(async () => ({ timezone: null, initialized: false, source: 'NONE' })),
    initializeFromCoordinateActivity: jest.fn(async () => undefined),
  };
  return {
    prisma,
    timezoneInitializer,
    materializer: new CanonicalActivityMaterializer(
      prisma as never,
      {} as never,
      sportCatalog as never,
      timezoneInitializer as never,
      new ActivityAssociationService(prisma as never),
      new ActivityDatasetSelectorService(),
      new SensorFileQueryService(new SensorFileRepository(prisma as never)),
      new ActivityIngestService(prisma as never),
    ),
  };
}

describe('CanonicalActivityMaterializer sport resolution', () => {
  it('prefers the TrackSwap sport + FIT sub sport combination for uploads', async () => {
    const sportCatalog = {
      fromProvider: jest.fn(
        async (args: {
          provider?: string;
          externalCode?: string;
          externalSubCode?: string;
        }) =>
          args.provider === 'upload' &&
          args.externalCode === 'cycling' &&
          args.externalSubCode === 'indoor_cycling'
            ? { sport: { code: 'INDOOR_CYCLING' } }
            : null,
      ),
      resolve: jest.fn(async () => ({ code: 'ROAD_CYCLING' })),
    };
    const materializer = new CanonicalActivityMaterializer(
      {} as never,
      {} as never,
      sportCatalog as never,
      {} as never,
      {} as never,
      {} as never,
      new SensorFileQueryService(new SensorFileRepository({} as never)),
      new ActivityIngestService({} as never),
    );

    const code = await materializer.resolveSportDefinitionCode(
      {
        summary: { sportType: 'CYCLING' },
        metadata: {
          trackswapSport: 'cycling',
          trackswapSubSportRaw: 'indoor_cycling',
        },
      } as never,
      null,
    );

    expect(code).toBe('INDOOR_CYCLING');
    expect(sportCatalog.fromProvider).toHaveBeenCalledWith({
      provider: 'upload',
      externalCode: 'cycling',
      externalSubCode: 'indoor_cycling',
    });
  });
});

describe('CanonicalActivityMaterializer provider identity reuse', () => {
  it('preserves BIDIRECTIONAL when an exported mapping is imported again', async () => {
    const { prisma, materializer } = createMaterializerPrisma();
    prisma.activityThirdPartyMapping.findUnique.mockResolvedValue({
      activityId: 42,
      syncDirection: 'BIDIRECTIONAL',
    });

    await (
      materializer as unknown as {
        upsertThirdPartyMapping: (...args: unknown[]) => unknown;
      }
    ).upsertThirdPartyMapping({
      activityId: 42,
      thirdPartyActivityId: 7,
      isPrimary: true,
    });

    expect(prisma.activityThirdPartyMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          syncDirection: 'BIDIRECTIONAL',
        }),
      }),
    );
    expect(prisma.thirdPartyActivity.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { state: 1 },
    });
    expect(prisma.activityThirdPartyMapping.updateMany).toHaveBeenCalledWith({
      where: {
        activityId: 42,
        thirdPartyActivityId: { not: 7 },
        isActive: true,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });
  });

  it('clears legacy provider primary mappings when FILE becomes primary', async () => {
    const { prisma, materializer } = createMaterializerPrisma();

    await (
      materializer as unknown as {
        upsertThirdPartyMapping: (...args: unknown[]) => unknown;
      }
    ).upsertThirdPartyMapping({
      activityId: 42,
      isPrimary: true,
    });

    expect(prisma.activityThirdPartyMapping.updateMany).toHaveBeenCalledWith({
      where: {
        activityId: 42,
        isActive: true,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });
    expect(prisma.activityThirdPartyMapping.upsert).not.toHaveBeenCalled();
  });

  it('rebuilds an unchanged primary dataset when the prior materialization is incomplete', async () => {
    const incomplete = {
      ...legacyActivity(),
      processingStatus: 'MATERIALIZED',
    };
    const primarySource = {
      id: 'source-1',
      activityId: incomplete.id,
      isPrimary: true,
      isActive: true,
      sourceChecksum: 'checksum-1',
      activity: incomplete,
      metadata: null,
      canonicalSnapshot: null,
    };
    const { prisma, materializer } = createMaterializerPrisma();
    prisma.activitySource.findUnique.mockResolvedValue(primarySource);
    prisma.activitySource.findFirst.mockResolvedValue(primarySource);
    prisma.activitySource.upsert.mockResolvedValue(primarySource);
    prisma.activity.update.mockResolvedValue(incomplete);

    await expect(
      materializer.materialize({
        itemJobId: 'item-retry',
        batchJobId: 'batch-1',
        sourceObjectId: 'source-object-1',
        userId: 'user-1',
        payload: {
          ...intervalsPayload(),
          source: {
            ...intervalsPayload().source,
            sourceChecksum: 'checksum-1',
          },
        },
      }),
    ).resolves.toMatchObject({
      created: false,
      shouldRebuild: true,
      primaryChanged: false,
      primaryDatasetChanged: false,
      outcome: 'PRIMARY_REBUILT',
    });

    expect(prisma.activity.update).not.toHaveBeenCalled();
    expect(prisma.activitySource.upsert).not.toHaveBeenCalled();
  });

  it('does not rebuild an unchanged primary dataset that is already ready', async () => {
    const ready = { ...legacyActivity(), processingStatus: 'READY' };
    const primarySource = {
      id: 'source-1',
      activityId: ready.id,
      isPrimary: true,
      isActive: true,
      sourceChecksum: 'checksum-1',
      activity: ready,
      metadata: null,
      canonicalSnapshot: null,
    };
    const { prisma, materializer } = createMaterializerPrisma();
    prisma.activitySource.findUnique.mockResolvedValue(primarySource);
    prisma.activitySource.findFirst.mockResolvedValue(primarySource);
    prisma.activitySource.upsert.mockResolvedValue(primarySource);

    await expect(
      materializer.materialize({
        itemJobId: 'item-repeat',
        userId: 'user-1',
        payload: {
          ...intervalsPayload(),
          source: {
            ...intervalsPayload().source,
            sourceChecksum: 'checksum-1',
          },
        },
      }),
    ).resolves.toMatchObject({
      shouldRebuild: false,
      outcome: 'ASSOCIATED_NO_REBUILD',
    });
  });

  it('backfills legacy quality and allows a clearly better incoming dataset to promote', async () => {
    const ready = { ...legacyActivity(), processingStatus: 'READY' };
    const primarySource = {
      id: 'legacy-primary',
      activityId: ready.id,
      isPrimary: true,
      isActive: true,
      sourceChecksum: 'legacy-checksum',
      activity: ready,
      metadata: null,
      canonicalSnapshot: null,
    };
    const { prisma, materializer } = createMaterializerPrisma();
    prisma.activitySource.findUnique.mockResolvedValue(null);
    prisma.activitySource.findFirst.mockResolvedValue(primarySource);
    prisma.activityParquetFile.findMany.mockResolvedValue([]);

    const payload = intervalsPayload();
    payload.summary.elapsedTime = 100;
    payload.source.sourceChecksum = 'better-checksum';
    payload.records = Array.from({ length: 100 }, (_, index) => ({
      timestamp: new Date(Date.now() + index * 1000).toISOString(),
      heartRate: 140,
    }));

    await expect(
      materializer.materialize({
        itemJobId: 'item-better',
        userId: 'user-1',
        payload,
      }),
    ).resolves.toMatchObject({
      shouldRebuild: true,
      primaryChanged: true,
      outcome: 'PRIMARY_REBUILT',
      pendingCommit: {
        activityId: 42,
        expectedPrimarySourceId: 'legacy-primary',
      },
    });

    expect(prisma.activitySource.update).toHaveBeenCalledWith({
      where: { id: 'legacy-primary' },
      data: {
        metadata: expect.objectContaining({
          datasetQualityOrigin: 'legacy_activity_estimate_v1',
          datasetQuality: expect.objectContaining({ score: 0 }),
        }),
      },
    });
  });

  it('lets the item that committed an analyzing dataset resume its LIGHT stage', async () => {
    const analyzing = { ...legacyActivity(), processingStatus: 'ANALYZING' };
    const primarySource = {
      id: 'source-1',
      activityId: analyzing.id,
      isPrimary: true,
      isActive: true,
      sourceChecksum: 'checksum-1',
      canonicalSnapshotId: 'snapshot-1',
      activity: analyzing,
      metadata: null,
      canonicalSnapshot: null,
    };
    const { prisma, materializer } = createMaterializerPrisma();
    prisma.activitySource.findUnique.mockResolvedValue(primarySource);
    prisma.activitySource.findFirst.mockResolvedValue(primarySource);

    await expect(
      materializer.materialize({
        itemJobId: 'item-resume',
        userId: 'user-1',
        payload: {
          ...intervalsPayload(),
          source: {
            ...intervalsPayload().source,
            sourceChecksum: 'checksum-1',
          },
        },
      }),
    ).resolves.toMatchObject({
      shouldRebuild: true,
      pendingCommit: { expectedPrimarySourceId: 'source-1' },
    });
  });

  it('defers another item while the current primary dataset is analyzing', async () => {
    const analyzing = { ...legacyActivity(), processingStatus: 'ANALYZING' };
    const primarySource = {
      id: 'source-current',
      activityId: analyzing.id,
      isPrimary: true,
      isActive: true,
      sourceChecksum: 'checksum-current',
      canonicalSnapshotId: 'snapshot-current',
      activity: analyzing,
      metadata: {
        datasetQuality: {
          version: 'v1',
          score: 0,
          recordCount: 0,
          recordDensity: 0,
          gpsCoverage: 0,
          heartRateCoverage: 0,
          powerCoverage: 0,
          cadenceCoverage: 0,
          lapCount: 0,
          lengthCount: 0,
        },
      },
      canonicalSnapshot: null,
    };
    const { prisma, materializer } = createMaterializerPrisma();
    prisma.activitySource.findUnique.mockResolvedValue(null);
    prisma.activitySource.findFirst.mockResolvedValue(primarySource);

    await expect(
      materializer.materialize({
        itemJobId: 'item-other',
        userId: 'user-1',
        payload: {
          ...intervalsPayload(),
          summary: {
            ...intervalsPayload().summary,
            elapsedTime: 10,
          },
          source: {
            ...intervalsPayload().source,
            sourceUid: 'intervals_icu:user-1:other#0',
            sourceChecksum: 'checksum-better',
          },
          records: Array.from({ length: 10 }, (_, index) => ({
            index,
            positionLat: 1,
            positionLong: 1,
            heartRate: 150,
          })),
        },
      }),
    ).rejects.toThrow(
      'Canonical activity 42 is still analyzing another dataset',
    );

    expect(prisma.activitySource.upsert).not.toHaveBeenCalled();
    expect(prisma.activity.update).not.toHaveBeenCalled();
  });

  it('does not replace the in-flight primary snapshot for a duplicate item', async () => {
    const analyzing = { ...legacyActivity(), processingStatus: 'ANALYZING' };
    const primarySource = {
      id: 'source-1',
      activityId: analyzing.id,
      isPrimary: true,
      isActive: true,
      sourceChecksum: 'checksum-1',
      canonicalSnapshotId: 'snapshot-in-flight',
      activity: analyzing,
      metadata: null,
      canonicalSnapshot: null,
    };
    const { prisma, materializer } = createMaterializerPrisma();
    prisma.activitySource.findUnique.mockResolvedValue(primarySource);
    prisma.activitySource.findFirst.mockResolvedValue(primarySource);

    await expect(
      materializer.materialize({
        itemJobId: 'item-duplicate',
        userId: 'user-1',
        payload: {
          ...intervalsPayload(),
          source: {
            ...intervalsPayload().source,
            sourceChecksum: 'checksum-1',
          },
        },
      }),
    ).resolves.toMatchObject({
      shouldRebuild: false,
      outcome: 'ASSOCIATED_NO_REBUILD',
    });

    expect(prisma.activitySource.upsert).not.toHaveBeenCalled();
  });

  it('reactivates a previously hidden activity when its source is imported again', async () => {
    const hidden = {
      ...legacyActivity(),
      state: 0,
      processingStatus: 'PARTIAL_FAILED',
    };
    const inactiveSource = {
      id: 'source-hidden',
      activityId: hidden.id,
      isPrimary: false,
      isActive: false,
      sourceChecksum: 'checksum-hidden',
      activity: hidden,
      metadata: null,
      canonicalSnapshot: null,
    };
    const { prisma, materializer } = createMaterializerPrisma();
    prisma.activitySource.findUnique.mockResolvedValue(inactiveSource);
    prisma.activitySource.findFirst.mockResolvedValue(null);
    prisma.activitySource.upsert.mockResolvedValue({
      ...inactiveSource,
      isActive: true,
      isPrimary: true,
    });
    prisma.activity.update.mockImplementation(async (args) => {
      const { data } = args as { data: Record<string, unknown> };
      return { ...hidden, ...data };
    });

    await expect(
      materializer.materialize({
        itemJobId: 'item-reactivate',
        userId: 'user-1',
        payload: {
          ...intervalsPayload(),
          source: {
            ...intervalsPayload().source,
            sourceChecksum: 'checksum-hidden',
          },
        },
      }),
    ).resolves.toMatchObject({
      activity: { id: hidden.id, state: 0 },
      shouldRebuild: true,
      primaryChanged: true,
      pendingCommit: {
        activityId: hidden.id,
        expectedPrimarySourceId: null,
      },
    });

    expect(prisma.activity.update).not.toHaveBeenCalled();
  });

  it('serializes the final candidate recheck and creation with a user advisory lock', async () => {
    const { prisma, materializer } = createMaterializerPrisma();

    await expect(
      materializer.materialize({
        itemJobId: 'item-new',
        batchJobId: 'batch-1',
        sourceObjectId: 'source-object-1',
        userId: 'user-1',
        payload: {
          ...intervalsPayload(),
          source: {
            ...intervalsPayload().source,
            externalId: undefined,
          },
        },
      }),
    ).resolves.toMatchObject({ created: true, shouldRebuild: true });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock',
      'user-1',
    );
    expect(prisma.activity.create).toHaveBeenCalledTimes(1);
  });

  it('uses the account timezone for a generated fallback title', async () => {
    const { prisma, materializer, timezoneInitializer } =
      createMaterializerPrisma();
    timezoneInitializer.initializeFromAvailableSignals.mockResolvedValue({
      timezone: 'Asia/Shanghai',
      initialized: false,
      source: 'EXISTING',
    });

    await materializer.materialize({
      itemJobId: 'item-generated-title',
      userId: 'user-1',
      payload: {
        ...intervalsPayload(),
        summary: {
          ...intervalsPayload().summary,
          name: undefined,
          timezone: undefined,
          startTime: '2026-09-24T07:54:02.000Z',
        },
      },
    });

    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ activityName: 'Afternoon Run' }),
      }),
    );
  });

  it('does not guess a day period from the server timezone', async () => {
    const { prisma, materializer } = createMaterializerPrisma();

    await materializer.materialize({
      itemJobId: 'item-generated-title-without-timezone',
      userId: 'user-1',
      payload: {
        ...intervalsPayload(),
        summary: {
          ...intervalsPayload().summary,
          name: undefined,
          timezone: undefined,
          startTime: '2026-09-24T07:54:02.000Z',
        },
      },
    });

    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ activityName: 'Run' }),
      }),
    );
  });

  it('persists sanitized activity and lap max speed for a new import', async () => {
    const { prisma, materializer } = createMaterializerPrisma();
    const payload: CanonicalActivityPayload = {
      ...intervalsPayload(),
      summary: {
        ...intervalsPayload().summary,
        maxSpeed: 17,
      },
      laps: [{ index: 1, maxSpeed: 17 }],
      records: [5, 5.2, 17, 5.3, 5.4].map((speed, index) => ({
        index,
        lapIndex: 1,
        timestamp: new Date(Date.UTC(2026, 6, 20, 6, 0, index)).toISOString(),
        speed,
      })),
    };

    await materializer.materialize({
      itemJobId: 'item-sanitized-speed',
      userId: 'user-1',
      payload,
    });

    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maxSpeed: 5.4 }),
      }),
    );
    expect(prisma.activityLap.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ index: 1, maxSpeed: 5.4 })],
    });
  });

  it('keeps the source summary max when the record curve needs no correction', async () => {
    const { prisma, materializer } = createMaterializerPrisma();
    const payload: CanonicalActivityPayload = {
      ...intervalsPayload(),
      summary: {
        ...intervalsPayload().summary,
        maxSpeed: 9,
      },
      records: [8, 8.2, 8.1, 8].map((speed, index) => ({
        index,
        timestamp: new Date(Date.UTC(2026, 6, 20, 6, 0, index)).toISOString(),
        speed,
      })),
    };

    await materializer.materialize({
      itemJobId: 'item-source-summary-speed',
      userId: 'user-1',
      payload,
    });

    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maxSpeed: 9 }),
      }),
    );
  });

  it('reuses a legacy provider activity and backfills its ActivitySource', async () => {
    const existing = legacyActivity();
    const { prisma, materializer } = createMaterializerPrisma();
    prisma.activity.findUnique.mockResolvedValue(existing);
    prisma.activity.update.mockResolvedValue({
      ...existing,
      sportDefinitionCode: 'ROAD_RUNNING',
    });

    const result = await materializer.materialize({
      itemJobId: 'item-1',
      batchJobId: 'batch-1',
      sourceObjectId: 'source-object-1',
      userId: 'user-1',
      payload: intervalsPayload(),
      thirdPartyActivityId: 7,
    });
    expect(result).toMatchObject({
      activity: { id: 42 },
      created: false,
      reusedReason: 'provider',
      shouldRebuild: true,
      pendingCommit: {
        activityId: 42,
        expectedPrimarySourceId: null,
      },
    });
    expect(prisma.activitySource.upsert).not.toHaveBeenCalled();
    if (!result.pendingCommit) throw new Error('missing commit token');
    prisma.activityParquetFile.findMany.mockResolvedValueOnce([
      { parquetPath: 'live/old-records.parquet' },
    ]);
    prisma.activityMapThumbJob.findUnique.mockResolvedValueOnce({
      r2Key: 'maps/old-light.png',
      r2DarkKey: 'maps/old-dark.png',
    });

    await materializer.commitStagedDataset({
      token: result.pendingCommit,
      userId: 'user-1',
      batchJobId: 'batch-1',
      sourceObjectId: 'source-object-1',
      payload: intervalsPayload(),
      stagedParquetFiles: [
        {
          activityId: 42,
          type: 'record',
          parquetPath: 'staged/records.parquet',
          pointCount: 10,
          fileSize: 100,
          storageStrategy: 'R2',
          checksum: 'parquet-checksum',
        },
      ],
    });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(1095981392, $1::integer)::text AS lock',
      42,
    );
    expect(prisma.activitySource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          activity_source_identity_unique: {
            userId: 'user-1',
            sourceKind: 'INTERVALS_ICU',
            sourceUid: 'intervals_icu:user-1:i166508699#0',
          },
        },
        create: expect.objectContaining({
          activityId: 42,
          canonicalSnapshotId: 'snapshot-1',
          externalId: 'i166508699',
          isPrimary: true,
        }),
      }),
    );
    expect(prisma.activitySource.findFirst).toHaveBeenCalled();
    expect(prisma.activityParquetFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          parquetPath: 'staged/records.parquet',
        }),
      }),
    );
    expect(prisma.storageObjectGarbage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          bucket_objectKey: {
            bucket: 'default',
            objectKey: 'live/old-records.parquet',
          },
        },
        create: expect.objectContaining({
          activityId: 42,
          reason: 'canonical_primary_replaced',
        }),
      }),
    );
    expect(prisma.storageObjectGarbage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          bucket_objectKey: {
            bucket: 'public',
            objectKey: 'maps/old-light.png',
          },
        },
        create: expect.objectContaining({
          reason: 'canonical_map_thumbnail_invalidated',
        }),
      }),
    );
    expect(prisma.activity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          avgPower: null,
          eftp: null,
          readyAt: null,
          processingStatus: 'ANALYZING',
        }),
      }),
    );
    expect(prisma.activityZone.deleteMany).toHaveBeenCalledWith({
      where: { activityId: 42 },
    });
    expect(prisma.activityPeakMetric.deleteMany).toHaveBeenCalledWith({
      where: { activityId: 42 },
    });
    expect(prisma.activityAiReview.deleteMany).toHaveBeenCalledWith({
      where: { activityId: 42 },
    });
    expect(prisma.userBestMetric.deleteMany).toHaveBeenCalledWith({
      where: { activityId: 42 },
    });
    expect(prisma.userBestTT.deleteMany).toHaveBeenCalledWith({
      where: { activityId: 42 },
    });
    expect(prisma.activityMapThumbJob.updateMany).toHaveBeenCalledWith({
      where: { activityId: 42 },
      data: expect.objectContaining({
        status: 'DEAD',
        r2Url: null,
        lockToken: null,
      }),
    });
    // source / Activity / laps / Parquet / mapping 在同一个提交事务中收口。
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a staged commit when another worker changed the primary', async () => {
    const { prisma, materializer } = createMaterializerPrisma();
    prisma.activitySource.findFirst.mockResolvedValue({ id: 'source-new' });

    await expect(
      materializer.commitStagedDataset({
        token: {
          activityId: 42,
          expectedPrimarySourceId: 'source-old',
          canonicalSnapshotId: 'snapshot-1',
          sportDefinitionCode: 'ROAD_RUNNING',
          provider: 'intervals_icu',
          quality: {} as never,
          matchingFields: {},
        },
        userId: 'user-1',
        payload: intervalsPayload(),
        stagedParquetFiles: [],
      }),
    ).rejects.toThrow('Canonical primary changed while staging activity 42');

    expect(prisma.activitySource.updateMany).not.toHaveBeenCalled();
    expect(prisma.activity.update).not.toHaveBeenCalled();
    expect(prisma.activityParquetFile.upsert).not.toHaveBeenCalled();
  });

  it('turns a concurrent provider unique conflict into successful reuse', async () => {
    const existing = { ...legacyActivity(), processingStatus: 'READY' };
    let providerLookup = 0;
    let conflictOccurred = false;
    const winningSource = {
      id: 'source-winning',
      activityId: existing.id,
      activity: existing,
      isPrimary: true,
      isActive: true,
      sourceChecksum: undefined,
      metadata: null,
      canonicalSnapshot: null,
    };
    const { prisma, materializer } = createMaterializerPrisma({
      activitySource: {
        findUnique: jest.fn(async () =>
          conflictOccurred ? winningSource : null,
        ),
        findFirst: jest.fn(async () =>
          conflictOccurred ? winningSource : null,
        ),
        findMany: jest.fn(async () => []),
        update: jest.fn(async () => null),
        updateMany: jest.fn(async () => ({ count: 0 })),
        upsert: jest.fn(async () => winningSource),
        create: jest.fn(async () => winningSource),
      },
      activity: {
        findUnique: jest.fn(async () => {
          providerLookup += 1;
          return providerLookup === 1 ? null : existing;
        }),
        findMany: jest.fn(async () => []),
        update: jest.fn(async () => ({
          ...existing,
          sportDefinitionCode: 'ROAD_RUNNING',
        })),
      },
    });
    prisma.$transaction.mockImplementationOnce(async () => {
      conflictOccurred = true;
      throw { code: 'P2002' };
    });

    await expect(
      materializer.materialize({
        itemJobId: 'item-2',
        batchJobId: 'batch-1',
        sourceObjectId: 'source-object-1',
        userId: 'user-1',
        payload: intervalsPayload(),
        thirdPartyActivityId: 7,
      }),
    ).resolves.toMatchObject({
      activity: { id: 42 },
      created: false,
      reusedReason: 'source',
    });

    expect(prisma.activity.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.activitySource.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.activityThirdPartyMapping.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not attach a provider activity owned by another user', async () => {
    const { materializer } = createMaterializerPrisma({
      activity: {
        findUnique: jest.fn(async () => ({
          ...legacyActivity(),
          userId: 'user-2',
        })),
        update: jest.fn(async () => legacyActivity()),
      },
    });

    await expect(
      materializer.materialize({
        itemJobId: 'item-3',
        batchJobId: 'batch-1',
        sourceObjectId: 'source-object-1',
        userId: 'user-1',
        payload: intervalsPayload(),
      }),
    ).rejects.toThrow('Legacy provider identity belongs to another user');
  });

  it('never silently rebinds a third-party activity mapped to another Activity', async () => {
    const { prisma, materializer } = createMaterializerPrisma();
    prisma.activityThirdPartyMapping.findUnique.mockResolvedValueOnce({
      id: 9,
      activityId: 999,
      thirdPartyActivityId: 7,
      mappingType: 'EXACT',
      confidence: 1,
      matchingFields: null,
      syncDirection: 'IMPORT',
    });

    await expect(
      (
        materializer as unknown as {
          upsertThirdPartyMapping: (...args: unknown[]) => unknown;
        }
      ).upsertThirdPartyMapping({
        activityId: 42,
        thirdPartyActivityId: 7,
        mappingType: 'EXACT',
        confidence: 1,
        matchingFields: { matcherVersion: 'test' },
        isPrimary: true,
      }),
    ).rejects.toThrow(
      'Third-party activity 7 is already mapped to activity 999',
    );
    expect(prisma.thirdPartyActivity.update).not.toHaveBeenCalled();
    expect(prisma.activityThirdPartyMapping.upsert).not.toHaveBeenCalled();
  });
});
