import { describe, it, expect, jest } from '@jest/globals';
import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { SensorDataService } from '@/sensor/sensor-data.service';
describe('fitness raw Parquet evidence', () => {
  it('reads true timestamps, missing HR and zero measured power without falling back to calculated power', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fitness-parquet-'));
    const file = join(directory, 'record.parquet');
    const db = await DuckDBInstance.create(':memory:');
    const connection = await db.connect();
    try {
      await connection.run(
        `COPY (SELECT * FROM (VALUES (TIMESTAMP '2026-09-25 00:00:00.123',170.5,0,999),(TIMESTAMP '2026-09-25 00:00:01.456',NULL,200,999)) AS t(timestamp,heartRate,power,calculatedPower)) TO '${file.replace(/'/g, "''")}' (FORMAT PARQUET)`,
      );
      const service = Object.assign(
        Object.create(SensorDataService.prototype),
        {
          connection,
          logger: { error: jest.fn() },
          getActivityParquetInfo: async () => ({ parquetPath: file }),
          ensureLocalParquetFiles: async () => [file],
        },
      ) as SensorDataService;
      const samples = await service.getFitnessRecordSeries(1);
      expect(samples).toEqual([
        {
          epochSeconds: Date.parse('2026-09-25T00:00:00.123Z') / 1000,
          heartRate: 170.5,
          power: 0,
        },
        {
          epochSeconds: Date.parse('2026-09-25T00:00:01.456Z') / 1000,
          heartRate: null,
          power: 200,
        },
      ]);
      await expect(service.getFitnessRecordSeries(1, 1)).rejects.toThrow(
        'FITNESS_RESOURCE_LIMIT',
      );
    } finally {
      connection.disconnectSync();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
