import { describe, expect, it } from '@jest/globals';
import { calculateObservedLthrCandidate } from '../fitness-lthr';
import {
  selectLthrEstimate,
  shouldApplyLthrAutoUpdate,
} from '../lthr-observation';

describe('LTHR passive observation', () => {
  it('finds the strongest quality-qualified 30-minute window', () => {
    const samples = Array.from({ length: 3601 }, (_, seconds) => ({
      seconds,
      heartRate: seconds < 1800 ? 150 : seconds < 2400 ? 165 : 175,
    }));
    const result = calculateObservedLthrCandidate(samples, 1);
    expect(result).not.toBeNull();
    expect(result?.windowStartSec).toBe(1800);
    expect(result?.value).toBe(175);
    expect(result?.fullCoverageRatio).toBeGreaterThanOrEqual(0.95);
  });

  it('rejects sparse observations that only look continuous by interpolation', () => {
    expect(
      calculateObservedLthrCandidate(
        [
          { seconds: 0, heartRate: 170 },
          { seconds: 600, heartRate: 170 },
          { seconds: 1800, heartRate: 170 },
        ],
        1,
      ),
    ).toBeNull();
  });

  it('selects the highest corroborated cluster instead of an isolated maximum', () => {
    const at = new Date('2026-09-27T00:00:00.000Z');
    const values = [172, 174, 175, 174, 184];
    const estimate = selectLthrEstimate(
      values.map((candidateBpm, index) => ({
        id: `obs-${index}`,
        activityId: index + 1,
        candidateBpm,
        observedAt: new Date(at.getTime() - index * 2 * 86_400_000),
        protocol: 'OBSERVED' as const,
      })),
      at,
    );
    expect(estimate).toMatchObject({
      value: 174,
      tier: 'CORROBORATED',
      supportCount: 4,
      autoEligible: true,
    });
    expect(estimate?.observationIds).not.toContain('obs-4');
  });

  it('keeps a single high observation estimated-only', () => {
    const estimate = selectLthrEstimate(
      [
        {
          id: 'single',
          activityId: 1,
          candidateBpm: 180,
          observedAt: new Date('2026-09-26T00:00:00.000Z'),
          protocol: 'OBSERVED',
        },
      ],
      new Date('2026-09-27T00:00:00.000Z'),
    )!;
    expect(estimate.autoEligible).toBe(false);
    expect(shouldApplyLthrAutoUpdate(null, estimate)).toBe(false);
  });

  it('requires three observations for a jump greater than five bpm', () => {
    const base = {
      value: 178,
      tier: 'CORROBORATED' as const,
      observationIds: ['a', 'b'],
      rangeMin: 177,
      rangeMax: 179,
      autoEligible: true,
    };
    expect(shouldApplyLthrAutoUpdate(170, { ...base, supportCount: 2 })).toBe(
      false,
    );
    expect(shouldApplyLthrAutoUpdate(170, { ...base, supportCount: 3 })).toBe(
      true,
    );
  });
});
