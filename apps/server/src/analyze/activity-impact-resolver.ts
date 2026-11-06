import { Injectable } from '@nestjs/common';
import {
  UserFitnessMetricType,
  ZoneType,
  type ActivityFitnessMetricsSnapshot,
} from '@prisma/client';
import type { ResolvedFitnessContext } from './resolved-fitness-context';

export type ActivityMetricDimension =
  | 'HEART_RATE'
  | 'POWER'
  | 'PACE'
  | 'VO2_MAX'
  | 'PROFILE'
  | 'LOAD'
  | 'FULL';

const METRIC_IMPACTS: Partial<
  Record<UserFitnessMetricType, readonly ActivityMetricDimension[]>
> = {
  FTP: ['POWER'],
  CP: ['POWER'],
  W_PRIME: ['POWER'],
  P_MAX: ['POWER'],
  MAX_HR: ['HEART_RATE', 'VO2_MAX'],
  LTHR: ['HEART_RATE'],
  RESTING_HR: ['HEART_RATE'],
  CS: ['PACE'],
  TP: ['PACE'],
  VO2_MAX: ['VO2_MAX'],
};

@Injectable()
export class ActivityImpactResolver {
  dimensionsForFitnessMetrics(
    metrics: readonly UserFitnessMetricType[],
  ): readonly ActivityMetricDimension[] {
    const dimensions = new Set<ActivityMetricDimension>();
    for (const metric of metrics) {
      for (const dimension of METRIC_IMPACTS[metric] ?? ['FULL']) {
        dimensions.add(dimension);
      }
    }
    return [...dimensions].sort();
  }

  dimensionsForContextChange(args: {
    snapshot: Pick<
      ActivityFitnessMetricsSnapshot,
      | 'ftpValue'
      | 'cpValue'
      | 'cpValue2'
      | 'maxHrValue'
      | 'lthrValue'
      | 'restHrValue'
      | 'csValue'
      | 'csValue2'
      | 'provenance'
      | 'inputDimensionFingerprints'
      | 'analysisConfigFingerprint'
      | 'resolvedLoadSources'
    > | null;
    resolved: ResolvedFitnessContext;
  }): readonly ActivityMetricDimension[] {
    if (!args.snapshot) return ['FULL'];
    const dimensions = new Set<ActivityMetricDimension>();
    const inputFingerprints =
      args.snapshot.inputDimensionFingerprints &&
      typeof args.snapshot.inputDimensionFingerprints === 'object' &&
      !Array.isArray(args.snapshot.inputDimensionFingerprints)
        ? (args.snapshot.inputDimensionFingerprints as Record<string, unknown>)
        : {};
    for (const dimension of [
      'HEART_RATE',
      'POWER',
      'PACE',
      'PROFILE',
      'LOAD',
    ] as const) {
      if (
        inputFingerprints[dimension] !==
        args.resolved.inputFingerprints.dimensions[dimension]
      ) {
        dimensions.add(dimension);
      }
    }
    const value = (type: UserFitnessMetricType) =>
      args.resolved.metrics[type]?.value ?? null;
    const value2 = (type: UserFitnessMetricType) =>
      args.resolved.metrics[type]?.value2 ?? null;
    if (
      args.snapshot.maxHrValue !== value(UserFitnessMetricType.MAX_HR) ||
      args.snapshot.lthrValue !== value(UserFitnessMetricType.LTHR) ||
      args.snapshot.restHrValue !== value(UserFitnessMetricType.RESTING_HR)
    ) {
      dimensions.add('HEART_RATE');
    }
    if (
      args.snapshot.ftpValue !== value(UserFitnessMetricType.FTP) ||
      args.snapshot.cpValue !== value(UserFitnessMetricType.CP) ||
      args.snapshot.cpValue2 !==
        (value(UserFitnessMetricType.W_PRIME) ??
          value2(UserFitnessMetricType.CP))
    ) {
      dimensions.add('POWER');
    }
    if (
      args.snapshot.csValue !== value(UserFitnessMetricType.CS) ||
      args.snapshot.csValue2 !== value2(UserFitnessMetricType.CS)
    ) {
      dimensions.add('PACE');
    }

    const provenance =
      args.snapshot.provenance &&
      typeof args.snapshot.provenance === 'object' &&
      !Array.isArray(args.snapshot.provenance)
        ? (args.snapshot.provenance as Record<string, unknown>)
        : {};
    const oldMetrics =
      provenance.metrics &&
      typeof provenance.metrics === 'object' &&
      !Array.isArray(provenance.metrics)
        ? (provenance.metrics as Record<
            string,
            { value?: unknown; value2?: unknown }
          >)
        : null;
    const finiteOrNull = (input: unknown) =>
      typeof input === 'number' && Number.isFinite(input) ? input : null;
    if (oldMetrics) {
      const changed = (type: UserFitnessMetricType) => {
        const previous = oldMetrics[type];
        return (
          finiteOrNull(previous?.value) !== value(type) ||
          finiteOrNull(previous?.value2) !== value2(type)
        );
      };
      if (
        changed(UserFitnessMetricType.P_MAX) ||
        changed(UserFitnessMetricType.W_PRIME)
      ) {
        dimensions.add('POWER');
      }
      if (changed(UserFitnessMetricType.TP)) dimensions.add('PACE');
      if (changed(UserFitnessMetricType.VO2_MAX)) dimensions.add('VO2_MAX');
    }
    const oldZones = Array.isArray(provenance.zones)
      ? (provenance.zones as Array<Record<string, unknown>>)
      : [];
    for (const zone of args.resolved.zones) {
      const previous = oldZones.find(
        (candidate) =>
          candidate.zoneType === zone.zoneType &&
          candidate.sport === zone.sport,
      );
      if (previous?.calculationFingerprint === zone.calculationFingerprint) {
        continue;
      }
      if (zone.zoneType === ZoneType.HEART_RATE) dimensions.add('HEART_RATE');
      if (zone.zoneType === ZoneType.POWER) dimensions.add('POWER');
      if (zone.zoneType === ZoneType.PACE) dimensions.add('PACE');
    }
    const oldBody = Array.isArray(provenance.bodyMetrics)
      ? provenance.bodyMetrics
      : [];
    if (JSON.stringify(oldBody) !== JSON.stringify(args.resolved.bodyMetrics)) {
      dimensions.add('PROFILE');
    }
    const oldLoadSources = Array.isArray(args.snapshot.resolvedLoadSources)
      ? args.snapshot.resolvedLoadSources
      : [];
    if (
      JSON.stringify(oldLoadSources) !==
      JSON.stringify(args.resolved.analysisConfig.loadSources)
    ) {
      dimensions.add('LOAD');
    }
    if (
      args.snapshot.analysisConfigFingerprint !==
        args.resolved.analysisConfig.fingerprint &&
      dimensions.size === 0
    ) {
      dimensions.add('PROFILE');
    }
    return dimensions.size > 0 ? [...dimensions].sort() : ['FULL'];
  }

  shouldReadHighFrequencyData(args: {
    previousCalculationFingerprint?: string | null;
    nextCalculationFingerprint: string;
  }) {
    return (
      !args.previousCalculationFingerprint ||
      args.previousCalculationFingerprint !== args.nextCalculationFingerprint
    );
  }

  shouldRecomputePmc(args: {
    previousLoad: number | null | undefined;
    nextLoad: number | null | undefined;
  }) {
    if (args.previousLoad == null && args.nextLoad == null) return false;
    if (args.previousLoad == null || args.nextLoad == null) return true;
    return Math.abs(args.previousLoad - args.nextLoad) > 0.0001;
  }
}
