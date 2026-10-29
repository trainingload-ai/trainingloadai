import { describe, expect, it } from '@jest/globals';
import type { SensorRecord } from '@/sensor/sensor-data.service';
import { calculateBikeScoreMetrics, computeXPower } from '../BikeScore';

const record = (second: number, power: number): SensorRecord =>
  ({
    activityId: 1,
    index: second,
    lapIndex: 0,
    timestamp: new Date(second * 1000),
    distance: second,
    power,
  }) as SensorRecord;

describe('timestamp-aware BikeScore', () => {
  it('weights xPower by covered seconds instead of callback count', () => {
    const dense = Array.from({ length: 61 }, (_, second) =>
      record(second, second < 10 ? 100 : 300),
    );
    const sparse = [
      record(0, 100),
      record(10, 300),
      record(20, 300),
      record(30, 300),
      record(40, 300),
      record(50, 300),
      record(60, 300),
    ];

    expect(computeXPower(sparse).xPower).toBeCloseTo(
      computeXPower(dense).xPower,
      8,
    );
  });

  it('does not count long recording gaps as work', () => {
    const result = calculateBikeScoreMetrics(
      [record(0, 200), record(5, 200), record(30, 1000), record(35, 1000)],
      { cp: 250, sampleSec: 1, avgPower: 600, avgHeartRate: 150 },
    );

    expect(result.durationSec).toBe(35);
    expect(result.coveredSeconds).toBe(10);
    expect(result.coverageRatio).toBeCloseTo(10 / 35, 8);
    expect(result.algorithmVersion).toBe(2);
  });
});
