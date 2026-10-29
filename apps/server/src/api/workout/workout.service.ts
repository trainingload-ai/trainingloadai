import { Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { I18nService } from 'nestjs-i18n';
import {
  averageExpressionSpeedAsKmh,
  getExpressionSpeedUnitForSport,
  normalizeExpressionSpeedUnit,
  parseTargetValueWithUnit,
  type WorkoutExpressionSportType,
  type WorkoutExpressionSpeedUnit,
} from './workout-expression-codec';
import type {
  PrescriptionResolutionMode,
  WorkoutIntensityIntent,
} from '@shared/endurance-workout-ir';

export type BlockType = 'work' | 'rest' | 'repeat';

export type ZoneBasisSnapshot = Record<string, unknown>;

export interface WorkRestStep {
  duration: number;
  power?: number; // ratio 0..1 when % or no unit
  powerWatts?: number; // watts when unit W
  cadence?: number; // rpm
  heartRatePercent?: number; // %
  heartRateBpm?: number; // bpm
  paceKmh?: number; // km/h
  gradeDeg?: number; // °
  stepKind?: 'WARMUP' | 'WORK' | 'RECOVERY' | 'REST' | 'COOLDOWN' | 'OTHER';
  durationMeta?: {
    kind:
      | 'TIME'
      | 'DISTANCE'
      | 'OPEN'
      | 'CALORIES'
      | 'HR_LESS_THAN'
      | 'HR_GREATER_THAN'
      | 'POWER_LESS_THAN'
      | 'POWER_GREATER_THAN'
      | 'CADENCE_LESS_THAN'
      | 'CADENCE_GREATER_THAN';
    value?: number;
    unit?: 'SECONDS' | 'KILOMETERS' | 'METERS' | 'KJ' | 'BPM' | 'WATTS' | 'RPM';
  } | null;
  swimMeta?: {
    stroke?:
      | 'FREESTYLE'
      | 'BREASTSTROKE'
      | 'BACKSTROKE'
      | 'BUTTERFLY'
      | 'DRILL'
      | 'MEDLEY';
    trainingType?: 'KICK' | 'PULL' | 'DRILL';
    equipment?: 'FINS' | 'KICKBOARD' | 'PADDLES' | 'PULL_BUOY' | 'SNORKEL';
  } | null;
  primaryTargetMeta?: {
    kind:
      | 'NONE'
      | 'SPEED'
      | 'CADENCE'
      | 'HEART_RATE_ZONE'
      | 'HEART_RATE_CUSTOM'
      | 'POWER_ZONE'
      | 'POWER_CUSTOM';
    value?: number;
    valueHigh?: number;
    zoneIndex?: number;
    zoneLabel?: string;
    zoneSystem?: string;
    zoneSource?: string;
    zoneBasis?: ZoneBasisSnapshot | null;
    intensityIntent?: WorkoutIntensityIntent | null;
    resolutionMode?: PrescriptionResolutionMode;
    zoneSystemKey?: string;
    zoneFingerprint?: string;
    unit?: string;
  } | null;
  secondaryTarget?: {
    kind:
      | 'NONE'
      | 'SPEED'
      | 'CADENCE'
      | 'HEART_RATE_ZONE'
      | 'HEART_RATE_CUSTOM'
      | 'POWER_ZONE'
      | 'POWER_CUSTOM';
    value?: number;
    valueHigh?: number;
    zoneIndex?: number;
    zoneLabel?: string;
    zoneSystem?: string;
    zoneSource?: string;
    zoneBasis?: ZoneBasisSnapshot | null;
    intensityIntent?: WorkoutIntensityIntent | null;
    resolutionMode?: PrescriptionResolutionMode;
    zoneSystemKey?: string;
    zoneFingerprint?: string;
    unit?: string;
  } | null;
}

export interface WorkRestBlock {
  type: 'work' | 'rest';
  steps: WorkRestStep[];
}

export interface RepeatBlock {
  type: 'repeat';
  count: number;
  until?: {
    kind:
      | 'TIME'
      | 'DISTANCE'
      | 'CALORIES'
      | 'HR_LESS_THAN'
      | 'HR_GREATER_THAN'
      | 'POWER_LESS_THAN'
      | 'POWER_GREATER_THAN'
      | 'CADENCE_LESS_THAN'
      | 'CADENCE_GREATER_THAN';
    value: number;
    unit: 'SECONDS' | 'METERS' | 'CALORIES' | 'BPM' | 'WATTS' | 'RPM';
  };
  children: WorkRestBlock[];
}

export type PlanBlock = WorkRestBlock | RepeatBlock;

type WorkoutStepTreeRow = {
  stepType?: string | null;
  intensity?: string | null;
  durationType?: string | null;
  durationValue?: number | null;
  durationUnit?: string | null;
  targetType?: string | null;
  targetValueLow?: number | null;
  targetValueHigh?: number | null;
  targetZoneIndex?: number | null;
  targetZoneLabel?: string | null;
  targetZoneSystem?: string | null;
  targetZoneSource?: string | null;
  targetZoneBasis?: ZoneBasisSnapshot | null;
  intensityIntent?: WorkoutIntensityIntent | null;
  targetResolutionMode?: PrescriptionResolutionMode | null;
  targetZoneSystemKey?: string | null;
  targetZoneFingerprint?: string | null;
  targetUnit?: string | null;
  children?: WorkoutStepTreeRow[];
};

type GarminFitEncoderCompat = {
  finish?: () => unknown;
  close?: () => Uint8Array;
  bytes?: Uint8Array;
  getBytes?: () => Uint8Array;
};

type FitWorkoutStepMesg = {
  mesgNum: number;
  messageIndex: number;
  intensity: string;
  durationType?: string;
  durationTime?: number;
  durationDistance?: number;
  durationCalories?: number;
  durationHr?: number;
  durationPower?: number;
  targetType?: string;
  customTargetPowerLow?: number;
  customTargetPowerHigh?: number;
  customTargetHeartRateLow?: number;
  customTargetHeartRateHigh?: number;
  customTargetSpeedLow?: number;
  customTargetSpeedHigh?: number;
  customTargetCadenceLow?: number;
  customTargetCadenceHigh?: number;
  customTargetValueLow?: number;
  customTargetValueHigh?: number;
  targetHrZone?: number;
  targetPowerZone?: number;
  durationStep?: number;
  repeatSteps?: number;
};

function isFitRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function fitNumber(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

export type WorkoutPlanStepDraft = {
  stepType: 'WORK' | 'REST' | 'REPEAT';
  orderIndex: number;
  name?: string | null;
  notes?: string | null;
  intensity?:
    | 'ACTIVE'
    | 'REST'
    | 'WARMUP'
    | 'COOLDOWN'
    | 'RECOVERY'
    | 'INTERVAL'
    | 'OTHER'
    | null;
  durationType:
    | 'TIME'
    | 'DISTANCE'
    | 'OPEN'
    | 'CALORIES'
    | 'HR_LESS_THAN'
    | 'HR_GREATER_THAN'
    | 'POWER_LESS_THAN'
    | 'POWER_GREATER_THAN'
    | 'CADENCE_LESS_THAN'
    | 'CADENCE_GREATER_THAN'
    | 'REPEAT_COUNT'
    | 'REPEAT_UNTIL_TIME'
    | 'REPEAT_UNTIL_DISTANCE'
    | 'REPEAT_UNTIL_CALORIES'
    | 'REPEAT_UNTIL_HR_LESS_THAN'
    | 'REPEAT_UNTIL_HR_GREATER_THAN'
    | 'REPEAT_UNTIL_POWER_LESS_THAN'
    | 'REPEAT_UNTIL_POWER_GREATER_THAN'
    | 'REPEAT_UNTIL_CADENCE_LESS_THAN'
    | 'REPEAT_UNTIL_CADENCE_GREATER_THAN';
  durationValue?: number | null;
  durationUnit?:
    | 'SECONDS'
    | 'METERS'
    | 'CALORIES'
    | 'COUNT'
    | 'WATTS'
    | 'PERCENT'
    | 'BPM'
    | 'RPM'
    | 'KMH'
    | 'DEGREE'
    | null;
  targetType?:
    | 'OPEN'
    | 'POWER'
    | 'HEART_RATE'
    | 'CADENCE'
    | 'SPEED'
    | 'GRADE'
    | null;
  targetValueLow?: number | null;
  targetValueHigh?: number | null;
  targetZoneIndex?: number | null;
  targetZoneLabel?: string | null;
  targetZoneSystem?: string | null;
  targetZoneSource?: string | null;
  targetZoneBasis?: ZoneBasisSnapshot | null;
  intensityIntent?: WorkoutIntensityIntent | null;
  targetResolutionMode?: PrescriptionResolutionMode | null;
  targetZoneSystemKey?: string | null;
  targetZoneFingerprint?: string | null;
  targetUnit?:
    | 'SECONDS'
    | 'METERS'
    | 'CALORIES'
    | 'COUNT'
    | 'WATTS'
    | 'PERCENT'
    | 'BPM'
    | 'RPM'
    | 'KMH'
    | 'DEGREE'
    | null;
  children?: WorkoutPlanStepDraft[];
};

@Injectable()
export class WorkoutService {
  private readonly logger = new Logger(WorkoutService.name);

  constructor(private readonly i18n: I18nService) {}

  async parseFile(
    buffer: Buffer,
  ): Promise<{ block: PlanBlock[]; plan: string }> {
    // FIT 上传只接受 workout 文件；解析后统一转成内部 PlanBlock，再生成可编辑 DSL 文本。
    if (!buffer?.length) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.file_content_empty'),
      });
    }
    const { Decoder, Stream } = await import('@garmin/fitsdk');

    const stream = Stream.fromBuffer(buffer);
    if (!Decoder.isFIT(stream)) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.not_valid_fit_file'),
      });
    }

    const decoder = new Decoder(stream) as {
      read: () => { messages?: unknown; errors?: unknown[] };
    };
    const decoded = decoder.read();
    const messages = decoded?.messages;
    const errors = Array.isArray(decoded?.errors) ? decoded.errors : [];
    if (errors && errors.length > 0) {
      this.logger.warn(`FIT 解析告警：${JSON.stringify(errors)}`);
    }
    // Only parse FIT files of workout type
    const isWorkout = this.isWorkoutFIT(messages);
    if (!isWorkout) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.fit_file_no_workout_data'),
      });
    }

    // Sort steps by messageIndex
    const workoutSteps = isFitRecord(messages)
      ? messages.workoutStepMesgs
      : undefined;
    const steps: unknown[] = Array.isArray(workoutSteps)
      ? [...workoutSteps]
      : [];
    steps.sort((a, b) => {
      const left = isFitRecord(a) ? a : {};
      const right = isFitRecord(b) ? b : {};
      const ai = typeof left.messageIndex === 'number' ? left.messageIndex : 0;
      const bi =
        typeof right.messageIndex === 'number' ? right.messageIndex : 0;
      return ai - bi;
    });
    const block = this.mapFITStepsToPlan(steps);
    return {
      block,
      plan: this.stringifyPlan(block),
    };
  }

  buildWorkoutPlanSteps(blocks: PlanBlock[]): WorkoutPlanStepDraft[] {
    // PlanBlock 是 DSL/前端编辑器格式；PlanWorkoutStepDraft 是数据库 step 树写入格式。
    const topLevel: WorkoutPlanStepDraft[] = [];
    let topOrderIndex = 0;

    const mapStep = (
      stepType: 'WORK' | 'REST',
      step: WorkRestStep,
      orderIndex: number,
    ): WorkoutPlanStepDraft => {
      const primary = step.primaryTargetMeta;
      const stepIntensity =
        step.stepKind === 'WARMUP'
          ? 'WARMUP'
          : step.stepKind === 'COOLDOWN'
            ? 'COOLDOWN'
            : step.stepKind === 'RECOVERY'
              ? 'RECOVERY'
              : step.stepKind === 'REST'
                ? 'REST'
                : step.stepKind === 'OTHER'
                  ? 'OTHER'
                  : stepType === 'REST'
                    ? 'REST'
                    : 'ACTIVE';
      const durationType =
        step.durationMeta?.kind === 'DISTANCE'
          ? 'DISTANCE'
          : step.durationMeta?.kind === 'OPEN'
            ? 'OPEN'
            : step.durationMeta?.kind === 'CALORIES'
              ? 'CALORIES'
              : step.durationMeta?.kind === 'HR_LESS_THAN'
                ? 'HR_LESS_THAN'
                : step.durationMeta?.kind === 'HR_GREATER_THAN'
                  ? 'HR_GREATER_THAN'
                  : step.durationMeta?.kind === 'POWER_LESS_THAN'
                    ? 'POWER_LESS_THAN'
                    : step.durationMeta?.kind === 'POWER_GREATER_THAN'
                      ? 'POWER_GREATER_THAN'
                      : step.durationMeta?.kind === 'CADENCE_LESS_THAN'
                        ? 'CADENCE_LESS_THAN'
                        : step.durationMeta?.kind === 'CADENCE_GREATER_THAN'
                          ? 'CADENCE_GREATER_THAN'
                          : 'TIME';
      const durationUnit =
        step.durationMeta?.unit === 'METERS'
          ? 'METERS'
          : step.durationMeta?.unit === 'KILOMETERS'
            ? 'METERS'
            : step.durationMeta?.unit === 'KJ'
              ? 'CALORIES'
              : step.durationMeta?.unit === 'BPM'
                ? 'BPM'
                : step.durationMeta?.unit === 'WATTS'
                  ? 'WATTS'
                  : step.durationMeta?.unit === 'RPM'
                    ? 'RPM'
                    : durationType === 'OPEN'
                      ? null
                      : 'SECONDS';
      const durationValue =
        typeof step.durationMeta?.value === 'number'
          ? step.durationMeta.unit === 'KILOMETERS'
            ? step.durationMeta.value * 1000
            : step.durationMeta.value
          : durationType === 'OPEN'
            ? null
            : step.duration;

      if (primary && primary.kind !== 'NONE') {
        const targetType =
          primary.kind === 'SPEED'
            ? 'SPEED'
            : primary.kind === 'CADENCE'
              ? 'CADENCE'
              : primary.kind === 'HEART_RATE_ZONE' ||
                  primary.kind === 'HEART_RATE_CUSTOM'
                ? 'HEART_RATE'
                : primary.kind === 'POWER_ZONE' ||
                    primary.kind === 'POWER_CUSTOM'
                  ? 'POWER'
                  : 'OPEN';
        const targetUnit =
          primary.kind === 'SPEED'
            ? 'SECONDS'
            : primary.kind === 'CADENCE'
              ? 'RPM'
              : primary.kind === 'HEART_RATE_CUSTOM'
                ? 'BPM'
                : primary.kind === 'HEART_RATE_ZONE'
                  ? primary.unit === 'bpm'
                    ? 'BPM'
                    : 'PERCENT'
                  : primary.kind === 'POWER_CUSTOM'
                    ? 'WATTS'
                    : primary.kind === 'POWER_ZONE'
                      ? primary.unit === 'W'
                        ? 'WATTS'
                        : 'PERCENT'
                      : null;

        return {
          stepType,
          orderIndex,
          intensity: stepIntensity,
          durationType,
          durationValue,
          durationUnit,
          targetType,
          targetValueLow: primary.value ?? null,
          targetValueHigh:
            typeof primary.valueHigh === 'number' ? primary.valueHigh : null,
          targetZoneIndex:
            typeof primary.zoneIndex === 'number' ? primary.zoneIndex : null,
          targetZoneLabel: primary.zoneLabel ?? null,
          targetZoneSystem: primary.zoneSystem ?? null,
          targetZoneSource: primary.zoneSource ?? null,
          targetZoneBasis: primary.zoneBasis ?? null,
          intensityIntent: primary.intensityIntent ?? null,
          targetResolutionMode: primary.resolutionMode ?? null,
          targetZoneSystemKey: primary.zoneSystemKey ?? null,
          targetZoneFingerprint: primary.zoneFingerprint ?? null,
          targetUnit,
        };
      }

      return {
        stepType,
        orderIndex,
        intensity: stepIntensity,
        durationType,
        durationValue,
        durationUnit,
        targetType:
          step.powerWatts != null || step.power != null
            ? 'POWER'
            : step.heartRateBpm != null || step.heartRatePercent != null
              ? 'HEART_RATE'
              : step.cadence != null
                ? 'CADENCE'
                : step.paceKmh != null
                  ? 'SPEED'
                  : step.gradeDeg != null
                    ? 'GRADE'
                    : 'OPEN',
        targetValueLow:
          step.powerWatts ??
          (typeof step.power === 'number' ? step.power * 100 : undefined) ??
          step.heartRateBpm ??
          step.heartRatePercent ??
          step.cadence ??
          step.paceKmh ??
          step.gradeDeg ??
          null,
        targetValueHigh:
          step.powerWatts ??
          (typeof step.power === 'number' ? step.power * 100 : undefined) ??
          step.heartRateBpm ??
          step.heartRatePercent ??
          step.cadence ??
          step.paceKmh ??
          step.gradeDeg ??
          null,
        targetZoneIndex: null,
        targetZoneLabel: null,
        targetZoneSystem: null,
        targetZoneSource: null,
        targetZoneBasis: null,
        intensityIntent: primary?.intensityIntent ?? null,
        targetResolutionMode: primary?.resolutionMode ?? null,
        targetZoneSystemKey: primary?.zoneSystemKey ?? null,
        targetZoneFingerprint: primary?.zoneFingerprint ?? null,
        targetUnit:
          step.powerWatts != null
            ? 'WATTS'
            : step.power != null
              ? 'PERCENT'
              : step.heartRateBpm != null
                ? 'BPM'
                : step.heartRatePercent != null
                  ? 'PERCENT'
                  : step.cadence != null
                    ? 'RPM'
                    : step.paceKmh != null
                      ? 'KMH'
                      : step.gradeDeg != null
                        ? 'DEGREE'
                        : null,
      };
    };

    for (const block of blocks) {
      if (block.type === 'repeat') {
        let childOrderIndex = 0;
        const children: WorkoutPlanStepDraft[] = [];
        for (const child of block.children) {
          const stepType = child.type === 'rest' ? 'REST' : 'WORK';
          for (const step of child.steps) {
            children.push(mapStep(stepType, step, childOrderIndex++));
          }
        }
        const repeatDurationType = block.until
          ? (`REPEAT_UNTIL_${block.until.kind}` as WorkoutPlanStepDraft['durationType'])
          : 'REPEAT_COUNT';
        topLevel.push({
          stepType: 'REPEAT',
          orderIndex: topOrderIndex++,
          intensity: 'OTHER',
          durationType: repeatDurationType,
          durationValue: block.until?.value ?? block.count,
          durationUnit: block.until?.unit ?? 'COUNT',
          children,
        });
        continue;
      }

      const stepType = block.type === 'rest' ? 'REST' : 'WORK';
      for (const step of block.steps) {
        topLevel.push(mapStep(stepType, step, topOrderIndex++));
      }
    }

    return topLevel;
  }

  buildPlanBlocksFromWorkoutSteps(
    rows: WorkoutStepTreeRow[],
    sportType?: WorkoutExpressionSportType,
  ): PlanBlock[] {
    // 从数据库 step 树反向恢复 PlanBlock，供详情页展示、编辑和导出时复用。
    const buildStep = (row: {
      intensity?: string | null;
      durationType?: string | null;
      durationValue?: number | null;
      durationUnit?: string | null;
      targetType?: string | null;
      targetValueLow?: number | null;
      targetValueHigh?: number | null;
      targetZoneIndex?: number | null;
      targetZoneLabel?: string | null;
      targetZoneSystem?: string | null;
      targetZoneSource?: string | null;
      targetZoneBasis?: ZoneBasisSnapshot | null;
      intensityIntent?: WorkoutIntensityIntent | null;
      targetResolutionMode?: PrescriptionResolutionMode | null;
      targetZoneSystemKey?: string | null;
      targetZoneFingerprint?: string | null;
      targetUnit?: string | null;
    }): WorkRestStep => {
      const speedUnit = getExpressionSpeedUnitForSport(sportType);
      const stepKind =
        row.intensity === 'WARMUP'
          ? 'WARMUP'
          : row.intensity === 'COOLDOWN'
            ? 'COOLDOWN'
            : row.intensity === 'RECOVERY'
              ? 'RECOVERY'
              : row.intensity === 'REST'
                ? 'REST'
                : row.intensity === 'OTHER'
                  ? 'OTHER'
                  : 'WORK';
      const step: WorkRestStep = {
        duration:
          row.durationType === 'TIME'
            ? Math.max(0, Math.floor(Number(row.durationValue ?? 0) || 0))
            : 0,
        stepKind,
        durationMeta: {
          kind:
            row.durationType === 'DISTANCE'
              ? 'DISTANCE'
              : row.durationType === 'OPEN'
                ? 'OPEN'
                : row.durationType === 'CALORIES'
                  ? 'CALORIES'
                  : row.durationType === 'HR_LESS_THAN'
                    ? 'HR_LESS_THAN'
                    : row.durationType === 'HR_GREATER_THAN'
                      ? 'HR_GREATER_THAN'
                      : row.durationType === 'POWER_LESS_THAN'
                        ? 'POWER_LESS_THAN'
                        : row.durationType === 'POWER_GREATER_THAN'
                          ? 'POWER_GREATER_THAN'
                          : row.durationType === 'CADENCE_LESS_THAN'
                            ? 'CADENCE_LESS_THAN'
                            : row.durationType === 'CADENCE_GREATER_THAN'
                              ? 'CADENCE_GREATER_THAN'
                              : 'TIME',
          value: row.durationValue ?? undefined,
          unit:
            row.durationUnit === 'METERS'
              ? 'METERS'
              : row.durationUnit === 'CALORIES'
                ? 'KJ'
                : row.durationUnit === 'BPM'
                  ? 'BPM'
                  : row.durationUnit === 'WATTS'
                    ? 'WATTS'
                    : row.durationUnit === 'RPM'
                      ? 'RPM'
                      : 'SECONDS',
        },
      };
      const zoneMeta = {
        zoneIndex: row.targetZoneIndex ?? undefined,
        zoneLabel: row.targetZoneLabel ?? undefined,
        zoneSystem: row.targetZoneSystem ?? undefined,
        zoneSource: row.targetZoneSource ?? undefined,
        zoneBasis: row.targetZoneBasis ?? undefined,
        intensityIntent: row.intensityIntent ?? undefined,
        resolutionMode: row.targetResolutionMode ?? undefined,
        zoneSystemKey: row.targetZoneSystemKey ?? undefined,
        zoneFingerprint: row.targetZoneFingerprint ?? undefined,
      };
      const hasZoneReference =
        typeof row.targetZoneIndex === 'number' ||
        Boolean(row.targetZoneSource);

      if (row.targetType === 'POWER' && row.targetUnit === 'PERCENT') {
        step.power =
          typeof row.targetValueLow === 'number'
            ? row.targetValueLow / 100
            : undefined;
        step.primaryTargetMeta = {
          kind: 'POWER_ZONE',
          value: row.targetValueLow ?? undefined,
          valueHigh: row.targetValueHigh ?? undefined,
          ...zoneMeta,
          unit: '%',
        };
      } else if (row.targetType === 'POWER' && row.targetUnit === 'WATTS') {
        step.powerWatts =
          row.targetValueLow ?? row.targetValueHigh ?? undefined;
        step.primaryTargetMeta = {
          kind: hasZoneReference ? 'POWER_ZONE' : 'POWER_CUSTOM',
          value: row.targetValueLow ?? undefined,
          valueHigh: row.targetValueHigh ?? undefined,
          ...zoneMeta,
          unit: 'W',
        };
      } else if (row.targetType === 'CADENCE' && row.targetUnit === 'RPM') {
        step.cadence = row.targetValueLow ?? row.targetValueHigh ?? undefined;
        step.primaryTargetMeta = {
          kind: 'CADENCE',
          value: row.targetValueLow ?? undefined,
          valueHigh: row.targetValueHigh ?? undefined,
          ...zoneMeta,
          unit: 'rpm',
        };
      } else if (
        row.targetType === 'HEART_RATE' &&
        row.targetUnit === 'PERCENT'
      ) {
        step.heartRatePercent = row.targetValueLow ?? undefined;
        step.primaryTargetMeta = {
          kind: 'HEART_RATE_ZONE',
          value: row.targetValueLow ?? undefined,
          valueHigh: row.targetValueHigh ?? undefined,
          ...zoneMeta,
          unit: '%',
        };
      } else if (row.targetType === 'HEART_RATE' && row.targetUnit === 'BPM') {
        step.heartRateBpm =
          row.targetValueLow ?? row.targetValueHigh ?? undefined;
        step.primaryTargetMeta = {
          kind: hasZoneReference ? 'HEART_RATE_ZONE' : 'HEART_RATE_CUSTOM',
          value: row.targetValueLow ?? undefined,
          valueHigh: row.targetValueHigh ?? undefined,
          ...zoneMeta,
          unit: 'bpm',
        };
      } else if (row.targetType === 'SPEED') {
        if (row.targetUnit === 'SECONDS') {
          step.primaryTargetMeta = {
            kind: 'SPEED',
            value: row.targetValueLow ?? undefined,
            valueHigh: row.targetValueHigh ?? undefined,
            ...zoneMeta,
            unit: speedUnit,
          };
          step.paceKmh = averageExpressionSpeedAsKmh(
            row.targetValueLow ?? undefined,
            row.targetValueHigh ?? undefined,
            speedUnit,
          );
        } else if (row.targetUnit === 'KMH') {
          step.paceKmh = row.targetValueLow ?? row.targetValueHigh ?? undefined;
          step.primaryTargetMeta = {
            kind: 'SPEED',
            value:
              typeof row.targetValueLow === 'number'
                ? 3600 / row.targetValueLow
                : undefined,
            valueHigh:
              typeof row.targetValueHigh === 'number'
                ? 3600 / row.targetValueHigh
                : undefined,
            ...zoneMeta,
            unit: 'sec/km',
          };
        }
      } else if (row.targetType === 'GRADE' && row.targetUnit === 'DEGREE') {
        step.gradeDeg = row.targetValueLow ?? row.targetValueHigh ?? undefined;
      } else if (row.targetResolutionMode === 'EFFORT_ONLY') {
        step.primaryTargetMeta = {
          kind: 'NONE',
          ...zoneMeta,
        };
      }

      return step;
    };

    const coalesceLinearRows = (
      items: WorkoutStepTreeRow[],
    ): WorkRestBlock[] => {
      // 连续相同 work/rest 类型合并为一个 block，减少 stringify 后的碎片行。
      const out: WorkRestBlock[] = [];
      for (const row of items) {
        const rowType = row?.stepType === 'REST' ? 'rest' : 'work';
        const step = buildStep(row);
        const last = out.at(-1);
        if (last && last.type === rowType) {
          last.steps.push(step);
        } else {
          out.push({ type: rowType, steps: [step] });
        }
      }
      return out;
    };

    const result: PlanBlock[] = [];
    for (const row of rows) {
      if (row?.stepType === 'REPEAT') {
        const children = Array.isArray(row.children)
          ? coalesceLinearRows(row.children)
          : [];
        const repeatKind = `${row.durationType ?? ''}`.match(
          /^REPEAT_UNTIL_(.+)$/,
        )?.[1] as NonNullable<RepeatBlock['until']>['kind'] | undefined;
        const repeatUnit =
          row.durationUnit === 'METERS' ||
          row.durationUnit === 'CALORIES' ||
          row.durationUnit === 'BPM' ||
          row.durationUnit === 'WATTS' ||
          row.durationUnit === 'RPM'
            ? row.durationUnit
            : 'SECONDS';
        result.push({
          type: 'repeat',
          count:
            row.durationType === 'REPEAT_COUNT'
              ? Math.max(1, Math.floor(Number(row.durationValue ?? 1) || 1))
              : 1,
          until: repeatKind
            ? {
                kind: repeatKind,
                value: Math.max(0, Number(row.durationValue ?? 0) || 0),
                unit: repeatUnit,
              }
            : undefined,
          children,
        });
        continue;
      }

      const rowType = row?.stepType === 'REST' ? 'rest' : 'work';
      const step = buildStep(row);
      const last = result.at(-1);
      if (last && last.type !== 'repeat' && last.type === rowType) {
        last.steps.push(step);
      } else {
        result.push({ type: rowType, steps: [step] });
      }
    }
    return result;
  }

  /**
   * Encode PlanBlock[] to FIT Workout file bytes
   * - Preserve repeat as FIT repeatUntilStepsCmplt steps
   * - Select one FIT target per step; custom low/high carry floor/ceiling/range
   * - Duration can be time, distance, open, calories, HR threshold, or power threshold
   */
  async buildFITFromPlan(
    blocks: PlanBlock[],
    options?: {
      sport?: string; // e.g., 'cycling' | 'running' (string handled as enum by SDK)
      subSport?: string; // e.g., 'trail' | 'indoor_cycling'
      name?: string; // Workout name
      manufacturer?: string; // file_id.manufacturer (default development)
      product?: number; // file_id.product (default 1)
    },
  ): Promise<Uint8Array> {
    const { Encoder, Profile } = await import('@garmin/fitsdk');

    const encoder = new Encoder();
    type FitWritableMesg = Parameters<
      InstanceType<typeof Encoder>['writeMesg']
    >[0];

    const manufacturer = options?.manufacturer ?? 'development';
    const product = options?.product ?? 1;
    const timeCreated = new Date();
    const sport = options?.sport ?? 'running';
    const subSport = options?.subSport;
    const name = options?.name ?? 'Trainingload.ai Workout';

    // FILE_ID (type is workout)
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.FILE_ID,
      manufacturer,
      product,
      timeCreated,
      type: 'workout',
    } as FitWritableMesg);

    // WORKOUT top-level message (optional name and sport type)
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.WORKOUT,
      sport,
      ...(subSport ? { subSport } : {}),
      wktName: name,
    } as FitWritableMesg);

    let messageIndex = 0;
    const valueOrFallback = (...values: Array<number | undefined>) =>
      values.find((value): value is number => typeof value === 'number');
    const speedMetersPerSecond = (
      value: number | undefined,
      unit: WorkoutExpressionSpeedUnit,
    ) => {
      if (typeof value !== 'number' || value <= 0) return undefined;
      if (unit === 'km/h') return value / 3.6;
      return unit === 'sec/100m' ? 100 / value : 1000 / value;
    };
    const speedRangeMetersPerSecond = (
      low: number | undefined,
      high: number | undefined,
      unit: WorkoutExpressionSpeedUnit,
    ) => {
      const values = [low, high]
        .map((value) => speedMetersPerSecond(value, unit))
        .filter((value): value is number => typeof value === 'number');
      if (!values.length) return null;
      return {
        low: Math.min(...values),
        high: Math.max(...values),
      };
    };

    const writeWorkoutStep = (blockType: 'work' | 'rest', s: WorkRestStep) => {
      const fitIntensity =
        s.stepKind === 'WARMUP'
          ? 'warmup'
          : s.stepKind === 'COOLDOWN'
            ? 'cooldown'
            : s.stepKind === 'RECOVERY'
              ? 'recovery'
              : s.stepKind === 'REST'
                ? 'rest'
                : s.stepKind === 'OTHER'
                  ? 'other'
                  : blockType === 'rest'
                    ? 'rest'
                    : 'active';
      const base: FitWorkoutStepMesg = {
        mesgNum: Profile.MesgNum.WORKOUT_STEP,
        messageIndex: messageIndex++,
        intensity: fitIntensity,
      };

      switch (s.durationMeta?.kind) {
        case 'DISTANCE': {
          base.durationType = 'distance';
          const rawValue = s.durationMeta.value ?? 0;
          base.durationDistance =
            s.durationMeta.unit === 'KILOMETERS' ? rawValue * 1000 : rawValue;
          break;
        }
        case 'OPEN':
          base.durationType = 'open';
          break;
        case 'CALORIES':
          base.durationType = 'calories';
          base.durationCalories = s.durationMeta.value ?? 0;
          break;
        case 'HR_LESS_THAN':
          base.durationType = 'hrLessThan';
          base.durationHr = s.durationMeta.value ?? 0;
          break;
        case 'HR_GREATER_THAN':
          base.durationType = 'hrGreaterThan';
          base.durationHr = s.durationMeta.value ?? 0;
          break;
        case 'POWER_LESS_THAN':
          base.durationType = 'powerLessThan';
          base.durationPower = s.durationMeta.value ?? 0;
          break;
        case 'POWER_GREATER_THAN':
          base.durationType = 'powerGreaterThan';
          base.durationPower = s.durationMeta.value ?? 0;
          break;
        case 'TIME':
        default:
          base.durationType = 'time';
          base.durationTime =
            typeof s.durationMeta?.value === 'number'
              ? s.durationMeta.value
              : (s.duration ?? 0);
          break;
      }

      const primary = s.primaryTargetMeta;
      const hrTarget =
        (primary?.kind === 'HEART_RATE_CUSTOM' ||
          (primary?.kind === 'HEART_RATE_ZONE' &&
            `${primary.unit ?? ''}`.toLowerCase() === 'bpm')) &&
        (primary.value != null || primary.valueHigh != null)
          ? {
              low: primary.value,
              high: primary.valueHigh,
            }
          : s.heartRateBpm != null
            ? {
                low: s.heartRateBpm,
                high: s.heartRateBpm,
              }
            : null;
      const powerTarget =
        (primary?.kind === 'POWER_CUSTOM' ||
          (primary?.kind === 'POWER_ZONE' &&
            `${primary.unit ?? ''}`.toLowerCase() === 'w')) &&
        (primary.value != null || primary.valueHigh != null)
          ? {
              low: primary.value,
              high: primary.valueHigh,
            }
          : s.powerWatts != null
            ? {
                low: s.powerWatts,
                high: s.powerWatts,
              }
            : null;
      const cadenceTarget =
        primary?.kind === 'CADENCE' &&
        (primary.value != null || primary.valueHigh != null)
          ? {
              low: primary.value,
              high: primary.valueHigh,
            }
          : s.cadence != null
            ? {
                low: s.cadence,
                high: s.cadence,
              }
            : null;
      const speedTarget =
        primary?.kind === 'SPEED' &&
        (primary.value != null || primary.valueHigh != null)
          ? speedRangeMetersPerSecond(
              primary.value,
              primary.valueHigh,
              normalizeExpressionSpeedUnit(primary.unit, options?.sport),
            )
          : s.paceKmh != null
            ? {
                low: s.paceKmh / 3.6,
                high: s.paceKmh / 3.6,
              }
            : null;

      // Select target type (single): priority powerWatts > heartRateBpm > cadence > power(ratio)
      if (powerTarget) {
        base.targetType = 'power';
        if (powerTarget.low != null) {
          base.customTargetPowerLow = powerTarget.low;
        }
        if (powerTarget.high != null) {
          base.customTargetPowerHigh = powerTarget.high;
        }
      } else if (hrTarget) {
        base.targetType = 'heartRate';
        if (hrTarget.low != null) {
          base.customTargetHeartRateLow = hrTarget.low;
        }
        if (hrTarget.high != null) {
          base.customTargetHeartRateHigh = hrTarget.high;
        }
      } else if (cadenceTarget) {
        base.targetType = 'cadence';
        if (cadenceTarget.low != null) {
          base.customTargetCadenceLow = cadenceTarget.low;
        }
        if (cadenceTarget.high != null) {
          base.customTargetCadenceHigh = cadenceTarget.high;
        }
      } else if (speedTarget) {
        base.targetType = 'speed';
        base.customTargetSpeedLow = speedTarget.low;
        base.customTargetSpeedHigh = speedTarget.high;
      } else if (s.power != null) {
        // If ratio or percentage, use generic custom value field (SDK writes according to profile)
        const val =
          s.power >= 0 && s.power <= 3
            ? Math.round(s.power * 100)
            : Math.round(s.power);
        base.targetType = 'power';
        base.customTargetValueLow = val;
        base.customTargetValueHigh = val;
      } else {
        base.targetType = 'open';
      }

      if (base.targetType !== 'open') {
        base.customTargetValueLow = valueOrFallback(
          base.customTargetPowerLow,
          base.customTargetHeartRateLow,
          base.customTargetCadenceLow,
          base.customTargetSpeedLow,
          base.customTargetValueLow,
        );
        base.customTargetValueHigh = valueOrFallback(
          base.customTargetPowerHigh,
          base.customTargetHeartRateHigh,
          base.customTargetCadenceHigh,
          base.customTargetSpeedHigh,
          base.customTargetValueHigh,
        );
      }

      encoder.writeMesg(base as FitWritableMesg);
    };

    const writeBlocks = (items: PlanBlock[]) => {
      for (const block of items) {
        if (block.type === 'repeat') {
          if (block.until) {
            throw new BusinessException({
              code: BUSINESS_ERROR_CODE.COMMON,
              message: `FIT workout export does not support repeat until ${block.until.kind}; use a fixed repeat count or an integration with explicit repeat-until support`,
            });
          }
          const startIndex = messageIndex;
          for (const child of block.children) {
            for (const step of child.steps) {
              writeWorkoutStep(child.type, step);
            }
          }
          encoder.writeMesg({
            mesgNum: Profile.MesgNum.WORKOUT_STEP,
            messageIndex: messageIndex++,
            durationType: 'repeatUntilStepsCmplt',
            durationStep: startIndex,
            repeatSteps: Math.max(1, Math.floor(Number(block.count) || 1)),
            targetType: 'open',
          } as FitWritableMesg);
          continue;
        }

        for (const step of block.steps) {
          writeWorkoutStep(block.type, step);
        }
      }
    };

    writeBlocks(blocks);

    // Get byte output (compatible with multiple SDK version return forms)
    const encoderCompat = encoder as unknown as GarminFitEncoderCompat;
    const finished = encoderCompat.finish
      ? encoderCompat.finish()
      : encoderCompat.close
        ? encoderCompat.close()
        : encoderCompat.bytes || encoderCompat.getBytes?.();
    const bytes =
      isFitRecord(finished) && finished.bytes instanceof Uint8Array
        ? finished.bytes
        : finished;
    if (!bytes || !(bytes instanceof Uint8Array)) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'FIT encoding failed: byte stream not generated',
      });
    }
    return bytes;
  }

  // Check if FIT file is workout type and parsable
  private isWorkoutFIT(messages: unknown): boolean {
    // 不同设备写入的 workout 标记位置不同，file_id/workout/step 三处任一存在都认为可解析。
    try {
      const record = isFitRecord(messages) ? messages : {};
      const fileIds = Array.isArray(record.fileIdMesgs)
        ? record.fileIdMesgs
        : [];
      const hasWorkoutType = fileIds.some((item) => {
        const type = isFitRecord(item) ? item.type : undefined;
        return typeof type === 'string' && type.toLowerCase() === 'workout';
      });
      const hasWorkoutMesg = Array.isArray(record.workoutMesgs)
        ? record.workoutMesgs.length > 0
        : false;
      const hasSteps = Array.isArray(record.workoutStepMesgs)
        ? record.workoutStepMesgs.length > 0
        : false;
      return hasWorkoutType || hasWorkoutMesg || hasSteps;
    } catch (error) {
      this.logger.error(
        `[isWorkoutFIT] 判断是否为训练 FIT 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  // Map FIT step messages to our PlanBlock[].
  private mapFITStepsToPlan(steps: unknown[]): PlanBlock[] {
    // FIT SDK 给的是 workout_step 消息；尽量恢复 duration / target / intensity。
    try {
      const plan: PlanBlock[] = [];
      const messageIndexToPlanIndex = new Map<number, number>();

      const enumKey = (value: unknown) =>
        `${value ?? ''}`.replace(/[_\s-]/g, '').toLowerCase();
      const readNumber = (row: unknown, ...keys: string[]) =>
        fitNumber(isFitRecord(row) ? row : {}, ...keys);
      const midpoint = (low?: number, high?: number) => {
        if (typeof low === 'number' && typeof high === 'number') {
          return (low + high) / 2;
        }
        return low ?? high;
      };
      const coalesceRepeatChildren = (items: PlanBlock[]): WorkRestBlock[] => {
        const children: WorkRestBlock[] = [];
        for (const item of items) {
          if (item.type === 'repeat') {
            for (const child of item.children) {
              const last = children.at(-1);
              if (last && last.type === child.type) {
                last.steps.push(...child.steps);
              } else {
                children.push({ type: child.type, steps: [...child.steps] });
              }
            }
            continue;
          }
          const last = children.at(-1);
          if (last && last.type === item.type) {
            last.steps.push(...item.steps);
          } else {
            children.push({ type: item.type, steps: [...item.steps] });
          }
        }
        return children;
      };

      for (const [stepOrder, raw] of steps.entries()) {
        const s = isFitRecord(raw) ? raw : {};
        const durationType = enumKey(s.durationType);
        const messageIndex =
          readNumber(s, 'messageIndex', 'message_index') ?? stepOrder;
        if (durationType === 'repeatuntilstepscmplt') {
          const startMessageIndex = readNumber(
            s,
            'durationStep',
            'duration_step',
            'durationValue',
            'duration_value',
          );
          const startPlanIndex =
            typeof startMessageIndex === 'number'
              ? messageIndexToPlanIndex.get(startMessageIndex)
              : undefined;
          if (typeof startPlanIndex === 'number') {
            const repeated = plan.splice(startPlanIndex);
            plan.push({
              type: 'repeat',
              count: Math.max(
                1,
                Math.floor(
                  readNumber(
                    s,
                    'repeatSteps',
                    'repeat_steps',
                    'targetValue',
                    'target_value',
                  ) ?? 1,
                ),
              ),
              children: coalesceRepeatChildren(repeated),
            });
            messageIndexToPlanIndex.set(messageIndex, plan.length - 1);
          }
          continue;
        }

        const intensityKey = enumKey(s?.intensity);
        const stepKind: WorkRestStep['stepKind'] =
          intensityKey === 'warmup'
            ? 'WARMUP'
            : intensityKey === 'cooldown'
              ? 'COOLDOWN'
              : intensityKey === 'recovery'
                ? 'RECOVERY'
                : intensityKey === 'rest'
                  ? 'REST'
                  : intensityKey === 'other'
                    ? 'OTHER'
                    : 'WORK';
        const blockType: 'work' | 'rest' =
          stepKind === 'REST' || stepKind === 'RECOVERY' ? 'rest' : 'work';

        const durationTime = readNumber(s, 'durationTime', 'duration_time');
        const durationDistance = readNumber(
          s,
          'durationDistance',
          'duration_distance',
        );
        const durationHr = readNumber(s, 'durationHr', 'duration_hr');
        const durationPower = readNumber(s, 'durationPower', 'duration_power');
        const durationCalories = readNumber(
          s,
          'durationCalories',
          'duration_calories',
        );
        const step: WorkRestStep = {
          duration: durationType === 'time' ? (durationTime ?? 0) : 0,
          stepKind,
        };

        if (durationType === 'distance') {
          step.durationMeta = {
            kind: 'DISTANCE',
            value: durationDistance,
            unit: 'METERS',
          };
        } else if (durationType === 'open') {
          step.durationMeta = { kind: 'OPEN' };
        } else if (durationType === 'calories') {
          step.durationMeta = {
            kind: 'CALORIES',
            value: durationCalories,
            unit: 'KJ',
          };
        } else if (durationType === 'hrlessthan') {
          step.durationMeta = {
            kind: 'HR_LESS_THAN',
            value: durationHr,
            unit: 'BPM',
          };
        } else if (durationType === 'hrgreaterthan') {
          step.durationMeta = {
            kind: 'HR_GREATER_THAN',
            value: durationHr,
            unit: 'BPM',
          };
        } else if (durationType === 'powerlessthan') {
          step.durationMeta = {
            kind: 'POWER_LESS_THAN',
            value: durationPower,
            unit: 'WATTS',
          };
        } else if (durationType === 'powergreaterthan') {
          step.durationMeta = {
            kind: 'POWER_GREATER_THAN',
            value: durationPower,
            unit: 'WATTS',
          };
        } else {
          step.durationMeta = {
            kind: 'TIME',
            value: durationTime ?? 0,
            unit: 'SECONDS',
          };
        }

        const targetType = enumKey(s?.targetType);
        const fallbackLow = readNumber(s, 'customTargetValueLow');
        const fallbackHigh = readNumber(s, 'customTargetValueHigh');
        if (targetType === 'heartrate') {
          const low = readNumber(s, 'customTargetHeartRateLow') ?? fallbackLow;
          const high =
            readNumber(s, 'customTargetHeartRateHigh') ?? fallbackHigh;
          step.heartRateBpm = midpoint(low, high);
          step.primaryTargetMeta = {
            kind: 'HEART_RATE_CUSTOM',
            value: low,
            valueHigh: high,
            unit: 'bpm',
          };
        } else if (targetType === 'power') {
          const low = readNumber(s, 'customTargetPowerLow') ?? fallbackLow;
          const high = readNumber(s, 'customTargetPowerHigh') ?? fallbackHigh;
          step.powerWatts = midpoint(low, high);
          step.primaryTargetMeta = {
            kind: 'POWER_CUSTOM',
            value: low,
            valueHigh: high,
            unit: 'W',
          };
        } else if (targetType === 'cadence') {
          const low = readNumber(s, 'customTargetCadenceLow') ?? fallbackLow;
          const high = readNumber(s, 'customTargetCadenceHigh') ?? fallbackHigh;
          step.cadence = midpoint(low, high);
          step.primaryTargetMeta = {
            kind: 'CADENCE',
            value: low,
            valueHigh: high,
            unit: 'rpm',
          };
        } else if (targetType === 'speed') {
          const low = readNumber(s, 'customTargetSpeedLow') ?? fallbackLow;
          const high = readNumber(s, 'customTargetSpeedHigh') ?? fallbackHigh;
          const speeds = [low, high].filter(
            (value): value is number => typeof value === 'number' && value > 0,
          );
          if (speeds.length > 0) {
            const paces = speeds.map((speed) => 1000 / speed);
            step.paceKmh =
              (speeds.reduce((sum, item) => sum + item, 0) / speeds.length) *
              3.6;
            step.primaryTargetMeta = {
              kind: 'SPEED',
              value: Math.min(...paces),
              valueHigh: Math.max(...paces),
              unit: 'sec/km',
            };
          }
        }

        plan.push({ type: blockType, steps: [step] });
        messageIndexToPlanIndex.set(messageIndex, plan.length - 1);
      }

      return plan;
    } catch (error) {
      this.logger.error(
        `[mapFITStepsToPlan] FIT 步骤映射失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * 训练 DSL（兼容旧版 `work: 30s ...`）
   * - 单行步骤：`work 10m pace 7:20-8:20`（默认 1000m）或 `work 10m pace 1:45-1:55 100m`
   * - 支持 stepType：warmup/work/recovery/rest/cooldown/other
   * - 支持 repeat：`repeat 4 { ... }`，推荐多行写法；兼容 `repeat 4 { work 30s, recovery 1m }`
   * - 每个 step 只能有一个 FIT target
   */
  parsePlanText(text: string): PlanBlock[] {
    // DSL 解析器兼容旧版冒号写法和新版 stepType/repeat/多 target 写法。
    try {
      const expandInlineRepeatLines = (rawText: string): string => {
        return rawText
          .split(/\r?\n/)
          .flatMap((rawLine) => {
            const match = rawLine.match(
              /^(\s*)repeat\s+((?:\d+)|(?:until\s+\S+))\s*([{(])\s*(.+?)\s*([})])\s*$/i,
            );
            if (!match) return [rawLine];
            const [, indent, selector, open, body, close] = match;
            const expectedClose = open === '(' ? ')' : '}';
            if (close !== expectedClose) return [rawLine];
            const childLines = body
              .split(/\s*[,;]\s*/)
              .map((part) => part.trim())
              .filter(Boolean);
            if (childLines.length === 0) return [rawLine];
            return [
              `${indent}repeat ${selector} ${open}`,
              ...childLines.map((child) => `${indent}  ${child}`),
              `${indent}${close}`,
            ];
          })
          .join('\n');
      };

      const lines = expandInlineRepeatLines(text)
        .split(/\r?\n/)
        .map((raw) => {
          const indent = (raw.match(/^\s*/) || [''])[0].length;
          const trimmed = raw.trim();
          return { raw, text: trimmed, indent };
        })
        .filter((l) => l.text.length > 0);

      const result: PlanBlock[] = [];
      let currentRepeat:
        | (RepeatBlock & {
            indent: number;
            inBrace?: boolean;
            braceChar?: '{' | '(';
            childIndent?: number;
          })
        | null = null;

      const finalizeRepeat = () => {
        if (currentRepeat && currentRepeat.children.length > 0) {
          result.push({
            type: 'repeat',
            count: currentRepeat.count,
            until: currentRepeat.until,
            children: currentRepeat.children,
          });
        }
        currentRepeat = null;
      };

      const parseClockToSeconds = (token: string) => {
        const parts = token.split(':').map((item) => Number(item));
        if (parts.some((item) => Number.isNaN(item))) return null;
        if (parts.length === 2) {
          return parts[0] * 60 + parts[1];
        }
        if (parts.length === 3) {
          return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return null;
      };

      const parseDurationToken = (
        token: string,
        lineIdx: number,
      ): Pick<WorkRestStep, 'duration' | 'durationMeta'> => {
        const compoundHoursMinutesSecondsMatch = token.match(
          /^(\d+)(?:h|hr|hrs|hour|hours)(\d+)(?:m|min|mins|minute|minutes)(\d+)(?:s|sec|secs|second|seconds)$/i,
        );
        if (compoundHoursMinutesSecondsMatch) {
          const hours = parseInt(compoundHoursMinutesSecondsMatch[1], 10);
          const minutes = parseInt(compoundHoursMinutesSecondsMatch[2], 10);
          const seconds = parseInt(compoundHoursMinutesSecondsMatch[3], 10);
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          return {
            duration: totalSeconds,
            durationMeta: {
              kind: 'TIME',
              value: totalSeconds,
              unit: 'SECONDS',
            },
          };
        }

        const compoundHoursMinutesMatch = token.match(
          /^(\d+)(?:h|hr|hrs|hour|hours)(\d+)(?:m|min|mins|minute|minutes)$/i,
        );
        if (compoundHoursMinutesMatch) {
          const hours = parseInt(compoundHoursMinutesMatch[1], 10);
          const minutes = parseInt(compoundHoursMinutesMatch[2], 10);
          const totalSeconds = hours * 3600 + minutes * 60;
          return {
            duration: totalSeconds,
            durationMeta: {
              kind: 'TIME',
              value: totalSeconds,
              unit: 'SECONDS',
            },
          };
        }

        const compoundMinutesSecondsMatch = token.match(
          /^(\d+)(?:m|min|mins|minute|minutes)(\d+)(?:s|sec|secs|second|seconds)$/i,
        );
        if (compoundMinutesSecondsMatch) {
          const minutes = parseInt(compoundMinutesSecondsMatch[1], 10);
          const seconds = parseInt(compoundMinutesSecondsMatch[2], 10);
          const totalSeconds = minutes * 60 + seconds;
          return {
            duration: totalSeconds,
            durationMeta: {
              kind: 'TIME',
              value: totalSeconds,
              unit: 'SECONDS',
            },
          };
        }

        const timeMatch = token.match(
          /^(\d+)(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/i,
        );
        if (timeMatch) {
          const value = parseInt(timeMatch[1], 10);
          const unit = timeMatch[2].toLowerCase();
          const seconds =
            unit === 'h' ||
            unit === 'hr' ||
            unit === 'hrs' ||
            unit === 'hour' ||
            unit === 'hours'
              ? value * 3600
              : unit === 'm' ||
                  unit === 'min' ||
                  unit === 'mins' ||
                  unit === 'minute' ||
                  unit === 'minutes'
                ? value * 60
                : value;
          return {
            duration: seconds,
            durationMeta: {
              kind: 'TIME',
              value: seconds,
              unit: 'SECONDS',
            },
          };
        }

        const distanceMatch = token.match(/^(\d+(?:\.\d+)?)(km|m)$/i);
        if (distanceMatch) {
          const value = Number(distanceMatch[1]);
          const unit = distanceMatch[2].toLowerCase();
          return {
            duration: 0,
            durationMeta: {
              kind: 'DISTANCE',
              value,
              unit: unit === 'km' ? 'KILOMETERS' : 'METERS',
            },
          };
        }

        const caloriesMatch = token.match(/^(\d+(?:\.\d+)?)kj$/i);
        if (caloriesMatch) {
          return {
            duration: 0,
            durationMeta: {
              kind: 'CALORIES',
              value: Number(caloriesMatch[1]),
              unit: 'KJ',
            },
          };
        }

        if (/^open$/i.test(token)) {
          return {
            duration: 0,
            durationMeta: {
              kind: 'OPEN',
            },
          };
        }

        const hrThresholdMatch = token.match(
          /^hr(<=|<|>=|>)(\d+(?:\.\d+)?)bpm$/i,
        );
        if (hrThresholdMatch) {
          return {
            duration: 0,
            durationMeta: {
              kind: hrThresholdMatch[1].startsWith('<')
                ? 'HR_LESS_THAN'
                : 'HR_GREATER_THAN',
              value: Number(hrThresholdMatch[2]),
              unit: 'BPM',
            },
          };
        }

        const powerThresholdMatch = token.match(
          /^(?:pwr|power)(<=|<|>=|>)(\d+(?:\.\d+)?)(?:w|watts?)$/i,
        );
        if (powerThresholdMatch) {
          return {
            duration: 0,
            durationMeta: {
              kind: powerThresholdMatch[1].startsWith('<')
                ? 'POWER_LESS_THAN'
                : 'POWER_GREATER_THAN',
              value: Number(powerThresholdMatch[2]),
              unit: 'WATTS',
            },
          };
        }

        const cadenceThresholdMatch = token.match(
          /^(?:cad|cadence|rpm)(<=|<|>=|>)(\d+(?:\.\d+)?)(?:rpm|spm)?$/i,
        );
        if (cadenceThresholdMatch) {
          return {
            duration: 0,
            durationMeta: {
              kind: cadenceThresholdMatch[1].startsWith('<')
                ? 'CADENCE_LESS_THAN'
                : 'CADENCE_GREATER_THAN',
              value: Number(cadenceThresholdMatch[2]),
              unit: 'RPM',
            },
          };
        }

        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: `Line ${lineIdx + 1} time format error: ${token}`,
        });
      };

      const parseRepeatUntil = (
        token: string,
        lineIdx: number,
      ): NonNullable<RepeatBlock['until']> => {
        const parsed = parseDurationToken(token, lineIdx).durationMeta;
        if (!parsed || parsed.kind === 'OPEN') {
          throw new BusinessException({
            code: BUSINESS_ERROR_CODE.COMMON,
            message: `Line ${lineIdx + 1} repeat-until requires time, distance, calories, HR, power, or cadence`,
          });
        }
        const value = Number(parsed.value);
        if (!Number.isFinite(value) || value <= 0) {
          throw new BusinessException({
            code: BUSINESS_ERROR_CODE.COMMON,
            message: `Line ${lineIdx + 1} repeat-until value must be greater than zero`,
          });
        }
        return {
          kind: parsed.kind,
          value:
            parsed.kind === 'DISTANCE' && parsed.unit === 'KILOMETERS'
              ? value * 1000
              : value,
          unit:
            parsed.kind === 'TIME'
              ? 'SECONDS'
              : parsed.kind === 'DISTANCE'
                ? 'METERS'
                : parsed.kind === 'CALORIES'
                  ? 'CALORIES'
                  : parsed.unit === 'BPM'
                    ? 'BPM'
                    : parsed.unit === 'WATTS'
                      ? 'WATTS'
                      : 'RPM',
        };
      };

      const mapStepType = (rawType: string) => {
        const normalized = rawType.toLowerCase();
        switch (normalized) {
          case 'wu':
          case 'warmup':
            return { blockType: 'work' as const, stepKind: 'WARMUP' as const };
          case 'work':
            return { blockType: 'work' as const, stepKind: 'WORK' as const };
          case 'rec':
          case 'recovery':
            return {
              blockType: 'rest' as const,
              stepKind: 'RECOVERY' as const,
            };
          case 'rest':
            return { blockType: 'rest' as const, stepKind: 'REST' as const };
          case 'cd':
          case 'cooldown':
            return {
              blockType: 'work' as const,
              stepKind: 'COOLDOWN' as const,
            };
          case 'other':
            return { blockType: 'work' as const, stepKind: 'OTHER' as const };
          default:
            return null;
        }
      };

      const attachTarget = (
        step: Partial<WorkRestStep>,
        target: NonNullable<WorkRestStep['primaryTargetMeta']>,
      ) => {
        // FIT workout step 只有一个 target_type；DSL 新写法一行只允许一个 target。
        if (!step.primaryTargetMeta || step.primaryTargetMeta.kind === 'NONE') {
          step.primaryTargetMeta = target;
          return;
        }
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message:
            'Each workout step supports only one target. Split power/cadence/heart-rate goals into separate steps.',
        });
      };

      const parsePaceToken = (
        token: string,
        unitToken?: string,
      ): {
        low: number;
        high?: number;
        unit: Extract<WorkoutExpressionSpeedUnit, 'sec/km' | 'sec/100m'>;
        consumedUnitToken: boolean;
      } | null => {
        // 仅支持 `pace 4:43-4:56 [100m|1000m]`；无单位默认 1000m（km）。
        const clockRangeMatch = token.match(
          /^(\d{1,2}:\d{2}(?::\d{2})?)(?:-(\d{1,2}:\d{2}(?::\d{2})?))?$/,
        );
        if (!clockRangeMatch) return null;
        const low = parseClockToSeconds(clockRangeMatch[1]);
        const high = clockRangeMatch[2]
          ? parseClockToSeconds(clockRangeMatch[2])
          : undefined;
        if (!Number.isFinite(low as number)) return null;

        const normalizedUnitToken = unitToken?.trim().toLowerCase();
        let unit: Extract<WorkoutExpressionSpeedUnit, 'sec/km' | 'sec/100m'> =
          'sec/km';
        let consumedUnitToken = false;
        if (normalizedUnitToken && normalizedUnitToken === '100m') {
          unit = 'sec/100m';
          consumedUnitToken = true;
        } else if (normalizedUnitToken && normalizedUnitToken === '1000m') {
          unit = 'sec/km';
          consumedUnitToken = true;
        }

        return {
          low: low as number,
          high:
            typeof high === 'number' && Number.isFinite(high)
              ? high
              : (low as number),
          unit,
          consumedUnitToken,
        };
      };

      const parseStepTargets = (
        tokens: string[],
        lineIdx: number,
      ): Partial<WorkRestStep> => {
        // target token 以 “名称 值 [单位]” 为一组顺序解析，例如 power 220-250W hr 145-155bpm。
        const step: Partial<WorkRestStep> = {};
        const parseZoneToken = (token: string | undefined): number | null => {
          const match = token?.trim().match(/^z(?:one)?(\d+)$/i);
          if (!match) return null;
          const zoneIndex = Number(match[1]);
          return Number.isFinite(zoneIndex) && zoneIndex > 0 ? zoneIndex : null;
        };
        const attachZoneTarget = (
          metric: 'hr' | 'power' | 'pace' | 'speed',
          zoneIndex: number,
        ) => {
          const zoneMeta = {
            zoneIndex,
            zoneLabel: `Z${zoneIndex}`,
            zoneSource: 'TRAININGLOAD',
          };
          if (metric === 'hr') {
            attachTarget(step, {
              kind: 'HEART_RATE_ZONE',
              ...zoneMeta,
              zoneSystem: 'HEART_RATE',
              unit: 'zone',
            });
            return true;
          }
          if (metric === 'power') {
            attachTarget(step, {
              kind: 'POWER_ZONE',
              ...zoneMeta,
              zoneSystem: 'POWER',
              unit: 'zone',
            });
            return true;
          }
          attachTarget(step, {
            kind: 'SPEED',
            ...zoneMeta,
            zoneSystem: 'PACE',
            unit: getExpressionSpeedUnitForSport(
              metric === 'speed' ? 'CYCLING' : 'RUN',
            ),
          });
          return true;
        };
        const parseNumericTarget = (
          targetIndex: number,
          defaultUnit?: string,
        ): {
          low?: number;
          high?: number;
          unit?: string;
          consumedTokens: number;
        } | null => {
          const valueToken = tokens[targetIndex + 1];
          const unitToken = tokens[targetIndex + 2];
          const extraUnitToken = tokens[targetIndex + 3];
          if (!valueToken) return null;

          let boundMatch = valueToken.match(
            /^(<=|<|>=|>)(\d+(?:\.\d+)?)([a-z/%°]+)?$/i,
          );
          if (boundMatch) {
            const consumesUnit =
              !boundMatch[3] && /^[a-z/%°]+$/i.test(unitToken ?? '');
            const value = Number(boundMatch[2]);
            return {
              low: boundMatch[1].startsWith('>') ? value : undefined,
              high: boundMatch[1].startsWith('<') ? value : undefined,
              unit: boundMatch[3] ?? (consumesUnit ? unitToken : defaultUnit),
              consumedTokens: consumesUnit ? 3 : 2,
            };
          }

          const operatorMatch = valueToken.match(/^(<=|<|>=|>)$/);
          if (operatorMatch) {
            boundMatch = (unitToken ?? '').match(
              /^(\d+(?:\.\d+)?)([a-z/%°]+)?$/i,
            );
            if (!boundMatch) return null;
            const consumesUnit =
              !boundMatch[2] && /^[a-z/%°]+$/i.test(extraUnitToken ?? '');
            const value = Number(boundMatch[1]);
            return {
              low: operatorMatch[1].startsWith('>') ? value : undefined,
              high: operatorMatch[1].startsWith('<') ? value : undefined,
              unit:
                boundMatch[2] ?? (consumesUnit ? extraUnitToken : defaultUnit),
              consumedTokens: consumesUnit ? 4 : 3,
            };
          }

          const parsedValue = parseTargetValueWithUnit(valueToken, unitToken);
          if (!parsedValue) return null;
          return {
            low: parsedValue.low,
            high: parsedValue.high ?? parsedValue.low,
            unit: parsedValue.unit ?? defaultUnit,
            consumedTokens: parsedValue.consumedUnitToken ? 3 : 2,
          };
        };

        const parseHeartRateTarget = (
          targetIndex: number,
        ): {
          low?: number;
          high?: number;
          consumedTokens: number;
        } | null => {
          const parsedValue = parseNumericTarget(targetIndex, 'bpm');
          if (!parsedValue) return null;
          const unit = parsedValue.unit?.toLowerCase();
          if (unit === '%') {
            throw new BusinessException({
              code: BUSINESS_ERROR_CODE.COMMON,
              message: `Line ${lineIdx + 1} heart rate: use bpm only (e.g. hr 150, hr 150-160bpm, or hr <150bpm), not percent`,
            });
          }
          if (unit !== 'bpm' && unit !== undefined) {
            throw new BusinessException({
              code: BUSINESS_ERROR_CODE.COMMON,
              message: `Line ${lineIdx + 1} heart rate target: use bpm (e.g. hr 150, hr 150-160bpm, or hr <150bpm)`,
            });
          }
          return {
            low: parsedValue.low,
            high: parsedValue.high,
            consumedTokens: parsedValue.consumedTokens,
          };
        };

        for (let i = 0; i < tokens.length; ) {
          const name = tokens[i]?.replace(/:$/, '');
          if (!name) break;
          const lower = name.toLowerCase();
          const valueToken = tokens[i + 1];
          const unitToken = tokens[i + 2];

          const leadingZoneIndex = parseZoneToken(name);
          if (leadingZoneIndex != null) {
            const metric = valueToken?.toLowerCase();
            if (
              metric === 'hr' ||
              metric === 'power' ||
              metric === 'pwr' ||
              metric === 'pace' ||
              metric === 'speed'
            ) {
              attachZoneTarget(
                metric === 'pwr'
                  ? 'power'
                  : (metric as 'hr' | 'power' | 'pace' | 'speed'),
                leadingZoneIndex,
              );
              i += 2;
              continue;
            }
          }

          if (!valueToken) {
            throw new BusinessException({
              code: BUSINESS_ERROR_CODE.COMMON,
              message: `Line ${lineIdx + 1} target missing value: ${name}`,
            });
          }

          if (lower === 'pace' || lower === 'speed') {
            const zoneIndex = parseZoneToken(valueToken);
            if (zoneIndex != null) {
              attachZoneTarget(lower as 'pace' | 'speed', zoneIndex);
              i += 2;
              continue;
            }
            const paceValue = parsePaceToken(valueToken, unitToken);
            if (paceValue) {
              attachTarget(step, {
                kind: 'SPEED',
                value: paceValue.low,
                valueHigh: paceValue.high,
                unit: paceValue.unit,
              });
              step.paceKmh = averageExpressionSpeedAsKmh(
                paceValue.low,
                paceValue.high,
                paceValue.unit,
              );
              i += paceValue.consumedUnitToken ? 3 : 2;
              continue;
            }
          }

          if (lower === 'hr') {
            const zoneIndex = parseZoneToken(valueToken);
            if (zoneIndex != null) {
              attachZoneTarget('hr', zoneIndex);
              i += 2;
              continue;
            }
            const hrTarget = parseHeartRateTarget(i);
            if (!hrTarget) {
              throw new BusinessException({
                code: BUSINESS_ERROR_CODE.COMMON,
                message: `Line ${lineIdx + 1} heart rate target: use bpm (e.g. hr 150, hr 150-160bpm, or hr <150bpm)`,
              });
            }
            step.heartRateBpm =
              typeof hrTarget.low === 'number' &&
              typeof hrTarget.high === 'number'
                ? (hrTarget.low + hrTarget.high) / 2
                : (hrTarget.low ?? hrTarget.high);
            attachTarget(step, {
              kind: 'HEART_RATE_CUSTOM',
              value: hrTarget.low,
              valueHigh: hrTarget.high,
              unit: 'bpm',
            });
            i += hrTarget.consumedTokens;
            continue;
          }

          if (lower === 'pwr' || lower === 'power') {
            const zoneIndex = parseZoneToken(valueToken);
            if (zoneIndex != null) {
              attachZoneTarget('power', zoneIndex);
              i += 2;
              continue;
            }
            const powerTarget = parseNumericTarget(i, 'W');
            if (!powerTarget) {
              throw new BusinessException({
                code: BUSINESS_ERROR_CODE.COMMON,
                message: `Line ${lineIdx + 1} power target: use watts (e.g. power 250W, power 220-250W, or power <250W)`,
              });
            }
            const unit = powerTarget.unit?.toLowerCase();
            if (unit === '%') {
              step.power =
                typeof powerTarget.low === 'number'
                  ? powerTarget.low / 100
                  : typeof powerTarget.high === 'number'
                    ? powerTarget.high / 100
                    : undefined;
              attachTarget(step, {
                kind: 'POWER_ZONE',
                value: powerTarget.low,
                valueHigh: powerTarget.high,
                unit: '%',
              });
            } else if (unit === 'w' || unit === 'watts' || unit === undefined) {
              step.powerWatts =
                typeof powerTarget.low === 'number' &&
                typeof powerTarget.high === 'number'
                  ? (powerTarget.low + powerTarget.high) / 2
                  : (powerTarget.low ?? powerTarget.high);
              attachTarget(step, {
                kind: 'POWER_CUSTOM',
                value: powerTarget.low,
                valueHigh: powerTarget.high,
                unit: 'W',
              });
            } else {
              throw new BusinessException({
                code: BUSINESS_ERROR_CODE.COMMON,
                message: `Line ${lineIdx + 1} power target: use watts (e.g. power 250W, power 220-250W, or power <250W), or legacy FTP percent with % (e.g. power 85%)`,
              });
            }
            i += powerTarget.consumedTokens;
            continue;
          }

          if (lower === 'cad' || lower === 'cadence' || lower === 'rpm') {
            const cadenceTarget = parseNumericTarget(i, 'rpm');
            if (!cadenceTarget) {
              throw new BusinessException({
                code: BUSINESS_ERROR_CODE.COMMON,
                message: `Line ${lineIdx + 1} cadence target: use rpm (e.g. cadence 85rpm, cadence 85-95rpm, or cadence <95rpm)`,
              });
            }
            const unit = cadenceTarget.unit?.toLowerCase();
            if (unit !== 'rpm' && unit !== 'spm' && unit !== undefined) {
              throw new BusinessException({
                code: BUSINESS_ERROR_CODE.COMMON,
                message: `Line ${lineIdx + 1} cadence target: use rpm (e.g. cadence 85rpm, cadence 85-95rpm, or cadence <95rpm)`,
              });
            }
            step.cadence =
              typeof cadenceTarget.low === 'number' &&
              typeof cadenceTarget.high === 'number'
                ? (cadenceTarget.low + cadenceTarget.high) / 2
                : (cadenceTarget.low ?? cadenceTarget.high);
            attachTarget(step, {
              kind: 'CADENCE',
              value: cadenceTarget.low,
              valueHigh: cadenceTarget.high,
              unit: unit === 'spm' ? 'spm' : 'rpm',
            });
            i += cadenceTarget.consumedTokens;
            continue;
          }

          const parsedValue = parseTargetValueWithUnit(valueToken, unitToken);
          if (!parsedValue) {
            throw new BusinessException({
              code: BUSINESS_ERROR_CODE.COMMON,
              message: `Line ${lineIdx + 1} target format error: ${valueToken}`,
            });
          }

          if (lower === 'pace' || lower === 'speed') {
            const rawUnit = parsedValue.unit?.toLowerCase();
            if (rawUnit === 'km/h') {
              const expressionUnit = getExpressionSpeedUnitForSport('CYCLING');
              const low = 3600 / parsedValue.low;
              const high =
                typeof parsedValue.high === 'number'
                  ? 3600 / parsedValue.high
                  : undefined;
              attachTarget(step, {
                kind: 'SPEED',
                value: low,
                valueHigh: high ?? low,
                unit: expressionUnit,
              });
              step.paceKmh = averageExpressionSpeedAsKmh(
                low,
                high ?? low,
                expressionUnit,
              );
            } else {
              const expressionUnit = normalizeExpressionSpeedUnit(
                parsedValue.unit,
                'RUN',
              );
              attachTarget(step, {
                kind: 'SPEED',
                value: parsedValue.low,
                valueHigh: parsedValue.high ?? parsedValue.low,
                unit: expressionUnit,
              });
              step.paceKmh = averageExpressionSpeedAsKmh(
                parsedValue.low,
                parsedValue.high ?? parsedValue.low,
                expressionUnit,
              );
            }
          } else if (lower === 'grade') {
            step.gradeDeg = parsedValue.low;
          } else {
            throw new BusinessException({
              code: BUSINESS_ERROR_CODE.COMMON,
              message: `Line ${lineIdx + 1} unknown target: ${name}`,
            });
          }

          i += parsedValue.consumedUnitToken ? 3 : 2;
        }
        return step;
      };

      const parseStepLine = (line: string, idx: number): WorkRestBlock => {
        let typeToken = '';
        let rest = '';

        // 仅支持 "work: 10m ..." 这种前缀冒号；不要误伤 pace 4:30 的时间冒号。
        const stepPrefixColon = line.match(/^([a-zA-Z]+)\s*:\s*(.+)$/);
        if (stepPrefixColon) {
          typeToken = stepPrefixColon[1];
          rest = stepPrefixColon[2];
        } else {
          const tokens = line.split(/\s+/).filter(Boolean);
          typeToken = tokens[0] || '';
          rest = tokens.slice(1).join(' ');
        }

        const mapped = mapStepType(typeToken);
        if (!mapped) {
          throw new BusinessException({
            code: BUSINESS_ERROR_CODE.COMMON,
            message: `Line ${idx + 1} unknown block type: ${typeToken}`,
          });
        }

        const tokens = rest.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) {
          throw new BusinessException({
            code: BUSINESS_ERROR_CODE.COMMON,
            message: `Line ${idx + 1} missing step definition`,
          });
        }

        const durationParsed = parseDurationToken(tokens[0], idx);
        const targets = parseStepTargets(tokens.slice(1), idx);
        const hasTarget =
          Boolean(targets.primaryTargetMeta) ||
          Boolean(targets.secondaryTarget);
        const isThresholdDuration =
          durationParsed.durationMeta?.kind === 'HR_LESS_THAN' ||
          durationParsed.durationMeta?.kind === 'HR_GREATER_THAN' ||
          durationParsed.durationMeta?.kind === 'POWER_LESS_THAN' ||
          durationParsed.durationMeta?.kind === 'POWER_GREATER_THAN' ||
          durationParsed.durationMeta?.kind === 'CADENCE_LESS_THAN' ||
          durationParsed.durationMeta?.kind === 'CADENCE_GREATER_THAN';
        if (hasTarget && isThresholdDuration) {
          throw new BusinessException({
            code: BUSINESS_ERROR_CODE.COMMON,
            message: `Line ${idx + 1} duration-threshold steps cannot also define a target. Use either \`${tokens[0]}\` as the ending condition, or a fixed/open duration with one target.`,
          });
        }
        return {
          type: mapped.blockType,
          steps: [
            {
              duration: durationParsed.duration,
              durationMeta: durationParsed.durationMeta,
              stepKind: mapped.stepKind,
              ...targets,
            },
          ],
        };
      };

      const isStepLine = (line: string) =>
        /^(work|rest|warmup|wu|recovery|rec|cooldown|cd|other)\b/i.test(line) ||
        /^(work|rest)\s*:/i.test(line);

      for (let i = 0; i < lines.length; i++) {
        const { text: line, indent } = lines[i];

        // Support explicit termination without braces: endrepeat / end
        if (currentRepeat && /^(endrepeat|end)$/i.test(line)) {
          finalizeRepeat();
          continue;
        }

        // If currently in brace/parenthesis scope, handle possible closing char first (allow single brace line or trailing close)
        if (currentRepeat?.inBrace && /^\s*[)}]\s*$/.test(line)) {
          finalizeRepeat();
          continue;
        }
        const repeatHeader = line.match(
          /^repeat\s+(?:(\d+)|until\s+(\S+))(\s*[{(])?$/i,
        );
        if (repeatHeader) {
          if (currentRepeat) {
            throw new BusinessException({
              code: BUSINESS_ERROR_CODE.COMMON,
              message: `Line ${i + 1} nested repeat is not supported`,
            });
          }
          finalizeRepeat();
          const count = repeatHeader[1] ? parseInt(repeatHeader[1], 10) : 1;
          if (!Number.isFinite(count) || count < 1) {
            throw new BusinessException({
              code: BUSINESS_ERROR_CODE.COMMON,
              message: `Line ${i + 1} repeat count must be greater than zero`,
            });
          }
          const until = repeatHeader[2]
            ? parseRepeatUntil(repeatHeader[2], i)
            : undefined;
          let inBrace = false as boolean;
          let braceChar: '{' | '(' | undefined = undefined;
          if (/[{(]\s*$/.test(line)) {
            inBrace = true;
            braceChar = line.trim().endsWith('{') ? '{' : '(';
          } else if (lines[i + 1]) {
            const nextText = lines[i + 1].text;
            if (nextText.startsWith('{') || nextText.startsWith('(')) {
              inBrace = true;
              braceChar = nextText.startsWith('{') ? '{' : '(';
              if (nextText.trim().length === 1) {
                i += 1;
              }
            }
          }
          currentRepeat = {
            type: 'repeat',
            count,
            until,
            children: [],
            indent,
            inBrace,
            braceChar,
          };
          continue;
        }

        let effectiveLine = line;
        let closesBraceNow = false;
        if (currentRepeat?.inBrace && currentRepeat.braceChar) {
          const closingChar = currentRepeat.braceChar === '(' ? ')' : '}';
          if (effectiveLine.startsWith(currentRepeat.braceChar)) {
            effectiveLine = effectiveLine.slice(1).trim();
          }
          if (effectiveLine.endsWith(closingChar)) {
            closesBraceNow = true;
            effectiveLine = effectiveLine.slice(0, -1).trim();
          }
        }

        if (isStepLine(effectiveLine)) {
          const block = parseStepLine(effectiveLine, i);
          if (currentRepeat) {
            if (currentRepeat.inBrace) {
              currentRepeat.children.push(block);
              if (closesBraceNow) {
                finalizeRepeat();
              }
            } else {
              if (currentRepeat.childIndent == null) {
                currentRepeat.childIndent = indent;
              }
              if (indent >= currentRepeat.childIndent) {
                currentRepeat.children.push(block);
              } else {
                finalizeRepeat();
                result.push(block);
              }
            }
          } else {
            result.push(block);
          }
          continue;
        }

        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: `Line ${i + 1} unable to parse: ${line}`,
        });
      }

      finalizeRepeat();
      return result;
    } catch (error) {
      this.logger.error(
        `[parsePlanText] 解析训练计划文本失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * 将结构化 block 转回可手写 DSL
   */
  stringifyPlan(
    blocks: PlanBlock[],
    options?: { sportType?: WorkoutExpressionSportType },
  ): string {
    const lines: string[] = [];
    const indentUnit = '  ';

    const formatClock = (seconds: number) => {
      const safe = Math.max(0, Math.round(seconds));
      const hours = Math.floor(safe / 3600);
      const minutes = Math.floor((safe % 3600) / 60);
      const secs = safe % 60;
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
          .toString()
          .padStart(2, '0')}`;
      }
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    const stripNum = (n: number): string => {
      return Number(n).toString();
    };

    const formatZoneToken = (
      target: NonNullable<WorkRestStep['primaryTargetMeta']>,
    ): string | null => {
      if (
        typeof target.zoneIndex !== 'number' ||
        !Number.isFinite(target.zoneIndex) ||
        target.zoneIndex <= 0
      ) {
        return null;
      }
      return `z${stripNum(target.zoneIndex)}`;
    };

    const formatDuration = (step: WorkRestStep): string => {
      const meta = step.durationMeta;
      if (meta?.kind === 'DISTANCE' && typeof meta.value === 'number') {
        if (meta.unit === 'METERS') {
          return meta.value >= 1000 && meta.value % 1000 === 0
            ? `${stripNum(meta.value / 1000)}km`
            : `${stripNum(meta.value)}m`;
        }
        return `${stripNum(meta.value)}km`;
      }
      if (meta?.kind === 'OPEN') {
        return 'open';
      }
      if (meta?.kind === 'CALORIES' && typeof meta.value === 'number') {
        return `${stripNum(meta.value)}kj`;
      }
      if (meta?.kind === 'HR_LESS_THAN' && typeof meta.value === 'number') {
        return `hr<${stripNum(meta.value)}bpm`;
      }
      if (meta?.kind === 'HR_GREATER_THAN' && typeof meta.value === 'number') {
        return `hr>${stripNum(meta.value)}bpm`;
      }
      if (meta?.kind === 'POWER_LESS_THAN' && typeof meta.value === 'number') {
        return `power<${stripNum(meta.value)}W`;
      }
      if (
        meta?.kind === 'POWER_GREATER_THAN' &&
        typeof meta.value === 'number'
      ) {
        return `power>${stripNum(meta.value)}W`;
      }
      if (
        meta?.kind === 'CADENCE_LESS_THAN' &&
        typeof meta.value === 'number'
      ) {
        return `cadence<${stripNum(meta.value)}rpm`;
      }
      if (
        meta?.kind === 'CADENCE_GREATER_THAN' &&
        typeof meta.value === 'number'
      ) {
        return `cadence>${stripNum(meta.value)}rpm`;
      }
      const seconds =
        meta?.kind === 'TIME' && typeof meta.value === 'number'
          ? meta.value
          : step.duration;

      if (seconds % 3600 === 0 && seconds >= 3600) {
        return `${seconds / 3600}h`;
      }
      if (seconds % 60 === 0 && seconds >= 60) {
        return `${Math.floor(seconds / 60)}m`;
      }
      return `${seconds}s`;
    };

    const formatStepType = (
      blockType: WorkRestBlock['type'],
      step: WorkRestStep,
    ) => {
      switch (step.stepKind) {
        case 'WARMUP':
          return 'warmup';
        case 'RECOVERY':
          return 'recovery';
        case 'REST':
          return 'rest';
        case 'COOLDOWN':
          return 'cooldown';
        case 'OTHER':
          return 'other';
        case 'WORK':
          return 'work';
        default:
          return blockType === 'rest' ? 'rest' : 'work';
      }
    };

    const formatRange = (
      low: number | undefined,
      high: number | undefined,
      formatter: (value: number) => string,
      suffix = '',
    ) => {
      if (
        Number.isFinite(low as number) &&
        Number.isFinite(high as number) &&
        high !== low
      ) {
        return `${formatter(low as number)}-${formatter(high as number)}${suffix}`;
      }
      if (
        Number.isFinite(low as number) &&
        Number.isFinite(high as number) &&
        high === low
      ) {
        return `${formatter(low as number)}${suffix}`;
      }
      if (Number.isFinite(low as number)) {
        return `>${formatter(low as number)}${suffix}`;
      }
      if (Number.isFinite(high as number)) {
        return `<${formatter(high as number)}${suffix}`;
      }
      return null;
    };

    const formatStepTargets = (step: WorkRestStep): string[] => {
      const tokens: string[] = [];

      const targetMetas = [step.primaryTargetMeta].filter(
        (target): target is NonNullable<WorkRestStep['primaryTargetMeta']> =>
          Boolean(target) && target?.kind !== 'NONE',
      );

      if (targetMetas.length > 0) {
        for (const target of targetMetas) {
          if (target.kind === 'SPEED') {
            const zoneToken = formatZoneToken(target);
            if (zoneToken) {
              const label =
                `${options?.sportType ?? ''}`.toUpperCase() === 'CYCLING'
                  ? 'speed'
                  : 'pace';
              tokens.push(label, zoneToken);
              continue;
            }

            const unit = normalizeExpressionSpeedUnit(
              target.unit,
              options?.sportType,
            );
            if (`${options?.sportType ?? ''}`.toUpperCase() === 'CYCLING') {
              const low =
                typeof target.value === 'number'
                  ? averageExpressionSpeedAsKmh(target.value, undefined, unit)
                  : undefined;
              const high =
                typeof target.valueHigh === 'number'
                  ? averageExpressionSpeedAsKmh(
                      target.valueHigh,
                      undefined,
                      unit,
                    )
                  : undefined;
              const formatted = formatRange(
                low,
                high,
                (value) => stripNum(value),
                'km/h',
              );
              if (formatted) tokens.push('speed', formatted);
              continue;
            }

            const formatted = formatRange(
              target.value,
              target.valueHigh,
              (value) => formatClock(value),
            );
            if (formatted) {
              if (unit === 'sec/100m') {
                tokens.push('pace', formatted, '100m');
              } else {
                // 1000m 为默认单位，省略单位 token。
                tokens.push('pace', formatted);
              }
            }
            continue;
          }

          if (target.kind === 'CADENCE') {
            const unit = target.unit === 'spm' ? 'spm' : 'rpm';
            const formatted = formatRange(
              target.value,
              target.valueHigh,
              (value) => stripNum(value),
              unit,
            );
            if (formatted) tokens.push('cadence', formatted);
            continue;
          }

          if (
            target.kind === 'HEART_RATE_ZONE' ||
            target.kind === 'HEART_RATE_CUSTOM'
          ) {
            if (target.kind === 'HEART_RATE_ZONE') {
              const zoneToken = formatZoneToken(target);
              if (zoneToken) {
                tokens.push('hr', zoneToken);
                continue;
              }
            }

            const formatted = formatRange(
              target.value,
              target.valueHigh,
              (value) => stripNum(value),
              'bpm',
            );
            if (formatted) tokens.push('hr', formatted);
            continue;
          }

          if (target.kind === 'POWER_ZONE' || target.kind === 'POWER_CUSTOM') {
            if (target.kind === 'POWER_ZONE') {
              const zoneToken = formatZoneToken(target);
              if (zoneToken) {
                tokens.push('power', zoneToken);
                continue;
              }
            }

            const formatted = formatRange(
              target.value,
              target.valueHigh,
              (value) => stripNum(value),
              target.unit === 'W' ? 'W' : '%',
            );
            if (formatted) tokens.push('power', formatted);
            continue;
          }
        }
      } else if (step.powerWatts != null) {
        tokens.push('power', `${stripNum(step.powerWatts)}W`);
      } else if (step.power != null) {
        tokens.push('power', `${stripNum(Math.round(step.power * 100))}%`);
      } else if (step.cadence != null) {
        tokens.push('cadence', `${stripNum(step.cadence)}rpm`);
      } else if (step.heartRateBpm != null) {
        tokens.push('hr', `${stripNum(step.heartRateBpm)}bpm`);
      } else if (step.paceKmh != null) {
        const speedUnit = getExpressionSpeedUnitForSport(options?.sportType);
        const label =
          `${options?.sportType ?? ''}`.toUpperCase() === 'CYCLING'
            ? 'speed'
            : 'pace';
        if (label === 'speed') {
          tokens.push(label, `${stripNum(step.paceKmh)}km/h`);
        } else {
          const paceSeconds =
            speedUnit === 'sec/100m' ? 360 / step.paceKmh : 3600 / step.paceKmh;
          const formatted = formatClock(Math.round(paceSeconds));
          if (speedUnit === 'sec/100m') {
            tokens.push(label, formatted, '100m');
          } else {
            tokens.push(label, formatted);
          }
        }
      }

      if (step.gradeDeg != null) {
        tokens.push('grade', `${stripNum(step.gradeDeg)}°`);
      }

      return tokens;
    };

    const emitBlock = (block: PlanBlock, indentLevel: number) => {
      const indent = indentUnit.repeat(indentLevel);
      if (block.type === 'repeat') {
        const selector = block.until
          ? `until ${formatDuration({
              duration: block.until.kind === 'TIME' ? block.until.value : 0,
              durationMeta: {
                kind: block.until.kind,
                value: block.until.value,
                unit: block.until.unit === 'CALORIES' ? 'KJ' : block.until.unit,
              },
            })}`
          : `${block.count}`;
        lines.push(`${indent}repeat ${selector} {`);
        for (const child of block.children) {
          emitBlock(child, indentLevel + 1);
        }
        lines.push(`${indent}}`);
      } else {
        for (const step of block.steps) {
          const targetTokens = formatStepTargets(step);
          const dur = formatDuration(step);
          lines.push(
            `${indent}${formatStepType(block.type, step)} ${dur}${
              targetTokens.length ? ' ' + targetTokens.join(' ') : ''
            }`,
          );
        }
      }
    };

    for (const block of blocks) {
      emitBlock(block, 0);
    }
    return lines.join('\n');
  }
}
