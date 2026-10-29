import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/sync/third-party-activity-export.service', () => ({
  thirdPartyExportExtensionOf: (fileName: string) =>
    fileName.split('.').pop() ?? '',
  uniquePositiveActivityIds: (values: number[]) =>
    Array.from(
      new Set(
        values
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
          .map((value) => Math.floor(value)),
      ),
    ),
}));

import { IntervalsIcuExportService } from '../intervals-icu-export.service';

describe('IntervalsIcuExportService', () => {
  function createService() {
    const externalProviderConnection = {
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const prisma = {
      externalProviderConnection,
    };
    const thirdPartyExport = {
      findExportCandidates: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      resolveExportFile: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      recordExportMapping: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const intervalsIcuClient = {
      uploadActivityFile: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const intervalsIcuCredentials = {
      resolveConnectionCredential: jest.fn(() => 'api-key'),
    };

    return {
      externalProviderConnection,
      intervalsIcuClient,
      intervalsIcuCredentials,
      prisma,
      service: new IntervalsIcuExportService(
        prisma as never,
        thirdPartyExport as never,
        intervalsIcuClient as never,
        intervalsIcuCredentials as never,
        { model: () => externalProviderConnection } as never,
      ),
      thirdPartyExport,
    };
  }

  it('uploads activities with local hashId as Intervals.icu external_id', async () => {
    const {
      externalProviderConnection,
      intervalsIcuClient,
      prisma,
      service,
      thirdPartyExport,
    } = createService();
    const activity = {
      id: 101,
      userId: 'user-1',
      hashId: 'activity-hash-101',
      activityName: 'Morning Run',
      description: 'Easy aerobic run',
      sportType: 'RUN',
      startTime: new Date('2026-07-02T06:00:00.000Z'),
      endTime: new Date('2026-07-02T07:00:00.000Z'),
      timezone: 'Asia/Shanghai',
    };

    externalProviderConnection.findUnique.mockResolvedValueOnce({
      id: 'connection-1',
      userId: 'user-1',
      provider: 'intervals_icu',
      status: 'ACTIVE',
      exportActivities: true,
      credentialCiphertext: 'cipher-key',
      metadata: {},
    });
    externalProviderConnection.update.mockResolvedValue({});
    thirdPartyExport.findExportCandidates.mockResolvedValueOnce([activity]);
    thirdPartyExport.resolveExportFile.mockResolvedValueOnce({
      buffer: Buffer.from('fit-bytes'),
      fileName: 'activity.fit',
      contentType: 'application/octet-stream',
      source: 'activity_file',
      metadata: {},
    });
    thirdPartyExport.recordExportMapping.mockResolvedValueOnce(undefined);
    intervalsIcuClient.uploadActivityFile.mockResolvedValueOnce({
      id: 'intervals-activity-9001',
    });

    await expect(
      service.exportBatchActivities({
        userId: 'user-1',
        activityIds: [101],
      }),
    ).resolves.toEqual({
      exportedCount: 1,
      failedCount: 0,
      skippedCount: 0,
      results: [
        {
          activityId: 101,
          status: 'EXPORTED',
          externalId: 'intervals-activity-9001',
        },
      ],
    });

    expect(intervalsIcuClient.uploadActivityFile).toHaveBeenCalledWith(
      'api-key',
      expect.objectContaining({
        fileName: 'activity.fit',
        name: 'Morning Run',
        description: 'Easy aerobic run',
        externalId: 'activity-hash-101',
      }),
    );
    expect(thirdPartyExport.recordExportMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        activity,
        provider: 'intervals_icu',
        externalId: 'intervals-activity-9001',
        requestedExternalId: 'activity-hash-101',
      }),
    );
    expect(prisma.externalProviderConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'connection-1' },
      }),
    );
  });

  it('returns a Chinese-log-friendly skip reason when export is disabled', async () => {
    const { externalProviderConnection, service } = createService();
    externalProviderConnection.findUnique.mockResolvedValueOnce({
      id: 'connection-1',
      userId: 'user-1',
      provider: 'intervals_icu',
      status: 'ACTIVE',
      exportActivities: false,
      credentialCiphertext: 'cipher-key',
      metadata: {},
    });

    await expect(
      service.exportBatchActivities({
        userId: 'user-1',
        activityIds: [101],
      }),
    ).resolves.toEqual({
      exportedCount: 0,
      failedCount: 0,
      skippedCount: 1,
      results: [
        {
          activityId: 101,
          status: 'SKIPPED',
          reason: 'export_disabled',
        },
      ],
    });
  });
});
