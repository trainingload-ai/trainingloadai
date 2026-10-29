import { describe, expect, it, jest } from '@jest/globals';
import * as crypto from 'crypto';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SensorDataService } from '../sensor-data.service';
import { SensorFileQueryService } from '../sensor-file-query.service';
import { SensorFileRepository } from '../persistence/sensor-file.repository';

type SensorDataInternals = {
  buildRecordSeriesSQL(
    path: string,
    columns: string[],
    extra: unknown,
    present: Set<string>,
  ): string;
  ensureLocalParquetFiles(keys: string[]): Promise<unknown>;
};

function createService() {
  const prisma = {
    activityParquetFile: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({ id: 'parquet-1' })),
    },
    storageObjectGarbage: {
      upsert: jest.fn(async () => ({ id: 'garbage-1' })),
    },
    $transaction: jest.fn(async (run: (tx: unknown) => Promise<unknown>) =>
      run(prisma),
    ),
  };
  const storageService = {
    uploadFile: jest.fn(async () => ({ fileKey: 'staging/record.parquet' })),
    getFileWithKey: jest.fn(async () => undefined as Buffer | undefined),
  };
  const service = Object.create(SensorDataService.prototype) as Record<
    string,
    unknown
  >;
  service.prisma = prisma;
  service.storageService = storageService;
  service.configService = { get: jest.fn(() => 'R2') };
  service.sensorFiles = new SensorFileQueryService(
    new SensorFileRepository(prisma as never),
  );
  service.logger = { log: jest.fn(), debug: jest.fn(), error: jest.fn() };
  service.localParquetFilePromises = new Map();
  service.convertRecordToParquet = jest.fn(async () => Buffer.from('parquet'));
  return {
    service: service as unknown as SensorDataService,
    prisma,
    storageService,
  };
}

function createServiceWithoutStorageOverride() {
  const fixture = createService();
  const internal = fixture.service as unknown as Record<string, unknown>;
  internal.configService = { get: jest.fn(() => undefined) };
  return fixture;
}

