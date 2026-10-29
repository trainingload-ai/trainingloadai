import { Gender } from '@prisma/client';
import { describe, expect, it } from '@jest/globals';
import { computeTRIMP100, estimateTrimp100LthrFromMaxHr } from '../trimp';

describe('TRIMP100 LTHR fallback', () => {
  it('estimates the runtime normalization threshold as 88% of MAXHR', () => {
    expect(estimateTrimp100LthrFromMaxHr(194)).toBe(171);
    expect(estimateTrimp100LthrFromMaxHr(undefined)).toBeUndefined();
  });

  it('uses the MAXHR estimate only when real LTHR is missing', () => {
    const trimp = 35.83;
    const maxHr = 187;
    const restHr = 60;
    const estimatedLthr = estimateTrimp100LthrFromMaxHr(maxHr);

    expect(computeTRIMP100(trimp, maxHr, restHr, undefined, Gender.MALE)).toBe(
      computeTRIMP100(trimp, maxHr, restHr, estimatedLthr, Gender.MALE),
    );
    expect(computeTRIMP100(trimp, maxHr, restHr, 170, Gender.MALE)).not.toBe(
      computeTRIMP100(trimp, maxHr, restHr, estimatedLthr, Gender.MALE),
    );
  });

  it('returns zero when MAXHR is unavailable', () => {
    expect(computeTRIMP100(35.83, undefined, 60, undefined, Gender.MALE)).toBe(
      0,
    );
  });
});
