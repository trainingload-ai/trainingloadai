import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SensorDataService } from '../sensor-data.service';

// Exercise the real DuckDB query, including segmentation before downsampling.
// Mocking executeQuery here would miss SQL failures and endpoint loss.
describe('timeline track reads', () => {
  let service: SensorDataService;
  let directory: string;
  let internal: {
    executeQuery(sql: string): Promise<unknown[][]>;
    getActivityParquetInfo: unknown;
    ensureLocalParquetFiles: unknown;
  };
  const start = Date.parse('2026-11-10T07:00:00Z');
  beforeEach(async () => {
    service = new SensorDataService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    Object.assign(service, {
      logger: { log: jest.fn(), debug: jest.fn(), error: jest.fn() },
    });
    internal = service as unknown as typeof internal;
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'timeline-track-'));
    const file = path.join(directory, 'records.parquet');
    internal.getActivityParquetInfo = jest.fn(async () => ({
      parquetPath: 'fixture.parquet',
    }));
    internal.ensureLocalParquetFiles = jest.fn(async () => [file]);
  });
  afterEach(async () => {
    await service.onModuleDestroy();
    await fs.rm(directory, { recursive: true, force: true });
  });
  async function write(select: string) {
    const file = path.join(directory, 'records.parquet').replaceAll("'", "''");
    await internal.executeQuery(
      `COPY (${select}) TO '${file}' (FORMAT PARQUET)`,
    );
  }
  it('retains coordinate precision, segment endpoints and both ends of a long activity', async () => {
    await write(`SELECT epoch_ms(${start} + i * 1000) AS timestamp,
      31.1234567 AS positionLat, 121.1234567 + i * 0.000001 AS positionLong,
      FLOOR(i / 10000) AS lapIndex FROM range(50000) AS r(i)`);
    const result = await service.getActivityTimelineTrack(7);
    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('Expected track');
    expect(result.segments).toHaveLength(5);
    const points = result.segments.flat();
    expect(points.length).toBeLessThanOrEqual(6000);
    expect(points[0]).toEqual([start, 121.1234567, 31.1234567]);
    expect(points.at(-1)?.[0]).toBe(start + 49999 * 1000);
    expect(result.segments[1][0][0]).toBe(start + 10000 * 1000);
  });
  it('splits at missing GPS rows and long timestamp gaps', async () => {
    await write(`SELECT epoch_ms(${start} + i * 1000 + CASE WHEN i >= 4 THEN 60000 ELSE 0 END) AS timestamp,
      CASE WHEN i = 2 THEN NULL ELSE 31.1 END AS positionLat,
      121.2 AS positionLong FROM range(7) AS r(i)`);
    const result = await service.getActivityTimelineTrack(7);
    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('Expected track');
    expect(result.segments.map((segment) => segment.length)).toEqual([2, 1, 3]);
  });
  it('handles legacy Parquet files without GPS columns', async () => {
    await write(`SELECT epoch_ms(${start}) AS timestamp, 120 AS heartRate`);
    await expect(service.getActivityTimelineTrack(7)).resolves.toEqual({
      status: 'unavailable',
      reason: 'NO_TRACK',
    });
  });
  it('reports fragmentation rather than returning an incomplete activity', async () => {
    await write(`SELECT epoch_ms(${start} + i * 1000) AS timestamp,
      31.1 AS positionLat, 121.2 AS positionLong, i AS lapIndex FROM range(6001) AS r(i)`);
    await expect(service.getActivityTimelineTrack(7)).resolves.toEqual({
      status: 'unavailable',
      reason: 'TOO_FRAGMENTED',
    });
  });
});
