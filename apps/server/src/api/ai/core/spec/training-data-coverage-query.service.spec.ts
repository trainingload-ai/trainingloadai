import { ImportBatchJobStatus, ImportSourceKind } from '@prisma/client';
import { TrainingDataCoverageQueryService } from '../training-data-coverage-query.service';

describe('TrainingDataCoverageQueryService', () => {
  it('reads lightweight activity evidence without inspecting provider connections', async () => {
    const activities = {
      dataCoverageSince: jest.fn(async () => ({
        readyCount: 2,
        latestReadyAt: '2026-10-25T08:00:00.000Z',
        bySource: [],
        processing: [],
      })),
    };
    const importJobs = {
      batchJobs: jest.fn(() => ({ findMany: jest.fn() })),
    };
    const integrations = { listForUser: jest.fn() };
    const service = new TrainingDataCoverageQueryService(
      activities as never,
      importJobs as never,
      integrations as never,
    );

    const result = await service.activityEvidence({
      userId: 'user-1',
      windowDays: 30,
      now: new Date('2026-10-26T08:00:00.000Z'),
    });

    expect(result).toMatchObject({
      kind: 'activity_evidence',
      window: { days: 30 },
      activities: {
        readyCount: 2,
        latestReadyAt: '2026-10-25T08:00:00.000Z',
      },
    });
    expect(integrations.listForUser).not.toHaveBeenCalled();
    expect(importJobs.batchJobs).not.toHaveBeenCalled();
  });

  it('separates sync and processing facts from coaching judgment', async () => {
    const activities = {
      dataCoverageSince: jest.fn(async () => ({
        readyCount: 0,
        latestReadyAt: null,
        bySource: [],
        processing: [{ status: 'ANALYZING', count: 1 }],
      })),
    };
    const recentBatch = {
      id: 'batch-1',
      sourceKind: ImportSourceKind.FILE,
      status: ImportBatchJobStatus.POST_PROCESSING,
      totalCount: 1,
      successCount: 1,
      failedCount: 0,
      skippedCount: 0,
      createdAt: new Date('2026-10-25T08:00:00.000Z'),
      completedAt: null,
    };
    const importJobs = {
      batchJobs: () => ({ findMany: jest.fn(async () => [recentBatch]) }),
    };
    const integrations = {
      listForUser: jest.fn(async () => [
        {
          provider: 'intervals_icu',
          enabled: true,
          connected: true,
          connectionState: 'ACTIVE',
          operations: {
            completedActivities: {
              import: { state: 'AUTOMATIC_ENABLED' },
            },
          },
          sync: {
            startedAt: '2026-10-26T07:55:00.000Z',
            completedAt: '2026-10-25T08:00:00.000Z',
            lastError: null,
          },
        },
      ]),
    };
    const service = new TrainingDataCoverageQueryService(
      activities as never,
      importJobs as never,
      integrations as never,
    );

    const result = await service.snapshot({
      userId: 'user-1',
      windowDays: 35,
      now: new Date('2026-10-26T08:00:00.000Z'),
    });

    expect(result.signals).toEqual({
      hasConnectedActivityImport: true,
      hasAutomaticActivityImport: true,
      hasRecentFileImport: true,
      syncInProgress: true,
      syncError: false,
      activityProcessingPending: true,
    });
    expect(result.availableActivityImportMethods).toEqual({
      fileUpload: {
        enabled: true,
        formats: ['FIT', 'TCX', 'GPX'],
      },
      providers: [
        {
          provider: 'intervals_icu',
          enabled: true,
          connected: true,
          connectionState: 'ACTIVE',
          activityImportState: 'AUTOMATIC_ENABLED',
        },
      ],
    });
    expect(result).not.toHaveProperty('isResting');
    expect(result.imports.activeBatchCount).toBe(1);
  });
});
