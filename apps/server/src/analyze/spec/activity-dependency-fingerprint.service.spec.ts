import { describe, expect, it } from '@jest/globals';
import {
  BodyMetricType,
  Gender,
  MetricSource,
  SportType,
  UserFitnessMetricType,
  ZoneType,
} from '@prisma/client';
import { ActivityDependencyFingerprintService } from '../activity-dependency-fingerprint.service';
import { FITNESS_CONTEXT_RESOLUTION_VERSION } from '../resolved-fitness-context';
import type { UnfingerprintedFitnessContext } from '../resolved-fitness-context';

function context(): UnfingerprintedFitnessContext {
  return {
    resolutionVersion: FITNESS_CONTEXT_RESOLUTION_VERSION,
    activityId: 42,
    activityStart: new Date('2026-01-01T10:00:00.000Z'),
    activityEnd: new Date('2026-01-01T11:00:00.000Z'),
    sport: SportType.CYCLING,
    profile: { weight: 70, height: 175, age: 30, gender: Gender.MALE },
    analysisConfig: {
      versionId: 'config-1',
      version: 1,
      effectiveAt: new Date('1970-01-01T00:00:00.000Z'),
      fingerprint: 'analysis-config-1',
      loadSources: ['POWER', 'HEART_RATE', 'PACE', 'SESSIONRPE'],
      altitudeOptimizationModel: 'THRESHOLDMETHOD',
      altitudeThreshold: null,
      defaultVdotSource: 'FACTOR',
      vo2maxCorrectionFactor: 1,
      heartRateZoneModel: 'MHR',
      paceZoneModel: 'DANIELS',
      powerZoneModel: 'FRIEL',
    },
    inputFingerprints: {
      overall: 'input-overall-1',
      dimensions: {
        HEART_RATE: 'input-heart-rate-1',
        POWER: 'input-power-1',
        PACE: 'input-pace-1',
        PROFILE: 'input-profile-1',
        LOAD: 'input-load-1',
      },
    },
    metrics: {
      [UserFitnessMetricType.FTP]: {
        value: 250,
        value2: null,
        source: MetricSource.AUTO,
        effectiveAt: new Date('2025-12-31T10:00:00.000Z'),
        sourceMetricId: 'metric-1',
        evidenceFingerprint: 'evidence-1',
      },
    },
    zones: [
      {
        zoneType: ZoneType.POWER,
        sport: SportType.CYCLING,
        versionId: 'zone-1',
        effectiveAt: new Date('2025-12-31T10:00:00.000Z'),
        calculationFingerprint: 'zone-calculation-1',
        provenanceFingerprint: 'zone-provenance-1',
        setting: {
          configurationSource: 'saved' as const,
          benchmark: null,
          zones: [],
        },
      },
    ],
    bodyMetrics: [
      {
        type: BodyMetricType.WEIGHT,
        value: '70',
        effectiveAt: new Date('2025-12-01T00:00:00.000Z'),
        sourceId: 'body-1',
        evidenceFingerprint: 'body-evidence-1',
        reason: null,
      },
    ],
  };
}

describe('ActivityDependencyFingerprintService', () => {
  const service = new ActivityDependencyFingerprintService();

  it('keeps calculation stable while provenance changes', () => {
    const first = service.resolve(context());
    const changed = context();
    changed.metrics.FTP!.source = MetricSource.MANUAL;
    changed.metrics.FTP.sourceMetricId = 'metric-2';
    changed.metrics.FTP.evidenceFingerprint = 'evidence-2';
    changed.zones[0].versionId = 'zone-2';
    changed.zones[0].provenanceFingerprint = 'zone-provenance-2';
    changed.bodyMetrics[0].sourceId = 'body-2';
    changed.bodyMetrics[0].evidenceFingerprint = 'body-evidence-2';
    const second = service.resolve(changed);

    expect(second.calculationFingerprint).toBe(first.calculationFingerprint);
    expect(second.provenanceFingerprint).not.toBe(first.provenanceFingerprint);
  });

  it('includes metric values, zone calculations and body values', () => {
    const first = service.resolve(context());
    const metric = context();
    metric.metrics.FTP.value = 260;
    const zone = context();
    zone.zones[0].calculationFingerprint = 'zone-calculation-2';
    const body = context();
    body.bodyMetrics[0].value = '71';

    expect(service.resolve(metric).calculationFingerprint).not.toBe(
      first.calculationFingerprint,
    );
    expect(service.resolve(zone).calculationFingerprint).not.toBe(
      first.calculationFingerprint,
    );
    expect(service.resolve(body).calculationFingerprint).not.toBe(
      first.calculationFingerprint,
    );
  });

  it('keeps non-calculation context changes out of the calculation fingerprint', () => {
    const first = service.resolve(context());
    const changed = context();
    changed.profile.loadSources = ['PACE'];
    changed.profile.timezone = 'Asia/Shanghai';
    changed.bodyMetrics.push({
      type: BodyMetricType.TIMEZONE,
      value: 'Asia/Shanghai',
      effectiveAt: new Date('2025-12-01T00:00:00.000Z'),
      sourceId: 'timezone-1',
      evidenceFingerprint: 'timezone-evidence-1',
      reason: null,
    });
    changed.zones[0].effectiveAt = new Date('2025-12-30T10:00:00.000Z');

    const second = service.resolve(changed);
    expect(second.calculationFingerprint).toBe(first.calculationFingerprint);
    expect(second.provenanceFingerprint).not.toBe(first.provenanceFingerprint);
  });
});
