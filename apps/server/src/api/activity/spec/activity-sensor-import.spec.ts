import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import type { Activity } from '@prisma/client';
import type { CanonicalActivityPayload } from '@/importing/canonical-activity.types';
import type { SensorRecord } from '@/sensor/sensor-data.service';
import { ActivityService } from '../activity.service';

describe('Activity sensor import', () => {
  it('keeps coasting zero power and cadence distinct from missing readings before Parquet storage', async () => {
    const stageSensorData = jest.fn(
      async (_activity: Activity, _records: SensorRecord[]) => ({
        type: 'record',
        parquetPath: 'staged/test.parquet',
      }),
    );
    const service = Object.assign(
      Object.create(ActivityService.prototype) as ActivityService,
      {
        logger: new Logger('ActivitySensorImportTest'),
        userService: { getComposedUserProfile: jest.fn(async () => ({})) },
        sensorDataService: { stageSensorData },
      },
    );
    const start = new Date('2026-11-03T00:00:00Z');
    const payload = {
      source: { kind: 'FILE', sourceUid: 'test.fit' },
      identity: {
        sourceUid: 'test.fit',
        dedupeKey: 'test',
        datasetChecksum: 'test',
      },
      summary: {
        sportType: 'CYCLING',
        startTime: start.toISOString(),
        elapsedTime: 3,
      },
      laps: [],
      lengths: [],
      records: [
        { power: 180, cadence: 90 },
        { power: 0, cadence: 0 },
        {},
        { power: 200, cadence: 85 },
      ].map((reading, index) => ({
        timestamp: new Date(+start + index * 1000).toISOString(),
        distance: 0,
        speed: 0,
        temperature: 0,
        ...reading,
      })),
    } as CanonicalActivityPayload;

    await service.stageParquetFilesByCanonicalPayload(
      {
        id: 42,
        userId: 'user-1',
        sportType: 'CYCLING',
        sportDefinitionCode: 'INDOOR_CYCLING',
        startTime: start,
      } as Activity,
      payload,
    );

    const records = stageSensorData.mock.calls[0][1];
    expect(records.map((record) => record.power)).toEqual([
      180,
      0,
      undefined,
      200,
    ]);
    expect(records.map((record) => record.cadence)).toEqual([
      90,
      0,
      undefined,
      85,
    ]);
    expect(records.map((record) => record.temperature)).toEqual([0, 0, 0, 0]);
  });
});
