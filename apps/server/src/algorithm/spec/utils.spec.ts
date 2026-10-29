import { describe, expect, it } from '@jest/globals';
import {
  bestFromLengths,
  calculateAerobicEfficiencyPace,
  calculateExponentialMovingAverage,
  calculateHrTss,
  computeTrainingLoadMonotony,
  detectSampleSec,
  estimateMaxHeartRate,
  getDurationSec,
  mode,
  quantile,
  stddev,
  variance,
} from '../utils';

describe('algorithm utils', () => {
  it('calculates variance, standard deviation, quantiles, and mode', () => {
    expect(variance([1, 2, 3, 4])).toBe(1.25);
    expect(stddev([1, 2, 3, 4])).toBeCloseTo(Math.sqrt(1.25), 10);
    expect(quantile([10, 0, 20], 0.5)).toBe(10);
    expect(quantile([0, 10, 20, 30], 0.25)).toBe(7.5);
    expect(mode([3, 2, 3, 2, 3])).toBe(3);
    expect(mode([])).toBeNull();
  });

  it('computes training load monotony and strain with zero-load fallbacks', () => {
    expect(computeTrainingLoadMonotony([])).toEqual({
      monotony: 0,
      trainingStrain: 0,
    });
    expect(computeTrainingLoadMonotony([100, 100, 100])).toEqual({
      monotony: 1,
      trainingStrain: 600,
    });

    const varied = computeTrainingLoadMonotony([50, 100, 150]);
    expect(varied.monotony).toBeCloseTo(
      100 / (Math.sqrt(1666.6666666666667) + 100),
    );
    expect(varied.trainingStrain).toBeCloseTo((300 * varied.monotony) / 0.5);
  });

  it('detects sample interval and activity duration from timestamps', () => {
    expect(
      detectSampleSec([
        { time: '2026-06-29T00:00:00.000Z' },
        { time: '2026-06-29T00:00:05.000Z' },
        { time: '2026-06-29T00:00:10.000Z' },
        { time: '2026-06-29T00:00:20.000Z' },
        { time: '2026-06-29T00:00:25.000Z' },
      ]),
    ).toBe(5);
    expect(detectSampleSec([{ time: '2026-06-29T00:00:00.000Z' }])).toBe(1);
    expect(
      getDurationSec([
        { time: '2026-06-29T00:00:00.000Z', tMs: 0, distance: '0' },
        { time: '2026-06-29T00:05:30.000Z', tMs: 330_000, distance: '0' },
      ]),
    ).toBe(330);
  });

  it('estimates max heart rate from records before falling back to age formula', () => {
    expect(
      estimateMaxHeartRate(undefined, undefined, [150, 160, 200]),
    ).toBeCloseTo(199.2);
    expect(estimateMaxHeartRate(40)).toBe(180);
    expect(estimateMaxHeartRate()).toBeUndefined();
  });

  it('calculates exponential moving averages and HR TSS', () => {
    expect(calculateExponentialMovingAverage(0, 210, 10, 30)).toBe(210);
    expect(calculateExponentialMovingAverage(200, 230, 30, 30)).toBe(219);
    expect(
      calculateHrTss([
        { name: 'z1', duration: 3600 },
        { name: 'z2', duration: 1800 },
        { name: 'z3', duration: 0 },
        { name: 'z4', duration: 900 },
        { name: 'z5', duration: 360 },
      ]),
    ).toBe(77.5);
  });

  it('finds best swim paces from continuous lengths', () => {
    const result = bestFromLengths(
      [
        { totalElapsedTime: 30 },
        { totalElapsedTime: 32 },
        { totalElapsedTime: 28 },
        { totalElapsedTime: 31 },
      ].map((length, index) => ({
        timestamp: `2026-06-29T00:0${index}:00.000Z`,
        index,
        event: null,
        totalStrokes: null,
        avgSpeed: null,
        swimStroke: null,
        avgSwimmingCadence: null,
        strokeCount: null,
        messageIndex: null,
        startTime: null,
        ...length,
      })),
      50,
      [100, 200],
    );

    expect(result).toEqual({
      100: 59,
      200: 60.5,
      method: 'length',
    });
    expect(bestFromLengths([], 50)).toBeNull();
  });

  it('calculates aerobic efficiency pace and guards invalid heart rate', () => {
    expect(calculateAerobicEfficiencyPace(4, 120)).toBe(2);
    expect(calculateAerobicEfficiencyPace(4, 0)).toBe(0);
  });
});
