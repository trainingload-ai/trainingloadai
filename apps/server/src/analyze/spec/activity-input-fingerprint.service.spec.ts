import { describe, expect, it, jest } from '@jest/globals';
import { ActivityInputFingerprintService } from '../activity-input-fingerprint.service';

function activityFact(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    startTime: new Date('2026-01-01T08:00:00.000Z'),
    endTime: new Date('2026-01-01T09:00:00.000Z'),
    timezone: 'Asia/Shanghai',
    sportType: 'CYCLING',
    sportDefinitionCode: 'road_cycling',
    subSport: null,
    timerTime: 3_600,
    elapsedTime: 3_620,
    distance: 30_000,
    ascent: 200,
    descent: 200,
    poolLength: null,
    poolLengthUnit: null,
    numLaps: 1,
    numLengths: null,
    numActiveLengths: null,
    sampleSec: 1,
    minPower: 80,
    maxPower: 600,
    avgPower: 210,
    avgCadence: 86,
    maxCadence: 110,
    avgHeartRate: 150,
    maxHeartRate: 181,
    minHeartRate: 80,
    maxSpeed: 15,
    avgSpeed: 8.3,
    cycles: 5_100,
    work: 756_000,
    strokes: null,
    calories: 700,
    sessionRpe: 5,
    eftp: 250,
    ecp: 263,
    ewPrime: 18_000,
    epmax: 900,
    parquetFiles: [
      {
        id: 1,
        type: 'RECORD',
        checksum: 'parquet-a',
        pointCount: 3_600,
        fileSize: 100_000,
        storageStrategy: 'OBJECT_STORAGE',
        parquetPath: 'records/a.parquet',
      },
    ],
    laps: [
      {
        id: 9,
        index: 0,
        sportType: 'CYCLING',
        startTime: new Date('2026-01-01T08:00:00.000Z'),
        endTime: new Date('2026-01-01T09:00:00.000Z'),
        timerTime: 3_600,
        elapsedTime: 3_620,
        distance: 30_000,
        ascent: 200,
        descent: 200,
        cycles: 5_100,
        work: 756_000,
        strokes: null,
        maxSpeed: 15,
        avgSpeed: 8.3,
        avgPower: 210,
        maxPower: 600,
        normalizedPower: 225,
        avgCadence: 86,
        maxCadence: 110,
        avgHeartRate: 150,
        maxHeartRate: 181,
        calories: 700,
        // 这些字段模拟 HEAVY 写回，指纹服务不应读取或纳入它们。
        intensityFactor: 0.9,
        tss: 90,
      },
    ],
    activitySources: [
      {
        id: 'source-a',
        sourceKind: 'FILE',
        provider: null,
        sourceUid: 'file:a',
        sourceChecksum: 'source-checksum-a',
        metadata: { device: 'Garmin' },
      },
    ],
    ...overrides,
  };
}

function serviceFor(rows: Array<Record<string, unknown>>) {
  const findUniqueOrThrow = jest.fn();
  for (const row of rows) findUniqueOrThrow.mockResolvedValueOnce(row);
  return {
    findUniqueOrThrow,
    service: new ActivityInputFingerprintService({
      activity: { findUniqueOrThrow },
    } as never),
  };
}

describe('ActivityInputFingerprintService', () => {
  it.each([true, false])(
    'does not invalidate when HEAVY initializes its sample interval cache (records=%s)',
    async (withRecords) => {
      const baseline = activityFact({ sampleSec: null });
      if (!withRecords) baseline.parquetFiles = [];
      const { service } = serviceFor([baseline, { ...baseline, sampleSec: 1 }]);
      expect(await service.resolve(42)).toEqual(await service.resolve(42));
    },
  );

  it('does not treat recomputed calories as raw input for summary-only activities', async () => {
    const baseline = activityFact({ parquetFiles: [], calories: 309 });
    const { service } = serviceFor([baseline, { ...baseline, calories: 345 }]);
    expect(await service.resolve(42)).toEqual(await service.resolve(42));
  });

  it('does not invalidate record facts when HEAVY writes summary caches', async () => {
    const { service } = serviceFor([
      activityFact(),
      activityFact({
        avgHeartRate: 149,
        maxHeartRate: 180,
        minHeartRate: 79,
        avgPower: 211.12,
        avgSpeed: 8.31,
        calories: 701,
      }),
    ]);
    expect(await service.resolve(42)).toEqual(await service.resolve(42));
  });

  it('still fingerprints summaries for activities without record facts', async () => {
    const { service } = serviceFor([
      activityFact({ parquetFiles: [] }),
      activityFact({ parquetFiles: [], avgHeartRate: 151 }),
    ]);
    expect((await service.resolve(42)).dimensions.HEART_RATE).not.toEqual(
      (await service.resolve(42)).dimensions.HEART_RATE,
    );
  });

  it('invalidates only LOAD when session RPE changes', async () => {
    const { service } = serviceFor([
      activityFact(),
      activityFact({ sessionRpe: 8 }),
    ]);

    const before = await service.resolve(42);
    const after = await service.resolve(42);

    expect(after.dimensions.LOAD).not.toBe(before.dimensions.LOAD);
    expect(after.dimensions.HEART_RATE).toBe(before.dimensions.HEART_RATE);
    expect(after.dimensions.POWER).toBe(before.dimensions.POWER);
    expect(after.dimensions.PACE).toBe(before.dimensions.PACE);
    expect(after.dimensions.PROFILE).toBe(before.dimensions.PROFILE);
    expect(after.overall).not.toBe(before.overall);
  });

  it('invalidates record-dependent dimensions when Parquet facts change without touching LOAD', async () => {
    const changed = activityFact();
    changed.parquetFiles = [
      {
        ...changed.parquetFiles[0],
        checksum: 'parquet-b',
        pointCount: 3_601,
      },
    ];
    const { service } = serviceFor([activityFact(), changed]);

    const before = await service.resolve(42);
    const after = await service.resolve(42);

    expect(after.dimensions.HEART_RATE).not.toBe(before.dimensions.HEART_RATE);
    expect(after.dimensions.POWER).not.toBe(before.dimensions.POWER);
    expect(after.dimensions.PACE).not.toBe(before.dimensions.PACE);
    expect(after.dimensions.PROFILE).not.toBe(before.dimensions.PROFILE);
    expect(after.dimensions.LOAD).toBe(before.dimensions.LOAD);
  });

  it('ignores HEAVY-only lap fields but invalidates POWER for raw lap power changes', async () => {
    const heavyOnlyChanged = activityFact();
    heavyOnlyChanged.laps = [
      { ...heavyOnlyChanged.laps[0], intensityFactor: 0.95, tss: 100 },
    ];
    const rawPowerChanged = activityFact();
    rawPowerChanged.laps = [{ ...rawPowerChanged.laps[0], avgPower: 220 }];
    const { service } = serviceFor([
      activityFact(),
      heavyOnlyChanged,
      rawPowerChanged,
    ]);

    const baseline = await service.resolve(42);
    const afterHeavyWrite = await service.resolve(42);
    const afterRawChange = await service.resolve(42);

    expect(afterHeavyWrite).toEqual(baseline);
    expect(afterRawChange.dimensions.POWER).not.toBe(baseline.dimensions.POWER);
    expect(afterRawChange.dimensions.HEART_RATE).toBe(
      baseline.dimensions.HEART_RATE,
    );
  });
});
