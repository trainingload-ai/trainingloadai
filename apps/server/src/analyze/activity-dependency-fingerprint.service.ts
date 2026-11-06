import { Injectable } from '@nestjs/common';
import { fitnessTimelineFingerprint } from '@/algorithm/fitness-timeline';
import {
  type ResolvedFitnessContext,
  type UnfingerprintedFitnessContext,
} from './resolved-fitness-context';
import { BodyMetricType } from '@prisma/client';

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

@Injectable()
export class ActivityDependencyFingerprintService {
  resolve(context: UnfingerprintedFitnessContext): ResolvedFitnessContext {
    const metrics = Object.fromEntries(
      Object.entries(context.metrics)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([type, metric]) => [
          type,
          metric
            ? {
                value: metric.value,
                value2: metric.value2,
                reason: metric.reason ?? null,
              }
            : null,
        ]),
    );
    const zones = [...context.zones]
      .sort((left, right) =>
        `${left.sport}:${left.zoneType}`.localeCompare(
          `${right.sport}:${right.zoneType}`,
        ),
      )
      .map((zone) => ({
        sport: zone.sport,
        zoneType: zone.zoneType,
        calculationFingerprint: zone.calculationFingerprint,
      }));
    const calculationBodyTypes = new Set<BodyMetricType>([
      BodyMetricType.WEIGHT,
      BodyMetricType.HEIGHT,
      BodyMetricType.BIRTHDAY,
      BodyMetricType.GENDER,
    ]);
    const bodyMetrics = context.bodyMetrics
      .filter((metric) => calculationBodyTypes.has(metric.type))
      .sort((left, right) => left.type.localeCompare(right.type))
      .map((metric) => ({
        type: metric.type,
        value: metric.value,
        reason: metric.reason ?? null,
      }));
    const profile = {
      altitudeOptimizationModel:
        context.profile.altitudeOptimizationModel ?? null,
      altitudeThreshold: context.profile.altitudeThreshold ?? null,
      defaultVdotSource: context.profile.defaultVdotSource ?? null,
      vo2maxCorrectionFactor: context.profile.vo2maxCorrectionFactor ?? null,
      heartRateZoneModel: context.profile.heartRateZoneModel ?? null,
      paceZoneModel: context.profile.paceZoneModel ?? null,
      powerZoneModel: context.profile.powerZoneModel ?? null,
    };
    const contextFingerprint = fitnessTimelineFingerprint({
      version: context.resolutionVersion,
      sport: context.sport,
      analysisConfigFingerprint: context.analysisConfig.fingerprint,
      profile,
      metrics,
      zones,
      bodyMetrics,
    });
    const calculationFingerprint = fitnessTimelineFingerprint({
      version: context.resolutionVersion,
      activityId: context.activityId,
      activityStart: context.activityStart.toISOString(),
      activityEnd: context.activityEnd.toISOString(),
      sport: context.sport,
      inputFingerprint: context.inputFingerprints.overall,
      contextFingerprint,
    });
    const provenanceFingerprint = fitnessTimelineFingerprint({
      calculationFingerprint,
      analysisConfig: {
        versionId: context.analysisConfig.versionId,
        version: context.analysisConfig.version,
        effectiveAt: context.analysisConfig.effectiveAt.toISOString(),
      },
      metrics: Object.fromEntries(
        Object.entries(context.metrics).map(([type, metric]) => [
          type,
          metric
            ? {
                sourceMetricId: metric.sourceMetricId ?? null,
                source: metric.source,
                evidenceFingerprint: metric.evidenceFingerprint,
              }
            : null,
        ]),
      ),
      zones: context.zones.map((zone) => ({
        versionId: zone.versionId,
        effectiveAt: iso(zone.effectiveAt),
        provenanceFingerprint: zone.provenanceFingerprint,
      })),
      bodyMetrics: context.bodyMetrics.map((metric) => ({
        sourceId: metric.sourceId,
        evidenceFingerprint: metric.evidenceFingerprint,
      })),
    });
    return {
      ...context,
      contextFingerprint,
      calculationFingerprint,
      provenanceFingerprint,
    };
  }
}
