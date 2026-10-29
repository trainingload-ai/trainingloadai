import { describe, expect, it } from '@jest/globals';
import { heartRateThresholdSnapshotMatches } from '../activity-recompute-executor.service';

describe('heartRateThresholdSnapshotMatches', () => {
  it('matches identical real and missing thresholds', () => {
    expect(
      heartRateThresholdSnapshotMatches(
        { maxHrValue: 190, restHrValue: 50, lthrValue: null },
        {
          maxHeartRate: 190,
          restingHeartRate: 50,
          lactateThresholdHeartRate: null,
        },
      ),
    ).toBe(true);
  });

  it('does not treat a missing historical LTHR as matching a new real LTHR', () => {
    expect(
      heartRateThresholdSnapshotMatches(
        { maxHrValue: 190, restHrValue: 50, lthrValue: null },
        {
          maxHeartRate: 190,
          restingHeartRate: 50,
          lactateThresholdHeartRate: 170,
        },
      ),
    ).toBe(false);
  });

  it('recomputes when the MAXHR used by the estimated LTHR changes', () => {
    expect(
      heartRateThresholdSnapshotMatches(
        { maxHrValue: 190, restHrValue: 50, lthrValue: null },
        {
          maxHeartRate: 195,
          restingHeartRate: 50,
          lactateThresholdHeartRate: null,
        },
      ),
    ).toBe(false);
  });
});
