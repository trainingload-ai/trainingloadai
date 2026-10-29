import { describe, expect, it, jest } from '@jest/globals';
import {
  RemoteActivityFileService,
  type DownloadedActivityFile,
} from '../remote-activity-file.service';
import { ImportingJobService } from '../importing-job.service';
import { ImportingJobRepository } from '../persistence/importing-job.repository';

describe('RemoteActivityFileService', () => {
  it('reuses a persisted source file without downloading it again', async () => {
    const download = jest.fn<() => Promise<DownloadedActivityFile>>();
    const service = new RemoteActivityFileService(
      {} as never,
      {
        getFileWithKey: jest
          .fn<() => Promise<Buffer>>()
          .mockResolvedValue(Buffer.from('fit')),
      } as never,
      new ImportingJobService(new ImportingJobRepository({} as never)),
    );
    const result = await service.resolve({
      sourceObject: {
        id: 'source-1',
        fileKey: 'stored.fit',
        fileName: 'a.fit',
      },
      fallbackFileName: 'fallback.fit',
      download,
    });
    expect(result.fileKey).toBe('stored.fit');
    expect(download).not.toHaveBeenCalled();
  });

  it('stores a downloaded file and records its evidence', async () => {
    const update = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({});
    const uploadFile = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({ fileKey: 'new.fit' });
    const prisma = { importSourceObject: { update } };
    const service = new RemoteActivityFileService(
      prisma as never,
      { getFileWithKey: jest.fn(), uploadFile } as never,
      new ImportingJobService(new ImportingJobRepository(prisma as never)),
    );
    const result = await service.resolve({
      sourceObject: { id: 'source-1' },
      fallbackFileName: 'fallback.fit',
      metadata: { connectionId: 'connection-1' },
      download: async () => ({
        buffer: Buffer.from('downloaded-fit'),
        fileName: 'activity.fit',
        endpoint: '/workouts/1/fit',
      }),
    });
    expect(result.fileKey).toBe('new.fit');
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'source-1' } }),
    );
  });

  it('does not invoke the remote downloader when third-party sync is disabled', async () => {
    const download = jest.fn<() => Promise<DownloadedActivityFile>>();
    const service = new RemoteActivityFileService(
      {} as never,
      { getFileWithKey: jest.fn(async () => undefined) } as never,
      new ImportingJobService(new ImportingJobRepository({} as never)),
      {
        require: jest.fn(() => {
          throw new Error('CAPABILITY_DISABLED');
        }),
      } as never,
    );

    await expect(
      service.resolve({
        sourceObject: { id: 'source-1' },
        fallbackFileName: 'fallback.fit',
        download,
      }),
    ).rejects.toThrow('CAPABILITY_DISABLED');
    expect(download).not.toHaveBeenCalled();
  });

  it('can require the narrower Intervals.icu API-key capability', async () => {
    const requireCapability = jest.fn(() => {
      throw new Error('CAPABILITY_DISABLED');
    });
    const service = new RemoteActivityFileService(
      {} as never,
      { getFileWithKey: jest.fn(async () => undefined) } as never,
      new ImportingJobService(new ImportingJobRepository({} as never)),
      { require: requireCapability } as never,
    );

    await expect(
      service.resolve({
        sourceObject: { id: 'source-1' },
        fallbackFileName: 'fallback.fit',
        capability: 'intervals-icu-api-key',
        download: jest.fn<() => Promise<DownloadedActivityFile>>(),
      }),
    ).rejects.toThrow('CAPABILITY_DISABLED');
    expect(requireCapability).toHaveBeenCalledWith('intervals-icu-api-key');
  });
});
