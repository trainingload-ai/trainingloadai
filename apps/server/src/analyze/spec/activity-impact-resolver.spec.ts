import { describe, expect, it } from '@jest/globals';
import { SportType, UserFitnessMetricType } from '@prisma/client';
import { ActivityImpactResolver } from '../activity-impact-resolver';

describe('ActivityImpactResolver', () => {
  const resolver = new ActivityImpactResolver();

  it('limits an early MAX_HR change to heart-rate and VO2 dimensions', () => {
    expect(
      resolver.dimensionsForFitnessMetrics([UserFitnessMetricType.MAX_HR]),
    ).toEqual(['HEART_RATE', 'VO2_MAX']);
  });

  it('does not invalidate PMC for provenance-only load changes', () => {
    expect(
      resolver.shouldRecomputePmc({ previousLoad: 42, nextLoad: 42 }),
    ).toBe(false);
    expect(
      resolver.shouldRecomputePmc({ previousLoad: null, nextLoad: 42 }),
    ).toBe(true);
  });

  it('limits non-scalar snapshot metric changes to their dependent dimension', () => {
    const dimensions = resolver.dimensionsForContextChange({
      snapshot: {
        ftpValue: null,
        cpValue: null,
        cpValue2: null,
        maxHrValue: null,
        lthrValue: null,
        restHrValue: null,
        csValue: null,
        csValue2: null,
        inputDimensionFingerprints: {
          HEART_RATE: 'hr',
          POWER: 'power',
          PACE: 'pace',
          PROFILE: 'profile',
          LOAD: 'load',
        },
        analysisConfigFingerprint: 'config',
        resolvedLoadSources: ['POWER'],
        provenance: {
          metrics: {
            [UserFitnessMetricType.P_MAX]: { value: 900, value2: null },
            [UserFitnessMetricType.W_PRIME]: {
              value: null,
              value2: null,
            },
            [UserFitnessMetricType.TP]: { value: null, value2: null },
            [UserFitnessMetricType.VO2_MAX]: {
              value: null,
              value2: null,
            },
          },
          zones: [],
          bodyMetrics: [],
        },
      },
      resolved: {
        resolutionVersion: 4,
        activityId: 1,
        activityStart: new Date('2026-01-01T00:00:00.000Z'),
        activityEnd: new Date('2026-01-01T01:00:00.000Z'),
        sport: SportType.CYCLING,
        profile: {},
        analysisConfig: {
          versionId: 'config-1',
          version: 1,
          effectiveAt: new Date('1970-01-01T00:00:00.000Z'),
          fingerprint: 'config',
          loadSources: ['POWER'],
          altitudeOptimizationModel: 'THRESHOLDMETHOD',
          altitudeThreshold: null,
          defaultVdotSource: 'FACTOR',
          vo2maxCorrectionFactor: 1,
          heartRateZoneModel: 'MHR',
          paceZoneModel: 'DANIELS',
          powerZoneModel: 'FRIEL',
        },
        inputFingerprints: {
          overall: 'input',
          dimensions: {
            HEART_RATE: 'hr',
            POWER: 'power',
            PACE: 'pace',
            PROFILE: 'profile',
            LOAD: 'load',
          },
        },
        metrics: {
          [UserFitnessMetricType.P_MAX]: {
            value: 950,
            value2: null,
            source: 'AUTO',
            effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
            evidenceFingerprint: 'new-pmax',
          },
        },
        zones: [],
        bodyMetrics: [],
        contextFingerprint: 'context',
        calculationFingerprint: 'next',
        provenanceFingerprint: 'next-provenance',
      },
    });

    expect(dimensions).toEqual(['POWER']);
  });
});