describe('SensorDataService canonical Parquet staging', () => {
  it('initializes DuckDB lazily before executing a query', async () => {
    const { service } = createService();
    const internal = service as unknown as Record<string, unknown>;
    const getRows = jest.fn(async () => [[1]]);
    const run = jest.fn(async () => ({ getRows }));
    const ensureDuckDBInitialized = jest.fn(async () => {
      internal.connection = { run };
    });
    internal.ensureDuckDBInitialized = ensureDuckDBInitialized;

    const executeQuery = internal.executeQuery as (
      sql: string,
    ) => Promise<unknown[][]>;

    await expect(executeQuery.call(service, 'SELECT 1')).resolves.toEqual([
      [1],
    ]);
    expect(ensureDuckDBInitialized).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('SELECT 1');
  });

  it('records LOCAL metadata when no storage strategy is configured', async () => {
    const { service } = createServiceWithoutStorageOverride();

    await expect(
      service.stageSensorData({ id: 42, hashId: 'hash-42' } as never, [
        { activityId: 42, timestamp: new Date() } as never,
      ]),
    ).resolves.toMatchObject({ storageStrategy: 'LOCAL' });
  });

  it('reads a legacy Parquet without calculatedPower as a nullable column', () => {
    const { service } = createService();
    const sql = (
      service as unknown as SensorDataInternals
    ).buildRecordSeriesSQL(
      '/tmp/legacy-record.parquet',
      ['power', 'calculatedPower'],
      undefined,
      new Set(['timestamp', 'distance', 'power']),
    );

    expect(sql).toContain('"power" AS "power"');
    expect(sql).toContain('NULL AS "calculatedPower"');
    expect(sql).toContain('WHERE "power" IS NOT NULL');
    expect(sql).not.toContain('"calculatedPower" IS NOT NULL');
  });

  it('bounds chart reads in SQL without changing legacy unlimited reads', async () => {
    const { service } = createService();
    const internal = service as unknown as Record<string, unknown>;
    internal.getActivityParquetInfo = jest.fn(async () => ({
      parquetPath: 'record.parquet',
    }));
    internal.ensureLocalParquetFiles = jest.fn(async () => [
      '/tmp/record.parquet',
    ]);
    internal.getParquetColumns = jest.fn(
      async () => new Set(['timestamp', 'heartRate']),
    );
    const execute = jest.fn(async (_sql: string, _params: unknown[]) => []);
    internal.executeQuery = execute;
    await service.getRecordSeriesMulti(7, ['heartRate'], undefined, 120001);
    expect(execute.mock.calls[0][0]).toMatch(/ORDER BY[\s\S]+LIMIT 120001$/);
    await service.getRecordSeriesMulti(7, ['heartRate']);
    expect(execute.mock.calls[1][0]).not.toContain('LIMIT');
    await expect(
      service.getRecordSeriesMulti(7, ['heartRate'], undefined, 1.5),
    ).rejects.toThrow('Invalid sensor series row limit');
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('loads multiple activity manifests with one query and preserves input order', async () => {
    const { service, prisma } = createService();
    prisma.activityParquetFile.findMany.mockResolvedValueOnce([
      { activityId: 7, parquetPath: '7.parquet', pointCount: 70 },
      { activityId: 3, parquetPath: '3.parquet', pointCount: 30 },
    ] as never);

    await expect(
      service.getActivitiesParquetInfo([3, 9, 7, 3]),
    ).resolves.toEqual([
      { activityId: 3, parquetPath: '3.parquet', pointCount: 30 },
      { activityId: 7, parquetPath: '7.parquet', pointCount: 70 },
      { activityId: 3, parquetPath: '3.parquet', pointCount: 30 },
    ]);
    expect(prisma.activityParquetFile.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.activityParquetFile.findMany).toHaveBeenCalledWith({
      where: { activityId: { in: [3, 9, 7] }, type: 'record' },
      select: {
        activityId: true,
        parquetPath: true,
        pointCount: true,
      },
    });
  });

  it('uploads staged record data without changing the live DB pointer', async () => {
    const { service, prisma, storageService } = createService();

    const staged = await service.stageSensorData(
      { id: 42, hashId: 'hash-42' } as never,
      [{ activityId: 42, timestamp: new Date() } as never],
    );

    expect(staged).toMatchObject({
      activityId: 42,
      type: 'record',
      parquetPath: 'staging/record.parquet',
      pointCount: 1,
      storageStrategy: 'R2',
    });
    expect(storageService.uploadFile).toHaveBeenCalledTimes(1);
    expect(prisma.activityParquetFile.upsert).not.toHaveBeenCalled();
  });

  it('keeps the legacy store method atomic at the manifest level', async () => {
    const { service, prisma } = createService();

    await service.storeSensorData({ id: 42, hashId: 'hash-42' } as never, [
      { activityId: 42, timestamp: new Date() } as never,
    ]);

    expect(prisma.activityParquetFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activityId_type: { activityId: 42, type: 'record' } },
        update: expect.objectContaining({
          parquetPath: 'staging/record.parquet',
          pointCount: 1,
        }),
      }),
    );
  });

  it('retires the previous manifest path in the same transaction', async () => {
    const { service, prisma } = createService();
    prisma.activityParquetFile.findUnique.mockResolvedValueOnce({
      parquetPath: 'old/record.parquet',
    } as never);

    await service.storeSensorData({ id: 42, hashId: 'hash-42' } as never, [
      { activityId: 42, timestamp: new Date() } as never,
    ]);

    expect(prisma.storageObjectGarbage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          bucket_objectKey: {
            bucket: 'default',
            objectKey: 'old/record.parquet',
          },
        },
        create: expect.objectContaining({ reason: 'manifest_replaced' }),
      }),
    );
  });
});

