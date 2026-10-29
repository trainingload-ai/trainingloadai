import { describe, expect, it } from '@jest/globals';
import {
  computeNormalizedSessionRpeLoad,
  computeSessionRpeLoad,
} from '../session-rpe-load';

describe('computeSessionRpeLoad', () => {
  it.each([
    [3600, 10, 100],
    [3600, 8, 80],
    [2700, 6, 45],
  ])(
    'normalizes %s seconds at RPE %s to %s',
    (timerTimeSeconds, rating, expected) => {
      expect(
        computeNormalizedSessionRpeLoad({ rating, timerTimeSeconds }),
      ).toBe(expected);
    },
  );

  it('prefers timer time over elapsed time', () => {
    expect(
      computeSessionRpeLoad({
        rating: 8,
        timerTimeSeconds: 1800,
        elapsedTimeSeconds: 3600,
      }),
    ).toEqual({
      rating: 8,
      durationMinutes: 30,
      rawAu: 240,
      normalizedLoad: 40,
    });
  });

  it.each([
    { rating: null, timerTimeSeconds: 3600 },
    { rating: 0, timerTimeSeconds: 3600 },
    { rating: 11, timerTimeSeconds: 3600 },
    { rating: 8, timerTimeSeconds: 0, elapsedTimeSeconds: 0 },
  ])('returns null for incomplete or invalid input %#', (input) => {
    expect(computeSessionRpeLoad(input)).toBeNull();
  });
});
