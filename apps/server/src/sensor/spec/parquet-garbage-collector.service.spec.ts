import { describe, expect, it, jest } from '@jest/globals';
import { StorageObjectGarbageCollectorService } from '../parquet-garbage-collector.service';
import { SensorFileQueryService } from '../sensor-file-query.service';
import { SensorFileRepository } from '../persistence/sensor-file.repository';
import { HealthFileQueryService } from '../../health-data/health-file-query.service';
import { HealthDataRepository } from '../../health-data/persistence/health-data.repository';

function createService(prisma: unknown, storage: unknown) {
  return new StorageObjectGarbageCollectorService(
    prisma as never,
    storage as never,
    new SensorFileQueryService(new SensorFileRepository(prisma as never)),
    new HealthFileQueryService(new HealthDataRepository(prisma as never)),
  );
}

describe('StorageObjectGarbageCollectorService', () => {
  it('按 bucket 与 object key 去重写入延迟回收清单', async () => {
    const upsert = jest.fn(async () => ({}));
    const service = createService(
      { storageObjectGarbage: { upsert } } as never,
      {} as never,
    );

    await service.enqueueObjects(
      [
        { activityId: 42, objectKey: 'records.parquet' },
        { activityId: 42, objectKey: 'records.parquet', bucket: 'default' },
        { activityId: 42, objectKey: 'maps/light.png', bucket: 'public' },
        { activityId: 42, objectKey: '  ', bucket: 'public' },
      ],
      'activity_hard_deleted',
      0,
    );

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          bucket_objectKey: {
            bucket: 'default',
            objectKey: 'records.parquet',
          },
        },
        create: expect.objectContaining({
          activityId: 42,
          reason: 'activity_hard_deleted',
        }),
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          bucket_objectKey: {
            bucket: 'public',
            objectKey: 'maps/light.png',
          },
        },
      }),
    );
  });

  it('删除未引用对象，并仅移除仍被引用对象的退休清单', async () => {
    const prisma = {
      $queryRaw: jest.fn(async () => [
        {
          id: 'garbage-orphan',
          objectKey: 'orphan.parquet',
          bucket: 'default',
          attempts: 0,
        },
        {
          id: 'garbage-live',
          objectKey: 'live.parquet',
          bucket: 'default',
          attempts: 0,
        },
      ]),
      activityParquetFile: {
        findFirst: jest
          .fn<(...args: unknown[]) => Promise<unknown>>()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'live-manifest' }),
      },
      healthSeriesFile: { findFirst: jest.fn(async () => null) },
      activityMapThumbJob: { findFirst: jest.fn(async () => null) },
      storageObjectGarbage: {
        delete: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
      },
    };
    const storage = { deleteFile: jest.fn(async () => undefined) };
    const service = createService(
      prisma as never,
      storage as never,
    );

    await expect(service.runOnce()).resolves.toEqual({
      claimed: 2,
      deleted: 1,
      referenced: 1,
      failed: 0,
    });
    expect(storage.deleteFile).toHaveBeenCalledTimes(1);
    expect(storage.deleteFile).toHaveBeenCalledWith(
      'orphan.parquet',
      undefined,
    );
    expect(prisma.storageObjectGarbage.delete).toHaveBeenCalledTimes(2);
  });

  it('删除失败时释放租约并按次数退避重试', async () => {
    const prisma = {
      $queryRaw: jest.fn(async () => [
        {
          id: 'garbage-1',
          objectKey: 'orphan.parquet',
          bucket: 'default',
          attempts: 2,
        },
      ]),
      activityParquetFile: { findFirst: jest.fn(async () => null) },
      healthSeriesFile: { findFirst: jest.fn(async () => null) },
      activityMapThumbJob: { findFirst: jest.fn(async () => null) },
      storageObjectGarbage: {
        delete: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
      },
    };
    const storage = {
      deleteFile: jest.fn(async () => {
        throw new Error('storage unavailable');
      }),
    };
    const service = createService(
      prisma as never,
      storage as never,
    );

    await expect(service.runOnce()).resolves.toEqual({
      claimed: 1,
      deleted: 0,
      referenced: 0,
      failed: 1,
    });
    expect(prisma.storageObjectGarbage.update).toHaveBeenCalledWith({
      where: { id: 'garbage-1' },
      data: expect.objectContaining({
        attempts: 3,
        lockedAt: null,
        lastError: 'storage unavailable',
        availableAt: expect.any(Date),
      }),
    });
  });

  it('引用检查按 bucket 隔离，不把同名但不同 bucket 的对象当成在线引用', async () => {
    const prisma = {
      $queryRaw: jest.fn(async () => [
        {
          id: 'public-garbage',
          objectKey: 'shared-name',
          bucket: 'public',
          attempts: 0,
        },
      ]),
      activityParquetFile: {
        findFirst: jest.fn(async () => ({ id: 'same-key-in-default' })),
      },
      healthSeriesFile: {
        findFirst: jest.fn(async () => ({ id: 'same-key-in-health' })),
      },
      activityMapThumbJob: { findFirst: jest.fn(async () => null) },
      storageObjectGarbage: {
        delete: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
      },
    };
    const storage = { deleteFile: jest.fn(async () => undefined) };
    const service = createService(
      prisma as never,
      storage as never,
    );

    await expect(service.runOnce()).resolves.toEqual({
      claimed: 1,
      deleted: 1,
      referenced: 0,
      failed: 0,
    });
    expect(prisma.activityParquetFile.findFirst).not.toHaveBeenCalled();
    expect(prisma.healthSeriesFile.findFirst).not.toHaveBeenCalled();
    expect(storage.deleteFile).toHaveBeenCalledWith('shared-name', 'public');
  });

  it('不会删除仍被 HealthSeriesFile 引用的对象', async () => {
    const prisma = {
      $queryRaw: jest.fn(async () => [
        {
          id: 'health-garbage',
          objectKey: 'health/live.parquet',
          bucket: 'default',
          attempts: 0,
        },
      ]),
      activityParquetFile: { findFirst: jest.fn(async () => null) },
      healthSeriesFile: {
        findFirst: jest.fn(async () => ({ id: 'health-series-1' })),
      },
      activityMapThumbJob: { findFirst: jest.fn(async () => null) },
      storageObjectGarbage: {
        delete: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
      },
    };
    const storage = { deleteFile: jest.fn(async () => undefined) };
    const service = createService(
      prisma as never,
      storage as never,
    );

    await expect(service.runOnce()).resolves.toEqual({
      claimed: 1,
      deleted: 0,
      referenced: 1,
      failed: 0,
    });
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('以固定并发上限处理回收对象', async () => {
    const rows = Array.from({ length: 9 }, (_, index) => ({
      id: `garbage-${index}`,
      objectKey: `orphan-${index}.parquet`,
      bucket: 'default',
      attempts: 0,
    }));
    const prisma = {
      $queryRaw: jest.fn(async () => rows),
      activityParquetFile: { findFirst: jest.fn(async () => null) },
      healthSeriesFile: { findFirst: jest.fn(async () => null) },
      activityMapThumbJob: { findFirst: jest.fn(async () => null) },
      storageObjectGarbage: {
        delete: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
      },
    };
    let active = 0;
    let peak = 0;
    const storage = {
      deleteFile: jest.fn(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      }),
    };
    const service = createService(
      prisma as never,
      storage as never,
    );

    await expect(service.runOnce()).resolves.toEqual({
      claimed: 9,
      deleted: 9,
      referenced: 0,
      failed: 0,
    });
    expect(peak).toBe(4);
  });
});
