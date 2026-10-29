import { describe, expect, it } from '@jest/globals';
import { assertHealthMetricCandidate } from '../health-metric-contract';

const base = {
  metricType: 'STEP_COUNT',
  unit: 'count',
  aggregation: 'SUM',
  value: 100,
  startTime: new Date('2026-07-18T00:00:00.000Z'),
  endTime: new Date('2026-07-18T01:00:00.000Z'),
  localDate: new Date('2026-07-18T00:00:00.000Z'),
};

describe('health metric contract', () => {
  it('accepts a compatible metric candidate', () => {
    expect(assertHealthMetricCandidate(base)).toEqual({ aggregation: 'SUM' });
  });

  it('rejects unit, aggregation, range and interval mismatches', () => {
    expect(() => assertHealthMetricCandidate({ ...base, unit: 'm' })).toThrow(
      'Invalid unit',
    );
    expect(() =>
      assertHealthMetricCandidate({ ...base, aggregation: 'AVG' }),
    ).toThrow('Invalid aggregation');
    expect(() => assertHealthMetricCandidate({ ...base, value: -1 })).toThrow(
      'below 0',
    );
    expect(() =>
      assertHealthMetricCandidate({
        ...base,
        startTime: base.endTime,
        endTime: base.startTime,
      }),
    ).toThrow('end before start');
  });
});
