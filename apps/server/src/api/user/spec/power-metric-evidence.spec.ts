import { MetricSource, UserFitnessMetricType } from '@prisma/client';

import {
  derivedPowerMetricNeedsEvidence,
  hasPowerPeakEvidence,
  powerModelOriginPayload,
} from '../power-metric-evidence';

describe('power metric evidence', () => {
  it('accepts duration, watts, and the activity that produced the peak', () => {
    const payload = powerModelOriginPayload([
      { seconds: 1200, watts: 280, activityId: 42 },
    ]);

    expect(payload).toEqual({
      method: 'CP_MODEL',
      peaks: [{ seconds: 1200, watts: 280, activityId: 42 }],
    });
    expect(hasPowerPeakEvidence(payload)).toBe(true);
  });

  it('rejects a null payload and a payload that only names activities', () => {
    expect(hasPowerPeakEvidence(null)).toBe(false);
    expect(
      hasPowerPeakEvidence({
        sourceActivityIds: [42],
        evidenceFingerprint: 'abc',
      }),
    ).toBe(false);
  });

  it('requires evidence only for automatic power metrics', () => {
    expect(
      derivedPowerMetricNeedsEvidence(
        MetricSource.AUTO,
        UserFitnessMetricType.CP,
      ),
    ).toBe(true);
    expect(
      derivedPowerMetricNeedsEvidence(
        MetricSource.ESTIMATED,
        UserFitnessMetricType.FTP,
      ),
    ).toBe(true);
    expect(
      derivedPowerMetricNeedsEvidence(
        MetricSource.MANUAL,
        UserFitnessMetricType.CP,
      ),
    ).toBe(false);
    expect(
      derivedPowerMetricNeedsEvidence(
        MetricSource.AUTO,
        UserFitnessMetricType.LTHR,
      ),
    ).toBe(false);
  });
});
