import { describe, expect, it } from '@jest/globals';
import { SportType, UserFitnessMetricType } from '@prisma/client';
import { validateFitnessMetricCandidate } from '../fitness-metric-validator';

describe('validateFitnessMetricCandidate', () => {
  it('rejects impossible CP before it can become an effective threshold', () => {
    expect(
      validateFitnessMetricCandidate({
        type: UserFitnessMetricType.CP,
        value: 9,
        sport: SportType.CYCLING,
      }),
    ).toEqual({
      valid: false,
      reason: 'outside_intrinsic_range:30-2000',
    });
  });

  it('rejects a walking average mislabeled as LTHR', () => {
    expect(
      validateFitnessMetricCandidate(
        {
          type: UserFitnessMetricType.LTHR,
          value: 114,
          sport: SportType.RUN,
        },
        {
          [UserFitnessMetricType.MAX_HR]: 202,
          [UserFitnessMetricType.RESTING_HR]: 60,
        },
      ),
    ).toEqual({
      valid: false,
      reason: 'lthr_not_consistent_with_max_hr',
    });
  });

  it('accepts a physiologically consistent heart-rate threshold', () => {
    expect(
      validateFitnessMetricCandidate(
        {
          type: UserFitnessMetricType.LTHR,
          value: 174,
          sport: SportType.RUN,
        },
        {
          [UserFitnessMetricType.MAX_HR]: 202,
          [UserFitnessMetricType.RESTING_HR]: 60,
        },
      ),
    ).toEqual({ valid: true });
  });

  it('requires a MaxHR reference for automatic LTHR estimation', () => {
    expect(
      validateFitnessMetricCandidate(
        {
          type: UserFitnessMetricType.LTHR,
          value: 170,
          sport: SportType.RUN,
        },
        { [UserFitnessMetricType.RESTING_HR]: 50 },
        { requireReferenceMetrics: true },
      ),
    ).toEqual({ valid: false, reason: 'max_hr_required_for_lthr' });
  });

  it('keeps FTP and CP mutually consistent', () => {
    expect(
      validateFitnessMetricCandidate(
        {
          type: UserFitnessMetricType.FTP,
          value: 80,
          sport: SportType.CYCLING,
        },
        { [UserFitnessMetricType.CP]: 250 },
      ),
    ).toEqual({
      valid: false,
      reason: 'ftp_not_consistent_with_cp',
    });
  });

  it('accepts a deliberately entered slow manual RUN CS', () => {
    expect(
      validateFitnessMetricCandidate({
        type: UserFitnessMetricType.CS,
        value: 1.5,
        sport: SportType.RUN,
        source: 'MANUAL',
      }),
    ).toEqual({ valid: true });
  });

  it('rejects the same slow RUN CS when it comes from AUTO estimation', () => {
    expect(
      validateFitnessMetricCandidate({
        type: UserFitnessMetricType.CS,
        value: 1.5,
        sport: SportType.RUN,
        source: 'AUTO',
      }),
    ).toEqual({
      valid: false,
      reason: 'auto_running_cs_below_minimum:1.8',
    });
  });
});