describe('SensorDataService activity midpoint track record', () => {
  function midpointService(rows: unknown[][]) {
    const { service } = createService();
    const internals = service as unknown as Record<string, unknown>;
    internals.ensureDuckDBInitialized = jest.fn(async () => undefined);
    internals.getActivityParquetInfo = jest.fn(async () => ({
      activityId: 42,
      parquetPath: 'activity/42/record.parquet',
      pointCount: 100,
    }));
    internals.ensureLocalParquetFiles = jest.fn(async () => [
      '/tmp/activity-42-record.parquet',
    ]);
    const executeQuery = jest
      .fn<(sql: string) => Promise<unknown[][]>>()
      .mockResolvedValueOnce(rows[0] as unknown[][])
      .mockResolvedValueOnce(rows[1] as unknown[][]);
    internals.executeQuery = executeQuery;
    return { service, executeQuery };
  }

  it('uses the real one-hour timeline midpoint and resolves equal distance earlier', async () => {
    const start = Date.parse('2026-08-15T06:00:00.000Z');
    const end = Date.parse('2026-08-15T07:00:00.000Z');
    const { service, executeQuery } = midpointService([
      [[start, end]],
      [[start + 30 * 60_000, 31.23, 121.474]],
    ]);

    await expect(service.getActivityMidpointTrackRecord(42)).resolves.toEqual({
      status: 'available',
      recordedAt: new Date(start + 30 * 60_000),
      latitude: 31.23,
      longitude: 121.474,
      trackStartAt: new Date(start),
      trackEndAt: new Date(end),
      deltaMs: 0,
    });
    const nearestSql = executeQuery.mock.calls[1]?.[0] ?? '';
    expect(nearestSql).toContain('ORDER BY');
    expect(nearestSql).toContain('try_cast(timestamp AS TIMESTAMP) ASC');
  });

  it('does not fall back to a start point outside the midpoint tolerance', async () => {
    const start = Date.parse('2026-08-15T06:00:00.000Z');
    const end = Date.parse('2026-08-15T07:00:00.000Z');
    const { service } = midpointService([
      [[start, end]],
      [[start, 31.23, 121.474]],
    ]);

    await expect(service.getActivityMidpointTrackRecord(42)).resolves.toEqual({
      status: 'unavailable',
      reason: 'MISSING_MIDPOINT_LOCATION',
    });
  });
});

describe('SensorDataService local Parquet cache', () => {
  const parquetBuffer = Buffer.concat([
    Buffer.from('PAR1'),
    Buffer.alloc(8),
    Buffer.from('PAR1'),
  ]);

  function cachePathForKey(key: string): string {
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const safeName = path
      .basename(key)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-160);
    return path.join(os.tmpdir(), 'parquet-cache', `${keyHash}-${safeName}`);
  }

  it('repairs an existing zero-byte cache file before returning it', async () => {
    const { service, storageService } = createService();
    const key = `test/${crypto.randomUUID()}.parquet`;
    const cachePath = cachePathForKey(key);
    await fsp.mkdir(path.dirname(cachePath), { recursive: true });
    await fsp.writeFile(cachePath, Buffer.alloc(0));
    storageService.getFileWithKey.mockResolvedValueOnce(parquetBuffer);

    try {
      await expect(
        (service as unknown as SensorDataInternals).ensureLocalParquetFiles([
          key,
        ]),
      ).resolves.toEqual([cachePath]);
      await expect(fsp.readFile(cachePath)).resolves.toEqual(parquetBuffer);
      expect(storageService.getFileWithKey).toHaveBeenCalledTimes(1);
    } finally {
      await fsp.unlink(cachePath).catch(() => undefined);
    }
  });

  it('coalesces concurrent downloads of the same object', async () => {
    const { service, storageService } = createService();
    const key = `test/${crypto.randomUUID()}.parquet`;
    const cachePath = cachePathForKey(key);
    let finishDownload!: (buffer: Buffer) => void;
    let markDownloadStarted!: () => void;
    const downloadStarted = new Promise<void>((resolve) => {
      markDownloadStarted = resolve;
    });
    storageService.getFileWithKey.mockImplementationOnce(
      () =>
        new Promise<Buffer>((resolve) => {
          finishDownload = resolve;
          markDownloadStarted();
        }),
    );

    try {
      const first = (
        service as unknown as SensorDataInternals
      ).ensureLocalParquetFiles([key]);
      const second = (
        service as unknown as SensorDataInternals
      ).ensureLocalParquetFiles([key]);
      await downloadStarted;

      expect(storageService.getFileWithKey).toHaveBeenCalledTimes(1);
      finishDownload(parquetBuffer);
      await expect(Promise.all([first, second])).resolves.toEqual([
        [cachePath],
        [cachePath],
      ]);
    } finally {
      await fsp.unlink(cachePath).catch(() => undefined);
    }
  });

  it('does not publish an invalid downloaded object', async () => {
    const { service, storageService } = createService();
    const key = `test/${crypto.randomUUID()}.parquet`;
    const cachePath = cachePathForKey(key);
    storageService.getFileWithKey.mockResolvedValueOnce(Buffer.alloc(0));

    await expect(
      (service as unknown as SensorDataInternals).ensureLocalParquetFiles([
        key,
      ]),
    ).rejects.toThrow('Downloaded object is not a valid Parquet file');
    await expect(fsp.stat(cachePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
