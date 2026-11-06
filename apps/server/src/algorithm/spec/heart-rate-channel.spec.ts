import { describe, expect, it } from '@jest/globals';
import {
  computeMaxMeanObservedWindows,
  observedHeartRateSamples,
  observedSampleSeconds,
  resampleObservedValues,
} from '../time-series-metrics';

describe('independently sampled heart-rate channel', () => {
  const records = Array.from({ length: 301 }, (_, second) => ({
    tMs: second * 1000,
    heartRate: second % 5 === 0 ? 150 : undefined,
  }));

  it('uses the HR cadence instead of the cadence of unrelated FIT fields', () => {
    const samples = observedHeartRateSamples(records);
    expect(samples).toHaveLength(61);
    expect(observedSampleSeconds(samples)).toBe(5);
    expect(resampleObservedValues(samples).coveredSeconds).toBe(300);
    expect(
      computeMaxMeanObservedWindows(samples, { '5s': 5 })['5s']?.value,
    ).toBe(150);
  });

  it('does not fill recording gaps longer than the maximum observed span', () => {
    const samples = observedHeartRateSamples(
      records.filter((r) => r.tMs <= 60_000 || r.tMs >= 120_000),
    );
    expect(resampleObservedValues(samples).coveredSeconds).toBe(240);
  });

  it('retains explicit invalid readings as barriers', () => {
    const samples = observedHeartRateSamples([
      { tMs: 0, heartRate: 150 },
      { tMs: 5000, heartRate: 0 },
      { tMs: 10_000, heartRate: 150 },
      { tMs: 15_000, heartRate: 150 },
    ]);
    expect(samples[1].value).toBeNull();
    expect(resampleObservedValues(samples).coveredSeconds).toBe(10);
  });
});
