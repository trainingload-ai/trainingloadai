import { describe, expect, it } from '@jest/globals';
import {
  computeCogganFromTimeline,
  computeISOPower,
  resampleObservedPower,
} from '../coggan';
import { SportType } from '@prisma/client';

describe('computeISOPower', () => {
  it('starts only after a complete 30-second rolling window', () => {
    expect(computeISOPower(new Array(29).fill(200))).toBe(0);
    expect(computeISOPower(new Array(30).fill(200))).toBeCloseTo(200, 8);
    expect(computeISOPower(new Array(60).fill(200))).toBeCloseTo(200, 8);
  });

  it('preserves observed zero power in rolling windows', () => {
    const samples = Array.from({ length: 20 }, () =>
      new Array(60).fill(0).map((_, second) => (second < 30 ? 400 : 0)),
    ).flat();
    expect(computeISOPower(samples)).toBeCloseTo(267.71, 1);
  });

  it('rejects invalid samples instead of silently changing the window', () => {
    expect(computeISOPower([...new Array(30).fill(200), Number.NaN])).toBe(0);
    expect(computeISOPower([...new Array(30).fill(200), -1])).toBe(0);
  });
});

describe('timestamp-aware Coggan metrics', () => {
  it('keeps zero power observed and leaves long gaps unknown', () => {
    const timeline = resampleObservedPower([
      { tMs: 0, power: 200 },
      { tMs: 5_000, power: 0 },
      { tMs: 10_000, power: 300 },
      { tMs: 30_000, power: 300 },
    ]);

    expect(timeline.values.slice(0, 5)).toEqual(new Array(5).fill(200));
    expect(timeline.values.slice(5, 10)).toEqual(new Array(5).fill(0));
    expect(timeline.values.slice(10)).toEqual(new Array(20).fill(null));
    expect(timeline.coveredSeconds).toBe(10);
  });

  it('computes NP only from complete real-time 30-second windows', () => {
    const continuous = Array.from({ length: 61 }, (_, second) => ({
      tMs: second * 1000,
      power: 200,
    }));
    const result = computeCogganFromTimeline(
      continuous,
      200,
      150,
      SportType.CYCLING,
    );

    expect(result.isopower).toBeCloseTo(200, 8);
    expect(result.durationSec).toBe(60);
    expect(result.coveredSeconds).toBe(60);
    expect(result.coverageRatio).toBe(1);
    expect(result.algorithmVersion).toBe(2);
  });
});
