import { describe, expect, it } from '@jest/globals';
import type { SensorRecord } from '@/sensor/sensor-data.service';
import { calculateObservedGradeCoverageRatio, computeGOVSS } from '../GOVSS';

const record = (
  second: number,
  speed: number,
  grade: number | null = 0,
): SensorRecord =>
  ({
    activityId: 1,
    index: second,
    lapIndex: 0,
    timestamp: new Date(second * 1000),
    distance: second * speed,
    speed,
    enhancedSpeed: speed,
    grade,
  }) as SensorRecord;

describe('timestamp-aware GOVSS', () => {
  it('weights irregular observations by covered seconds', () => {
    const dense = Array.from({ length: 61 }, (_, second) =>
      record(second, 3.2, 2),
    );
    const sparse = Array.from({ length: 7 }, (_, index) =>
      record(index * 10, 3.2, 2),
    );
    const denseResult = computeGOVSS(dense, 70, 1.75, 3.2, 1);
    const sparseResult = computeGOVSS(sparse, 70, 1.75, 3.2, 10);

    expect(sparseResult.coveredSeconds).toBe(60);
    expect(sparseResult.govss).toBeCloseTo(denseResult.govss, 8);
  });

  it('does not bridge long gaps and measures timed grade coverage', () => {
    const records = [
      record(0, 3, 2),
      record(5, 3, 2),
      record(30, 3, null),
      record(35, 3, null),
    ];
    const result = computeGOVSS(records, 70, 1.75, 3.2, 1, {
      gradeMode: 'flat',
    });

    expect(result.coveredSeconds).toBe(10);
    expect(result.gradeCoverageRatio).toBe(0.5);
    expect(calculateObservedGradeCoverageRatio(records)).toBe(0.5);
    expect(result.algorithmVersion).toBe(3);
  });
});
