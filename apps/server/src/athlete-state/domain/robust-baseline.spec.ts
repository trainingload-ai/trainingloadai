import { describe, expect, it } from '@jest/globals';
import {
  buildRobustBaseline,
  median,
  medianAbsoluteDeviation,
} from './robust-baseline';

describe('robust baseline', () => {
  it('uses median and MAD without turning missing values into zero', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2, 100])).toBe(2.5);
    expect(medianAbsoluteDeviation([1, 2, 3], 2)).toBe(1);
  });

  it('requires 14 baseline samples from the current provider', () => {
    const points = Array.from({ length: 17 }, (_, index) => ({
      date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      value: index < 14 ? 50 + (index % 3) : 44,
      unit: 'ms',
      provider: 'GARMIN',
    }));
    const result = buildRobustBaseline({
      metric: 'HRV_RMSSD_MS',
      points,
      baselineEndDate: '2026-09-14',
      recentStartDate: '2026-09-15',
      minimumSamples: 14,
    });
    expect(result.sampleCount).toBe(14);
    expect(result.provider).toBe('GARMIN');
    expect(result.robustZ).not.toBeNull();
  });

  it('does not compare across a provider switch', () => {
    const points = [
      ...Array.from({ length: 14 }, (_, index) => ({
        date: `2026-09-${String(index + 1).padStart(2, '0')}`,
        value: 50 + (index % 2),
        unit: 'ms',
        provider: 'GARMIN',
      })),
      {
        date: '2026-09-15',
        value: 40,
        unit: 'ms',
        provider: 'APPLE_HEALTH',
      },
      {
        date: '2026-09-16',
        value: 41,
        unit: 'ms',
        provider: 'GARMIN',
      },
    ];
    const result = buildRobustBaseline({
      metric: 'HRV_RMSSD_MS',
      points,
      baselineEndDate: '2026-09-14',
      recentStartDate: '2026-09-15',
      minimumSamples: 14,
    });
    expect(result.providerContinuous).toBe(false);
    expect(result.robustZ).toBeNull();
  });
});
