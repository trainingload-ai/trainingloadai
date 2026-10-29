import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { HealthSeriesStorageService } from '../health-series-storage.service';
import { HealthDataRepository } from '../persistence/health-data.repository';

describe('HealthSeriesStorageService', () => {
  let service: HealthSeriesStorageService | undefined;

  afterEach(async () => {
    await service?.onModuleDestroy();
    service = undefined;
  });

  it('writes parquet and applies point/interval-specific deduplication', async () => {
    let uploadedBuffer: Buffer | undefined;
    let uploadIndex = 0;
    const uploadedBuffers = new Map<string, Buffer>();
    const storage = {
      uploadFile: jest.fn(async (file: Express.Multer.File) => {
        uploadedBuffer = file.buffer;
        const fileKey = `health/test-${uploadIndex}.parquet`;
        uploadIndex += 1;
        uploadedBuffers.set(fileKey, file.buffer);
        return { fileKey };
      }),
      deleteFile: jest.fn(async () => undefined),
      getFileWithKey: jest.fn(async (fileKey: string) =>
        uploadedBuffers.get(fileKey),
      ),
    };
    const prisma = {
      healthSeriesFile: {
        findFirst: jest.fn(async () => ({
          id: 'series-1',
          parquetPath: 'health/old.parquet',
        })),
        create: jest.fn(
          async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'series-1',
            ...data,
          }),
        ),
        update: jest.fn(
          async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'series-1',
            ...data,
          }),
        ),
        findMany: jest.fn(async () => [
          {
            parquetPath: 'health/missing.parquet',
            valueType: 'POINT',
            pointCount: 1,
            validPointCount: 1,
          },
          {
            parquetPath: 'health/test-0.parquet',
            valueType: 'INTERVAL',
            pointCount: 3,
            validPointCount: 2,
          },
          {
            parquetPath: 'health/test-0.parquet',
            valueType: 'INTERVAL',
            pointCount: 3,
            validPointCount: 2,
          },
        ]),
      },
      $transaction: jest.fn(async (callback: (client: never) => unknown) =>
        callback(prisma as never),
      ),
    };
    const garbageCollector = { enqueueObjects: jest.fn(async () => undefined) };
    service = new HealthSeriesStorageService(
      prisma as never,
      storage as never,
      { get: () => 'LOCAL' } as never,
      garbageCollector as never,
      new HealthDataRepository(prisma as never),
    );

    const result = await service.storePartition({
      userId: 'user-1',
      snapshotId: 'snapshot-1',
      provider: 'GARMIN',
      sourceNamespace: 'garmin:china:export',
      metricCode: 'descent_m',
      valueType: 'INTERVAL',
      unit: 'm',
      localDate: new Date('2026-07-18T00:00:00.000Z'),
      offsetSeconds: 28_800,
      rows: [
        {
          timestampUtcMs: new Date('2026-07-18T01:00:00.000Z').valueOf(),
          endTimestampUtcMs: new Date('2026-07-18T01:01:00.000Z').valueOf(),
          offsetSeconds: 28_800,
          value: 2.864,
          status: 'valid',
          aggregation: 'sum',
          sourceMessage: 'monitoringMesgs',
          sourceIndex: 0,
        },
        {
          timestampUtcMs: new Date('2026-07-18T01:00:00.000Z').valueOf(),
          endTimestampUtcMs: new Date('2026-07-18T01:01:00.000Z').valueOf(),
          offsetSeconds: 28_800,
          value: 2.284,
          status: 'valid',
          aggregation: 'sum',
          sourceMessage: 'monitoringMesgs',
          sourceIndex: 1,
        },
        {
          timestampUtcMs: new Date('2026-07-18T01:05:00.000Z').valueOf(),
          offsetSeconds: 28_800,
          value: 65_535,
          status: 'invalid',
          aggregation: 'instant',
          sourceMessage: 'stressLevelMesgs',
          sourceIndex: 2,
        },
      ],
    });

    expect(uploadedBuffer?.subarray(0, 4).toString('ascii')).toBe('PAR1');
    expect(uploadedBuffer?.subarray(-4).toString('ascii')).toBe('PAR1');
    expect(result).toMatchObject({
      metricCode: 'descent_m',
      pointCount: 3,
      validPointCount: 2,
      minValue: 2.284,
      maxValue: 2.864,
      parquetPath: 'health/test-0.parquet',
    });
    expect(garbageCollector.enqueueObjects).toHaveBeenCalledWith(
      [{ objectKey: 'health/old.parquet' }],
      'health_series_manifest_replaced',
      60 * 60 * 1000,
      prisma,
    );

    await expect(
      service.readMetricRows({
        userId: 'user-1',
        metricCode: 'descent_m',
        localDates: [new Date('2026-07-18T00:00:00.000Z')],
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        value: 2.864,
        status: 'valid',
        sourceMessage: 'monitoringMesgs',
        sourceIndex: 0,
      }),
      expect.objectContaining({
        value: 2.284,
        status: 'valid',
        sourceMessage: 'monitoringMesgs',
        sourceIndex: 1,
      }),
    ]);

    await service.storePartition({
      userId: 'user-1',
      snapshotId: 'snapshot-2',
      provider: 'GARMIN',
      sourceNamespace: 'garmin:china:export',
      metricCode: 'spo2_percent',
      valueType: 'POINT',
      unit: 'percent',
      localDate: new Date('2026-07-18T00:00:00.000Z'),
      rows: [
        {
          timestampUtcMs: new Date('2026-07-18T02:00:00.000Z').valueOf(),
          value: 96,
          status: 'valid',
          sourceMessage: 'spo2DataMesgs',
          sourceIndex: 0,
        },
        {
          timestampUtcMs: new Date('2026-07-18T02:01:00.000Z').valueOf(),
          value: 240,
          status: 'invalid',
          sourceMessage: 'spo2DataMesgs',
          sourceIndex: 1,
        },
      ],
    });
    await service.storePartition({
      userId: 'user-1',
      snapshotId: 'snapshot-3',
      provider: 'GARMIN',
      sourceNamespace: 'garmin:china:export',
      metricCode: 'spo2_percent',
      valueType: 'POINT',
      unit: 'percent',
      localDate: new Date('2026-07-18T00:00:00.000Z'),
      rows: [
        {
          timestampUtcMs: new Date('2026-07-18T02:00:00.000Z').valueOf(),
          value: 98,
          status: 'valid',
          sourceMessage: 'spo2DataMesgs',
          sourceIndex: 0,
        },
      ],
    });
    prisma.healthSeriesFile.findMany.mockResolvedValue([
      {
        parquetPath: 'health/test-2.parquet',
        valueType: 'POINT',
        pointCount: 1,
        validPointCount: 1,
      },
      {
        parquetPath: 'health/test-1.parquet',
        valueType: 'POINT',
        pointCount: 2,
        validPointCount: 1,
      },
    ]);
    await expect(
      service.readMetricRows({
        userId: 'user-1',
        metricCode: 'spo2_percent',
        localDates: [new Date('2026-07-18T00:00:00.000Z')],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ value: 98, sourceIndex: 0 }),
    ]);

    expect(prisma.healthSeriesFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          snapshot: {
            manifest: { path: ['status'], equals: 'READY' },
          },
        }),
      }),
    );
  });
});
