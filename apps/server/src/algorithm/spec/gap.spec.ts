import { describe, expect, it } from '@jest/globals';
import { computeGapPaceSecondsPerMeter, computeGapSpeed } from '../gap';

describe('grade adjusted pace', () => {
  it.each([
    [-1.01, 2.895713],
    [-1, 2.896497],
    [-0.5, 2.937183],
    [0, 3],
    [0.5, 3.027131],
    [1, 3.076396],
    [1.01, 3.07741],
  ])('treats grade=%s as percent without unit guessing', (grade, expected) => {
    expect(computeGapSpeed(3, grade)).toBeCloseTo(expected, 5);
  });

  it('stays continuous around the former one-percent conversion boundary', () => {
    const below = computeGapSpeed(3, 0.999);
    const above = computeGapSpeed(3, 1.001);

    expect(Math.abs(above - below)).toBeLessThan(0.001);
  });

  it('computes pace with percent grade instead of treating 0.5% as 50%', () => {
    expect(computeGapPaceSecondsPerMeter(3, 0.5)).toBeCloseTo(0.3303458, 6);
    expect(computeGapPaceSecondsPerMeter(3, 1)).toBeCloseTo(0.3250557, 6);
  });
});
