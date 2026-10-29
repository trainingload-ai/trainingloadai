import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import type {
  EnduranceWorkoutStepTarget,
  PrescriptionResolutionMode,
  WorkoutIntensityIntent,
} from '@shared/endurance-workout-ir';

export type PrescriptionSport = 'RUN' | 'CYCLING' | 'SWIM';
export type PrescriptionTargetDimension = 'PACE' | 'HEART_RATE' | 'POWER';

export type PrescriptionZoneSetting = {
  benchmark?: string | null;
  zones?: Array<{
    order?: number | null;
    name?: string | null;
    min?: number | null;
    max?: number | null;
  }>;
};

export type FixedPrescriptionTarget = {
  low: number;
  high?: number;
  unit: 'SECONDS' | 'KMH' | 'BPM' | 'WATTS';
  source: string;
};

export type ResolveWorkoutPrescriptionInput = {
  sportType: PrescriptionSport;
  dimension: PrescriptionTargetDimension;
  intent: WorkoutIntensityIntent;
  zoneSetting?: PrescriptionZoneSetting | null;
  zoneIndex?: number | null;
  fixedTarget?: FixedPrescriptionTarget | null;
  allowFixedTarget?: boolean;
  auxiliaryRpe?: { low: number; high?: number } | null;
};

export type ResolvedWorkoutPrescription = {
  mode: PrescriptionResolutionMode;
  target: EnduranceWorkoutStepTarget | null;
  zoneSystemKey: string | null;
  zoneFingerprint: string | null;
  auxiliaryRpe: { low: number; high?: number } | null;
  explanation: {
    source: 'ZONE' | 'FIXED' | 'EFFORT';
    dimension: PrescriptionTargetDimension;
    summary: string;
  };
};

export class WorkoutPrescriptionError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_ZONE_INDEX'
      | 'INVALID_ZONE_RANGE'
      | 'INVALID_FIXED_TARGET'
      | 'FIXED_TARGET_NOT_ALLOWED',
    message: string,
  ) {
    super(message);
    this.name = 'WorkoutPrescriptionError';
  }
}

