import { describe, expect, it } from '@jest/globals';
import { calculateTimedWPrimeBalance } from '../wprime';

describe('calculateTimedWPrimeBalance', () => {
  it('uses elapsed seconds instead of assuming one second per array element', () => {
    const oneSecond = calculateTimedWPrimeBalance(
      [
        { tMs: 0, power: 300 },
        { tMs: 1_000, power: 300 },
      ],
      250,
      20_000,
    );
    const fiveSeconds = calculateTimedWPrimeBalance(
      [
        { tMs: 0, power: 300 },
        { tMs: 5_000, power: 300 },
      ],
      250,
      20_000,
    );

    expect(fiveSeconds.values[1]!).toBeLessThan(oneSecond.values[1]!);
    expect(fiveSeconds.coveredSeconds).toBe(5);
  });

  it('keeps zero power as observed recovery input', () => {
    const result = calculateTimedWPrimeBalance(
      [
        { tMs: 0, power: 300 },
        { tMs: 10_000, power: 300 },
        { tMs: 20_000, power: 0 },
      ],
      250,
      20_000,
    );
    expect(result.values[2]).not.toBeNull();
    expect(result.coveredSeconds).toBe(20);
  });

  it('marks a missing-power gap and subsequent state as unknown', () => {
    const result = calculateTimedWPrimeBalance(
      [
        { tMs: 0, power: 300 },
        { tMs: 1_000, power: null },
        { tMs: 2_000, power: 0 },
      ],
      250,
      20_000,
    );
    expect(result.values).toEqual([20_000, null, null]);
    expect(result.unknownSeconds).toBe(2);
  });
});
