import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SensorDataService } from '../sensor-data.service';

describe('sensor Parquet vector writer with real DuckDB', () => {
  let service: SensorDataService;
  let internal: {
    convertRecordToParquet(rows: unknown[]): Promise<Buffer>;
    convertLengthToParquet(rows: unknown[]): Promise<Buffer>;
    executeQuery(sql: string): Promise<unknown[][]>;
  };
  let directory: string;
  const start = Date.parse('2024-01-02T03:04:05.123Z');

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
    directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sensor-parquet-roundtrip-'),
    );
  });
  afterEach(async () => {
    await service.onModuleDestroy();
    await fs.rm(directory, { recursive: true, force: true });
  });
  async function table(buffer: Buffer, filename = 'records.parquet') {
    const file = path.join(directory, filename);
    await fs.writeFile(file, buffer);
    return `read_parquet('${file.replaceAll("'", "''")}')`;
  }

  it('preserves timestamp precision, zero, null and row order across vector boundaries', async () => {
    const rows = Array.from({ length: 4500 }, (_, index) => ({
      activityId: 7,
      hashId: 'roundtrip',
      index,
      timestamp:
        index % 3 === 0
          ? new Date(start + index * 1000)
          : index % 3 === 1
            ? new Date(start + index * 1000).toISOString()
            : BigInt(start + index * 1000),
      power: index % 2 === 0 ? 0 : 123.12345678,
      cadence: 0,
      heartRate: index === 0 ? null : 150,
      description: "训练 'test' \\ 测试",
      positionLat: 31.12345678,
      depth: Number.NaN,
    }));
    const source = await table(await internal.convertRecordToParquet(rows));
    const schema = await internal.executeQuery(
      `DESCRIBE SELECT * FROM ${source}`,
    );
    expect(schema).toHaveLength(103);
    const result =
      await internal.executeQuery(`SELECT COUNT(*), COUNT(*) FILTER (WHERE power=0),
      COUNT(*) FILTER (WHERE cadence=0), COUNT(*) FILTER (WHERE depth IS NULL),
      MIN(epoch_ms(timestamp)), MAX(epoch_ms(timestamp)) FROM ${source}`);
    expect(result[0].map(Number)).toEqual([
      4500,
      2250,
      4500,
      4500,
      start,
      start + 4499 * 1000,
    ]);
    const boundary = await internal.executeQuery(
      `SELECT index,power,description FROM ${source} WHERE index IN (2047,2048,4095,4096) ORDER BY index`,
    );
    expect(boundary).toEqual(
      [2047, 2048, 4095, 4096].map((index) => [
        index,
        index % 2 ? 123.123457 : 0,
        "训练 'test' \\ 测试",
      ]),
    );
  });

  it('retains all swim-length columns and optional timestamp semantics', async () => {
    const rows = Array.from({ length: 2500 }, (_, index) => ({
      activityId: 8,
      hashId: 'swim',
      index,
      messageIndex: index,
      timestamp: new Date(start + index * 1000),
      startTime: index ? new Date(start) : null,
      event: 'length',
      eventType: 'stop',
      eventGroup: '7',
      lengthType: 'active',
      swimStroke: 'freestyle',
      totalElapsedTime: 0,
      totalTimerTime: 1.12345678,
      totalStrokes: 0,
      enHancedMaxRespirationRate: 27,
      enhancedAvgRespirationRate: 20,
    }));
    const source = await table(
      await internal.convertLengthToParquet(rows),
      'lengths.parquet',
    );
    expect(
      await internal.executeQuery(`DESCRIBE SELECT * FROM ${source}`),
    ).toHaveLength(25);
    const result =
      await internal.executeQuery(`SELECT COUNT(*),MIN(totalElapsedTime),MAX(totalTimerTime),
      COUNT(*) FILTER (WHERE startTime IS NULL),MIN(eventGroup),MAX(enHancedMaxRespirationRate) FROM ${source}`);
    expect(result[0]).toEqual([2500n, 0, 1.123457, 1n, '7', 27]);
  });

  it('isolates concurrent file writers and recovers after an invalid timestamp', async () => {
    await expect(
      internal.convertRecordToParquet([
        { activityId: 9, timestamp: 'invalid' },
      ]),
    ).rejects.toThrow();
    const [left, right] = await Promise.all([
      internal.convertRecordToParquet([
        { activityId: 11, timestamp: new Date(start), power: 0 },
      ]),
      internal.convertRecordToParquet([
        { activityId: 12, timestamp: new Date(start), power: 99 },
      ]),
    ]);
    const l = await table(left, 'left.parquet'),
      r = await table(right, 'right.parquet');
    expect(
      await internal.executeQuery(`SELECT activityId,power FROM ${l}`),
    ).toEqual([[11, 0]]);
    expect(
      await internal.executeQuery(`SELECT activityId,power FROM ${r}`),
    ).toEqual([[12, 99]]);
  });
});
