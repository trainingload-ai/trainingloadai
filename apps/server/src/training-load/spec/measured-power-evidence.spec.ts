import { describe, expect, it } from '@jest/globals';
import {
  permitsMeasuredPowerFitness,
  permitsPowerDerivedMetrics,
  resolveMeasuredPowerEvidence,
} from '../measured-power-evidence';

describe('measured power evidence', () => {
  it('treats coverage at or above 50% as reliable', () => {
    const evidence = resolveMeasuredPowerEvidence([
      { metadata: { datasetQuality: { powerCoverage: 0.5 } } },
    ]);

    expect(evidence).toBe('RELIABLE');
    expect(permitsMeasuredPowerFitness(evidence)).toBe(true);
    expect(permitsPowerDerivedMetrics(evidence)).toBe(true);
  });

  it('blocks fitness metrics when coverage is insufficient', () => {
    const evidence = resolveMeasuredPowerEvidence([
      { metadata: { datasetQuality: { powerCoverage: 0 } } },
    ]);

    expect(evidence).toBe('INSUFFICIENT');
    expect(permitsMeasuredPowerFitness(evidence)).toBe(false);
    expect(permitsPowerDerivedMetrics(evidence)).toBe(false);
  });

  it('blocks fitness metrics when source quality is unknown', () => {
    expect(resolveMeasuredPowerEvidence([])).toBe('UNKNOWN');
    expect(resolveMeasuredPowerEvidence(undefined)).toBe('UNKNOWN');
    expect(permitsMeasuredPowerFitness('UNKNOWN')).toBe(false);
    expect(permitsMeasuredPowerFitness(undefined)).toBe(false);
    expect(permitsPowerDerivedMetrics('UNKNOWN')).toBe(true);
  });
});
