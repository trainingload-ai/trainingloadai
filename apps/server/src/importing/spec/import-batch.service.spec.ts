import { createHash } from 'crypto';
import { Logger } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { ImportBatchService } from '../import-batch.service';
import { ImportingJobService } from '../importing-job.service';
import { ImportingJobRepository } from '../persistence/importing-job.repository';

describe('ImportBatchService', () => {
  function stableChecksum(value: unknown) {
    return createHash('sha256')
      .update(JSON.stringify(JSON.parse(JSON.stringify(value))))
      .digest('hex');
  }

  function createService() {
    const prisma = {
      t_user: {
        findUnique: jest.fn(async () => ({
          accountDeletionRequestedAt: null,
        })),
      },
      importSourceObject: {
        findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        findMany: jest.fn(async () => []),
        upsert: jest.fn(async (args: any) => ({
          id: `source-${args.create.sourceUid}`,
        })),
      },
      importItemJob: {
        findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        findMany: jest.fn(async () => []),
        groupBy: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
      activitySource: {
        findUnique: jest.fn(async () => ({
          isActive: true,
        })),
        findMany: jest.fn(async () => []),
      },
      importBatchJob: {
        create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
      userPostProcessJob: {
        findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        upsert: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
    };
    const storage = {
      uploadFile: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const i18n = {
      t: jest.fn((key: string) => key),
    };
    const externalActivityRouter = {
      routeIntervalsDiscovery: jest.fn(async () => ({
        kind: 'IMPORT_VIA_DISCOVERY_PROVIDER',
      })),
    };

    return {
      i18n,
      prisma,
      service: new ImportBatchService(
        prisma as never,
        storage as never,
        i18n as never,
        new ImportingJobService(new ImportingJobRepository(prisma as never)),
        { users: () => prisma.t_user } as never,
        externalActivityRouter as never,
      ),
      storage,
      externalActivityRouter,
    };
  }

  it('does not create new import work after account deletion is accepted', async () => {
    const { prisma, service } = createService();
    prisma.t_user.findUnique.mockResolvedValueOnce({
      accountDeletionRequestedAt: new Date(),
    });

    await expect(
      service.createExternalProviderImportBatch({
        userId: 'user-1',
        sourceKind: 'FILE',
        provider: 'intervals_icu',
        candidates: [],
        requestContext: { source: 'test' },
      }),
    ).rejects.toThrow('ACCOUNT_DELETION_IN_PROGRESS');
    expect(prisma.importBatchJob.create).not.toHaveBeenCalled();
  });

  it('registers uploaded files with bounded concurrent workers and stable positions', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const { prisma, service, storage } = createService();
    prisma.importBatchJob.create.mockResolvedValueOnce({ id: 'batch-1' });
    storage.uploadFile.mockImplementation(
      async (file: { originalname: string }) => ({
        fileKey: `uploads/${file.originalname}`,
      }),
    );
    prisma.importSourceObject.upsert.mockImplementation(
      async (args: { create: { fileName: string } }) => ({
        id: `source-${args.create.fileName}`,
      }),
    );
    prisma.importItemJob.create.mockImplementation(
      async (args: { data: { position: number } }) => ({
        id: `item-${args.data.position}`,
      }),
    );

    try {
      await service.createFileImportBatch({
        userId: 'user-1',
        files: [
          {
            originalname: 'first.fit',
            buffer: Buffer.from('first'),
            size: 5,
            mimetype: 'application/octet-stream',
          },
          {
            originalname: 'second.fit',
            buffer: Buffer.from('second'),
            size: 6,
            mimetype: 'application/octet-stream',
          },
        ] as Express.Multer.File[],
      });

      expect(storage.uploadFile).toHaveBeenCalledTimes(2);
      expect(prisma.importItemJob.create).toHaveBeenCalledTimes(2);
      expect(
        prisma.importItemJob.create.mock.calls
          .map(
            ([call]) => (call as { data: { position: number } }).data.position,
          )
          .sort(),
      ).toEqual([0, 1]);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('builds post-process ranges from DONE items only', async () => {
    const { prisma, service } = createService();
    prisma.importBatchJob.findUnique.mockResolvedValue({
      id: 'batch-1',
      userId: 'user-1',
      status: 'COMPLETED',
      totalCount: 1,
      successCount: 1,
      failedCount: 0,
      skippedCount: 0,
      items: [],
    });
    prisma.userPostProcessJob.findUnique.mockResolvedValue(null);
    prisma.userPostProcessJob.upsert.mockResolvedValue({
      id: 'post-1',
      status: 'PENDING',
    });
    prisma.importBatchJob.update.mockResolvedValue({ id: 'batch-1' });

    await service.createPostProcessJob('batch-1');

    expect(prisma.importBatchJob.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          items: expect.objectContaining({
            where: {
              activityId: { not: null },
              analysisRequired: true,
              status: 'DONE',
            },
          }),
        }),
      }),
    );
  });

  it('limits user metrics and PMC scope to activities from the latest 60 days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-07T00:00:00.000Z'));
    const { prisma, service } = createService();
    prisma.importBatchJob.findUnique.mockResolvedValue({
      id: 'batch-window',
      userId: 'user-1',
      status: 'COMPLETED',
      totalCount: 2,
      successCount: 2,
      failedCount: 0,
      skippedCount: 0,
      requestContext: {
        globalRefreshCandidates: [
          { sportType: 'SWIM', startTime: '2026-08-01T00:00:00.000Z' },
        ],
      },
      items: [
        {
          activity: {
            sportType: 'RUN',
            startTime: new Date('2026-07-01T00:00:00.000Z'),
          },
        },
        {
          activity: {
            sportType: 'CYCLING',
            startTime: new Date('2026-01-01T00:00:00.000Z'),
          },
        },
      ],
    });
    prisma.userPostProcessJob.findUnique.mockResolvedValue(null);
    prisma.userPostProcessJob.upsert.mockResolvedValue({
      id: 'post-window',
      status: 'PENDING',
    });
    prisma.importBatchJob.update.mockResolvedValue({ id: 'batch-window' });

    try {
      await service.createPostProcessJob('batch-window');

      expect(prisma.userPostProcessJob.upsert).toHaveBeenCalledWith({
        where: { batchJobId: 'batch-window' },
        update: {},
        create: expect.objectContaining({
          recomputeFrom: new Date('2026-07-01T00:00:00.000Z'),
          recomputeTo: new Date('2026-08-01T00:00:00.000Z'),
          affectedSportTypes: ['RUN', 'SWIM'],
          summary: expect.objectContaining({
            globalRefreshWindowDays: 60,
            globalRefreshEligibleCount: 2,
          }),
        }),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps old activity post-processing but skips user metrics and PMC scope', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-07T00:00:00.000Z'));
    const { prisma, service } = createService();
    prisma.importBatchJob.findUnique.mockResolvedValue({
      id: 'batch-old-only',
      userId: 'user-1',
      status: 'COMPLETED',
      totalCount: 1,
      successCount: 1,
      failedCount: 0,
      skippedCount: 0,
      requestContext: {},
      items: [
        {
          activity: {
            sportType: 'RUN',
            startTime: new Date('2026-01-01T00:00:00.000Z'),
          },
        },
      ],
    });
    prisma.userPostProcessJob.upsert.mockResolvedValue({
      id: 'post-old-only',
      status: 'PENDING',
    });
    prisma.importBatchJob.update.mockResolvedValue({ id: 'batch-old-only' });

    try {
      await service.createPostProcessJob('batch-old-only');

      expect(prisma.userPostProcessJob.upsert).toHaveBeenCalledWith({
        where: { batchJobId: 'batch-old-only' },
        update: {},
        create: expect.objectContaining({
          recomputeFrom: undefined,
          recomputeTo: undefined,
          affectedSportTypes: [],
          summary: expect.objectContaining({
            globalRefreshWindowDays: 60,
            globalRefreshEligibleCount: 0,
          }),
        }),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not regress a completed post-process batch to POST_PROCESSING', async () => {
    const { prisma, service } = createService();
    prisma.importBatchJob.findUnique.mockResolvedValue({
      id: 'batch-completed',
      userId: 'user-1',
      status: 'COMPLETED',
      totalCount: 1,
      successCount: 1,
      failedCount: 0,
      skippedCount: 0,
      requestContext: {},
      items: [],
    });
    prisma.userPostProcessJob.upsert.mockResolvedValue({
      id: 'post-completed',
      status: 'COMPLETED',
    });

    await service.createPostProcessJob('batch-completed');

    expect(prisma.importBatchJob.update).not.toHaveBeenCalled();
  });

  it('requeues a completed external source after deletion made it inactive', async () => {
    const { prisma, service } = createService();
    prisma.importItemJob.findFirst
      .mockResolvedValueOnce({ id: 'old-done-item' })
      .mockResolvedValueOnce(null);
    prisma.activitySource.findUnique.mockResolvedValue({
      isActive: false,
    });

    await expect(
      service.shouldQueueExternalArchiveSource({
        userId: 'user-1',
        sourceKind: 'FILE',
        sourceUid: 'external:user-1:activity-1',
      }),
    ).resolves.toBe(true);
  });

  it('derives batch totals from the grouped status query', async () => {
    const { prisma, service } = createService();
    const startedAt = new Date('2026-08-07T00:00:00.000Z');
    prisma.importBatchJob.findUnique.mockResolvedValue({
      id: 'batch-progress',
      userId: 'user-1',
      totalCount: 99,
      startedAt,
    });
    prisma.importItemJob.groupBy.mockResolvedValue([
      { status: 'DONE', _count: { _all: 2 } },
      { status: 'QUEUED', _count: { _all: 1 } },
      { status: 'SKIPPED', _count: { _all: 1 } },
    ]);
    prisma.importBatchJob.update.mockResolvedValue({ id: 'batch-progress' });

    await service.refreshBatchProgress('batch-progress');

    expect(prisma.importItemJob.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.importBatchJob.update).toHaveBeenCalledWith({
      where: { id: 'batch-progress' },
      data: {
        totalCount: 4,
        successCount: 2,
        failedCount: 0,
        skippedCount: 1,
        status: 'RUNNING',
        startedAt,
        completedAt: null,
      },
    });
  });

  it('creates Intervals.icu import source objects and item jobs for new list activities', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-06T10:30:00.000Z'));
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const { prisma, service } = createService();
    const activity1 = {
      id: 'activity-1',
      name: 'Threshold run',
      start_date: '2026-07-05T06:00:00Z',
    };
    const activity2 = {
      id: 'activity-2',
      name: 'Recovery ride',
      start_date_local: '2026-07-06T18:00:00',
    };
    prisma.importSourceObject.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.importItemJob.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.importBatchJob.create.mockResolvedValueOnce({
      id: 'batch-1',
    });
    prisma.importSourceObject.upsert
      .mockResolvedValueOnce({ id: 'source-object-1' })
      .mockResolvedValueOnce({ id: 'source-object-2' });
    prisma.importItemJob.create
      .mockResolvedValueOnce({ id: 'item-1' })
      .mockResolvedValueOnce({ id: 'item-2' });

    try {
      await expect(
        service.createIntervalsIcuImportBatch({
          userId: 'user-1',
          connectionId: 'connection-1',
          activities: [activity1, { id: '' }, activity2],
          reason: 'scheduled',
        }),
      ).resolves.toEqual({
        batch: { id: 'batch-1' },
        totalDiscovered: 2,
        queuedCount: 2,
        skippedCount: 0,
        directlyQueued: 2,
        routedToOrigin: 0,
        mirrorsCreated: 0,
        alreadyResolved: 0,
        duplicateOrRunning: 0,
      });

      expect(prisma.importBatchJob.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          sourceKind: 'INTERVALS_ICU',
          status: 'QUEUED',
          totalCount: 2,
          requestContext: {
            source: 'intervals_icu',
            reason: 'scheduled',
            connectionId: 'connection-1',
            totalDiscovered: 2,
          },
        },
      });
      expect(prisma.importSourceObject.upsert).toHaveBeenNthCalledWith(1, {
        where: {
          import_source_object_identity_unique: {
            userId: 'user-1',
            sourceKind: 'INTERVALS_ICU',
            sourceUid: 'intervals_icu:user-1:activity-1',
          },
        },
        create: expect.objectContaining({
          userId: 'user-1',
          sourceKind: 'INTERVALS_ICU',
          provider: 'intervals_icu',
          sourceUid: 'intervals_icu:user-1:activity-1',
          accountRef: '0',
          externalId: 'activity-1',
          objectType: 'third_party_activity_file',
          rawChecksum: expect.any(String),
          rawPayload: {
            listActivity: activity1,
            connectionId: 'connection-1',
          },
          metadata: {
            connectionId: 'connection-1',
            listChecksum: expect.any(String),
            listActivityName: 'Threshold run',
            listActivityStartDate: '2026-07-05T06:00:00Z',
          },
          discoveredAt: new Date('2026-07-06T10:30:00.000Z'),
          lastSeenAt: new Date('2026-07-06T10:30:00.000Z'),
          sourceUpdatedAt: new Date('2026-07-06T10:30:00.000Z'),
        }),
        update: expect.objectContaining({
          provider: 'intervals_icu',
          accountRef: '0',
          externalId: 'activity-1',
          objectType: 'third_party_activity_file',
          rawChecksum: expect.any(String),
          rawPayload: {
            listActivity: activity1,
            connectionId: 'connection-1',
          },
          metadata: expect.objectContaining({
            connectionId: 'connection-1',
            listActivityName: 'Threshold run',
          }),
          lastSeenAt: new Date('2026-07-06T10:30:00.000Z'),
          sourceUpdatedAt: new Date('2026-07-06T10:30:00.000Z'),
        }),
      });
      expect(prisma.importItemJob.create).toHaveBeenNthCalledWith(1, {
        data: {
          batchJobId: 'batch-1',
          userId: 'user-1',
          sourceObjectId: 'source-object-1',
          sourceKind: 'INTERVALS_ICU',
          sourceUid: 'intervals_icu:user-1:activity-1',
          position: 0,
          status: 'QUEUED',
          sourceRef: {
            externalId: 'activity-1',
            connectionId: 'connection-1',
          },
        },
      });
      expect(prisma.importItemJob.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            sourceObjectId: 'source-object-2',
            sourceUid: 'intervals_icu:user-1:activity-2',
            position: 1,
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
      logSpy.mockRestore();
    }
  });

  it('skips unchanged completed or currently running Intervals.icu activities', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const { prisma, service } = createService();
    const unchangedActivity = { id: 'done-activity', name: 'Done' };
    const runningActivity = { id: 'running-activity', name: 'Running' };
    const newActivity = { id: 'new-activity', name: 'New' };
    prisma.importSourceObject.findMany.mockResolvedValueOnce([
      {
        id: 'source-object-done',
        sourceUid: 'intervals_icu:user-1:done-activity',
        rawChecksum: null,
        metadata: {
          listChecksum: stableChecksum(unchangedActivity),
        },
      },
    ]);
    prisma.importItemJob.findMany.mockResolvedValueOnce([
      {
        sourceUid: 'intervals_icu:user-1:done-activity',
        status: 'DONE',
      },
      {
        sourceUid: 'intervals_icu:user-1:running-activity',
        status: 'FETCHING',
      },
    ]);
    prisma.activitySource.findMany.mockResolvedValueOnce([
      { sourceUid: 'intervals_icu:user-1:done-activity' },
    ]);
    prisma.importBatchJob.create.mockResolvedValueOnce({
      id: 'batch-1',
    });
    prisma.importSourceObject.upsert.mockResolvedValueOnce({
      id: 'source-object-new',
    });
    prisma.importItemJob.create.mockResolvedValueOnce({ id: 'item-new' });

    try {
      await expect(
        service.createIntervalsIcuImportBatch({
          userId: 'user-1',
          connectionId: 'connection-1',
          activities: [unchangedActivity, runningActivity, newActivity],
          reason: 'manual',
        }),
      ).resolves.toEqual({
        batch: { id: 'batch-1' },
        totalDiscovered: 3,
        queuedCount: 1,
        skippedCount: 2,
        directlyQueued: 1,
        routedToOrigin: 0,
        mirrorsCreated: 0,
        alreadyResolved: 0,
        duplicateOrRunning: 2,
      });
      expect(prisma.importBatchJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sourceKind: 'INTERVALS_ICU',
          totalCount: 1,
          requestContext: expect.objectContaining({
            totalDiscovered: 3,
          }),
        }),
      });
      expect(prisma.importSourceObject.upsert).toHaveBeenCalledTimes(3);
      expect(prisma.importItemJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sourceUid: 'intervals_icu:user-1:new-activity',
          position: 0,
        }),
      });
    } finally {
      logSpy.mockRestore();
    }
  });
});
