import { describe, expect, it } from '@jest/globals';
import type { SensorRecord } from '@/sensor/sensor-data.service';
import {
  applySmoothing,
  CYCLING_GRADE_LOOKAHEAD_METERS,
  GRADE_CLAMP_PERCENT,
  RUN_GRADE_LOOKAHEAD_METERS,
} from './smoothing.util';

function records(
  values: Array<{ distance?: number; altitude?: number; grade?: number }>,
): SensorRecord[] {
  return values.map(
    (value, index) =>
      ({
        activityId: 1,
        timestamp: new Date(index * 1000).toISOString(),
        ...value,
      }) as unknown as SensorRecord,
  );
}

describe('Elevate-style grade calculation', () => {
  it('uses sport-specific distance windows and preserves a steady grade', () => {
    expect(RUN_GRADE_LOOKAHEAD_METERS).toBe(25);
    expect(CYCLING_GRADE_LOOKAHEAD_METERS).toBe(40);
    const input = records(
      Array.from({ length: 81 }, (_, index) => ({
        distance: index * 5,
        altitude: index * 0.5,
      })),
    );

    const running = applySmoothing(input, RUN_GRADE_LOOKAHEAD_METERS);
    const cycling = applySmoothing(input, CYCLING_GRADE_LOOKAHEAD_METERS);

    expect(running[40].grade).toBeCloseTo(10, 1);
    expect(cycling[40].grade).toBeCloseTo(10, 1);
  });

  it('removes an isolated altitude spike before calculating grade', () => {
    const input = records(
      Array.from({ length: 30 }, (_, index) => ({
        distance: index * 5,
        altitude: index === 10 ? 100 : 0,
      })),
    );

    const result = applySmoothing(input, 10);

    expect(Math.max(...result.map((row) => Math.abs(row.grade ?? 0)))).toBe(0);
  });

  it('clamps extreme grades and does not turn missing evidence into zero', () => {
    const input = records([
      { distance: 0, altitude: 0 },
      { distance: 10, altitude: 100 },
      { distance: undefined, altitude: undefined, grade: 7 },
      { distance: 20, altitude: 100 },
      { distance: 30, altitude: 0 },
    ]);

    const result = applySmoothing(input, 10);

    expect(Math.abs(result[0].grade ?? 0)).toBeLessThanOrEqual(
      GRADE_CLAMP_PERCENT,
    );
    expect(result[2].grade).toBe(7);
  });
});