function finitePositive(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

@Injectable()
export class WorkoutPrescriptionService {
  zoneIdentity(input: {
    sportType: PrescriptionSport;
    dimension: PrescriptionTargetDimension;
    setting: PrescriptionZoneSetting;
  }): { systemKey: string; fingerprint: string } {
    const zones = this.normalizedZones(input.setting);
    const identity = {
      sportType: input.sportType,
      dimension: input.dimension,
      benchmark: input.setting.benchmark ?? 'CUSTOM',
      zoneCount: zones.length,
      orderedNames: zones.map((zone) => zone.name || `Z${zone.order}`),
    };
    return {
      systemKey: hash(identity),
      fingerprint: hash({
        ...identity,
        zones: zones.map(({ order, name, min, max }) => ({
          order,
          name,
          min,
          max,
        })),
      }),
    };
  }

  resolve(input: ResolveWorkoutPrescriptionInput): ResolvedWorkoutPrescription {
    const intensityIntent: WorkoutIntensityIntent = {
      ...input.intent,
      ...(input.auxiliaryRpe
        ? { auxiliaryRpe: { ...input.auxiliaryRpe } }
        : {}),
    };
    const zones = input.zoneSetting
      ? this.normalizedZones(input.zoneSetting)
      : [];
    if (input.zoneIndex != null) {
      if (!Number.isInteger(input.zoneIndex) || input.zoneIndex <= 0) {
        throw new WorkoutPrescriptionError(
          'INVALID_ZONE_INDEX',
          'zoneIndex must be a positive integer',
        );
      }
      const zone =
        zones.find((candidate) => candidate.order === input.zoneIndex) ??
        zones[input.zoneIndex - 1];
      if (!zone) {
        throw new WorkoutPrescriptionError(
          'INVALID_ZONE_INDEX',
          `Zone Z${input.zoneIndex} does not exist for ${input.dimension}`,
        );
      }
      const low = finitePositive(zone.min);
      const high = finitePositive(zone.max);
      if (low == null && high == null) {
        throw new WorkoutPrescriptionError(
          'INVALID_ZONE_RANGE',
          `Zone Z${input.zoneIndex} has no executable range`,
        );
      }
      const identity = this.zoneIdentity({
        sportType: input.sportType,
        dimension: input.dimension,
        setting: input.zoneSetting!,
      });
      const range = this.toTargetRange(input.sportType, input.dimension, {
        low,
        high,
      });
      const target = this.zoneTarget({
        dimension: input.dimension,
        zoneIndex: input.zoneIndex,
        zoneLabel: zone.name || `Z${input.zoneIndex}`,
        benchmark: input.zoneSetting?.benchmark,
        range,
        intent: intensityIntent,
        systemKey: identity.systemKey,
        fingerprint: identity.fingerprint,
      });
      return {
        mode: 'DYNAMIC_ZONE',
        target,
        zoneSystemKey: identity.systemKey,
        zoneFingerprint: identity.fingerprint,
        auxiliaryRpe: input.auxiliaryRpe ?? null,
        explanation: {
          source: 'ZONE',
          dimension: input.dimension,
          summary: `${input.dimension} ${target.zoneLabel} is backed by the athlete's current zone setting`,
        },
      };
    }

    if (input.fixedTarget) {
      if (!input.allowFixedTarget) {
        throw new WorkoutPrescriptionError(
          'FIXED_TARGET_NOT_ALLOWED',
          'Fixed targets require a protocol-specific or evidence-backed reason',
        );
      }
      const target = this.fixedTarget(
        input.dimension,
        input.fixedTarget,
        intensityIntent,
      );
      return {
        mode: 'FIXED_VALUE',
        target,
        zoneSystemKey: null,
        zoneFingerprint: null,
        auxiliaryRpe: input.auxiliaryRpe ?? null,
        explanation: {
          source: 'FIXED',
          dimension: input.dimension,
          summary: `${input.dimension} uses an evidence-backed fixed range from ${input.fixedTarget.source}`,
        },
      };
    }

    return {
      mode: 'EFFORT_ONLY',
      target: {
        kind: 'NONE',
        intensityIntent,
        resolutionMode: 'EFFORT_ONLY',
      },
      zoneSystemKey: null,
      zoneFingerprint: null,
      auxiliaryRpe: input.auxiliaryRpe ?? null,
      explanation: {
        source: 'EFFORT',
        dimension: input.dimension,
        summary:
          'No reliable executable zone or fixed anchor is available; use effort cues only',
      },
    };
  }

  private normalizedZones(setting: PrescriptionZoneSetting) {
    return (Array.isArray(setting.zones) ? setting.zones : [])
      .map((zone, index) => ({
        order:
          Number.isInteger(zone.order) && Number(zone.order) > 0
            ? Number(zone.order)
            : index + 1,
        name: String(zone.name ?? '').trim(),
        min: finitePositive(zone.min),
        max: finitePositive(zone.max),
      }))
      .sort((left, right) => left.order - right.order);
  }

  private toTargetRange(
    sportType: PrescriptionSport,
    dimension: PrescriptionTargetDimension,
    range: { low?: number; high?: number },
  ) {
    if (dimension !== 'PACE') return range;
    const scale = sportType === 'SWIM' ? 100 : 1000;
    const project = (value: number | undefined) =>
      value == null
        ? undefined
        : Math.round(value * scale * 1_000_000) / 1_000_000;
    return {
      low: project(range.low),
      high: project(range.high),
    };
  }

  private zoneTarget(args: {
    dimension: PrescriptionTargetDimension;
    zoneIndex: number;
    zoneLabel: string;
    benchmark?: string | null;
    range: { low?: number; high?: number };
    intent: WorkoutIntensityIntent;
    systemKey: string;
    fingerprint: string;
  }): EnduranceWorkoutStepTarget {
    return {
      kind:
        args.dimension === 'PACE'
          ? 'SPEED'
          : args.dimension === 'HEART_RATE'
            ? 'HEART_RATE_ZONE'
            : 'POWER_ZONE',
      value: args.range.low,
      valueHigh: args.range.high,
      zoneIndex: args.zoneIndex,
      zoneLabel: args.zoneLabel,
      zoneSystem: args.benchmark ?? 'CUSTOM',
      zoneSource: 'TRAININGLOAD',
      zoneBasis: {
        benchmark: args.benchmark ?? 'CUSTOM',
        targetLow: args.range.low,
        targetHigh: args.range.high,
      },
      unit:
        args.dimension === 'PACE'
          ? 'seconds'
          : args.dimension === 'HEART_RATE'
            ? 'bpm'
            : 'W',
      intensityIntent: args.intent,
      resolutionMode: 'DYNAMIC_ZONE',
      zoneSystemKey: args.systemKey,
      zoneFingerprint: args.fingerprint,
    };
  }

  private fixedTarget(
    dimension: PrescriptionTargetDimension,
    fixed: FixedPrescriptionTarget,
    intent: WorkoutIntensityIntent,
  ): EnduranceWorkoutStepTarget {
    const low = finitePositive(fixed.low);
    const high = finitePositive(fixed.high ?? fixed.low);
    if (low == null || high == null || high < low) {
      throw new WorkoutPrescriptionError(
        'INVALID_FIXED_TARGET',
        'Fixed target must have a positive ordered range',
      );
    }
    const expectedUnits: Record<PrescriptionTargetDimension, string[]> = {
      PACE: ['SECONDS', 'KMH'],
      HEART_RATE: ['BPM'],
      POWER: ['WATTS'],
    };
    if (!expectedUnits[dimension].includes(fixed.unit)) {
      throw new WorkoutPrescriptionError(
        'INVALID_FIXED_TARGET',
        `${fixed.unit} is not valid for ${dimension}`,
      );
    }
    return {
      kind:
        dimension === 'PACE'
          ? 'SPEED'
          : dimension === 'HEART_RATE'
            ? 'HEART_RATE_CUSTOM'
            : 'POWER_CUSTOM',
      value: low,
      valueHigh: high,
      unit:
        fixed.unit === 'BPM'
          ? 'bpm'
          : fixed.unit === 'WATTS'
            ? 'W'
            : fixed.unit === 'KMH'
              ? 'km/h'
              : 'seconds',
      zoneSource: fixed.source,
      intensityIntent: intent,
      resolutionMode: 'FIXED_VALUE',
    };
  }
}
