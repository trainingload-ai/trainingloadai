import { describe, expect, it } from '@jest/globals';
import {
  currentTrainingStressBalance,
  nextExponentialLoad,
  timeConstantDecayFactor,
} from '../pmc-formula';

describe('PMC exponential time-constant formula', () => {
  it('uses the Intervals.icu 42-day and 7-day decay factors', () => {
    expect(timeConstantDecayFactor(42)).toBeCloseTo(0.9764716867, 10);
    expect(timeConstantDecayFactor(7)).toBeCloseTo(0.8668778998, 10);
  });

  it('updates CTL using the one-day exponential decay', () => {
    const decayFactor = timeConstantDecayFactor(42);

    expect(nextExponentialLoad(20, 100, decayFactor)).toBeCloseTo(
      21.8822650678,
      9,
    );
  });

  it('updates ATL using the Intervals.icu seven-day decay', () => {
    const decayFactor = timeConstantDecayFactor(7);

    expect(nextExponentialLoad(50, 100, decayFactor)).toBeCloseTo(
      56.6561050125,
      9,
    );
  });

  it('calculates TSB from same-day fitness and fatigue', () => {
    expect(
      currentTrainingStressBalance(21.8822650678, 56.6561050108),
    ).toBeCloseTo(-34.773839943, 8);
  });

  it('rejects invalid time constants', () => {
    expect(() => timeConstantDecayFactor(0)).toThrow(RangeError);
    expect(() => timeConstantDecayFactor(Number.NaN)).toThrow(RangeError);
  });
});
