import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  PlanLoadSource,
  PlanWorkoutStatus,
  SportType,
  UserFitnessMetricType,
  WorkoutPlanStepDurationType,
  WorkoutPlanStepIntensity,
  WorkoutPlanStepTargetType,
  WorkoutPlanValueUnit,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import {
  WorkoutService,
  type WorkoutPlanStepDraft,
} from '@/api/workout/workout.service';
import { computeSessionRpeLoad } from '@/training-load/session-rpe-load';
import {
  resolveLthrForCalculation,
  type LthrCalculationSource,
} from '@shared/lthr';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import type { PlanDb } from '../persistence/plan-db';
import { PlanWorkoutTargetResolver } from './plan-workout-target-resolver.service';

/**
 * 计划训练「期望负荷」估算
 * ============================
 * 公式：Σ IF² × (sec/3600) × 100，量纲与 bikeStress / trimp100 一致（100 = 1h @ 阈值）。
 * - 严格 DSL-驱动：每 step 看自己的 targetType；混 target type OK。
 * - 仅缺阈值的那几步降级到 RPE 兜底，其余照常 DSL 翻译。
 * - 持续时长：TIME 直接转秒；DISTANCE 用 step 速度反推；缺速度时优先用用户阈值配速换算地面速度，再退回固定经验 km/h。
 * - 阈值：`UserService.getComposedUserProfile`（与 App 其它入口一致）；游泳 TP/CSS 需单独按泳姿 sport 读 metric。
 * - 步骤：DB `PlanWorkoutStep` 保存结构和 Z4 等语义引用；估算前由 `PlanWorkoutTargetResolver` 解析当前区间。若无行仅有 text，再 `parsePlanText` → `buildWorkoutPlanSteps`。
 * - estimatedLoadSource：按贡献加权选 top1 主导 target（POWER / HR / PACE / RPE）。
 */

/** intensity → IF 兜底（也用作目标类型缺阈值时的退化） */
const INTENSITY_FALLBACK_IF: Record<WorkoutPlanStepIntensity, number> = {
  WARMUP: 0.55,
  COOLDOWN: 0.55,
  RECOVERY: 0.45,
  REST: 0.45,
  ACTIVE: 0.7,
  INTERVAL: 0.95,
  OTHER: 0.65,
};

/** 不指定 intensity 时的总兜底 IF（视为 ACTIVE 一档） */
const DEFAULT_IF = 0.65;

/** 无法从用户阈值配速反推地面速度时的经验默认（km/h） */
const FALLBACK_KMH: Record<string, number> = {
  CYCLING: 25,
  RUN: 12,
  SWIM: 1.5,
  STRETCHING: 4,
  UNKNOWN: 8,
};

export type EstimateBucket = 'POWER' | 'HR' | 'PACE' | 'RPE';

export interface ThresholdSnapshot {
  ftp: number | null;
  cp: number | null;
  maxHeartRate: number | null;
  lthr: number | null;
  /** 跑步 TP（sec/km） */
  runThresholdPaceSecPerKm: number | null;
  /** 游泳 CSS（sec/100m） */
  swimThresholdPaceSecPer100m: number | null;
}

export interface EstimateStepContribution {
  stepId?: string | null;
  parentId?: string | null;
  bucket: EstimateBucket;
  ifValue: number;
  durationSec: number;
  contribution: number;
  partialEstimate: boolean;
  reason?: string;
  thresholdSource?: LthrCalculationSource;
}

export interface EstimateInputs {
  thresholds: ThresholdSnapshot;
  bySteps: EstimateStepContribution[];
  /** 整张 workout 没有任何可估算 step 时为 true（UI 兜底用） */
  empty: boolean;
  /** 主导 target 与次席的 contribution 占比差小于 10% 时为 true（mixedSource 提示用） */
  mixedSource?: boolean;
  strength?: {
    formulaVersion: 1;
    durationMinutes: number;
    sessionRpeRating: number;
    rawAu: number;
    normalizedLoad: number;
  };
  sessionRpe?: {
    formulaVersion: 1;
    durationMinutes: number;
    rating: number;
    rawAu: number;
    normalizedLoad: number;
  };
}

export interface EstimateResult {
  estimatedLoad: number | null;
  estimatedLoadSource: PlanLoadSource;
  estimatedLoadInputs: EstimateInputs;
}

interface PlanWorkoutStepRow {
  id: string;
  parentId: string | null;
  orderIndex: number;
  stepType: string;
  intensity: WorkoutPlanStepIntensity | null;
  durationType: WorkoutPlanStepDurationType;
  durationValue: number | null;
  durationUnit: WorkoutPlanValueUnit | null;
  targetType: WorkoutPlanStepTargetType | null;
  targetValueLow: number | null;
  targetValueHigh: number | null;
  targetUnit: WorkoutPlanValueUnit | null;
  notes?: string | null;
}

@Injectable()
export class PlanLoadEstimatorService {
  private readonly logger = new Logger(PlanLoadEstimatorService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly workoutService: WorkoutService,
    private readonly plans: PlanRepository,
    private readonly workouts: PlanWorkoutRepository,
    @Optional()
    private readonly workoutTargetResolver?: PlanWorkoutTargetResolver,
  ) {}

  /**
   * 读取用户阈值快照：走 `UserService.getComposedUserProfile`，与产品其它入口的 FTP/LTHR/跑步阈速一致。
   * 跑步：composed `tp` / `cs` 为速度（m/s），换算成 sec/km 供 IF 与距离反推使用。
   * 游泳：`getComposedUserProfile` 当前未组装泳姿 TP/CSS，这里按 SWIM sport 读取同日生效的 MANUAL/AUTO。
   */
  async loadThresholdsForUser(
    userId: string,
    sport: SportType,
    tx?: PlanDb,
  ): Promise<ThresholdSnapshot> {
    const profile = tx
      ? await this.userService.getComposedUserProfile(
          userId,
          sport,
          undefined,
          tx,
        )
      : await this.userService.getComposedUserProfile(userId, sport);

    const ftp = profile?.ftp ?? null;
    const cp = profile?.cp ?? null;
    const maxHeartRate = profile?.maxHeartRate ?? null;
    const lthr = profile?.lthr ?? null;

    let runThresholdPaceSecPerKm: number | null = null;
    if (sport === SportType.RUN && profile) {
      if (typeof profile.tp === 'number' && profile.tp > 0) {
        // getComposedUserProfile：跑步 tp 为阈速（m/s）
        runThresholdPaceSecPerKm = 1000 / profile.tp;
      } else if (typeof profile.cs === 'number' && profile.cs > 0) {
        runThresholdPaceSecPerKm = 1000 / profile.cs;
      }
    }

    let swimThresholdPaceSecPer100m: number | null = null;
    if (sport === SportType.SWIM) {
      swimThresholdPaceSecPer100m = await this.loadSwimThresholdPaceSecPer100m(
        userId,
        tx,
      );
    }

    return {
      ftp,
      cp,
      maxHeartRate,
      lthr,
      runThresholdPaceSecPerKm,
      swimThresholdPaceSecPer100m,
    };
  }

  /** 游泳阈值配速（sec/100m）：TP 优先，否则 CS（m/s）换算。 */
  private async loadSwimThresholdPaceSecPer100m(
    userId: string,
    tx?: PlanDb,
  ): Promise<number | null> {
    const readMetric = (metricType: UserFitnessMetricType) =>
      tx
        ? this.userService.getEffectiveUserFitnessMetric(
            userId,
            metricType,
            undefined,
            SportType.SWIM,
            tx,
          )
        : this.userService.getEffectiveUserFitnessMetric(
            userId,
            metricType,
            undefined,
            SportType.SWIM,
          );
    const [tp, cs] = await Promise.all([
      readMetric(UserFitnessMetricType.TP),
      readMetric(UserFitnessMetricType.CS),
    ]);
    if (typeof tp?.value === 'number' && tp.value > 0) {
      return tp.value;
    }
    if (typeof cs?.value === 'number' && cs.value > 0) {
      return 100 / cs.value;
    }
    return null;
  }

  /**
   * DISTANCE 步骤缺少 step 自身速度时：用地速（km/h）反推时长。
   * 优先用用户阈值配速换算；骑车 POWER 步可用 IF × 参考阈速；最后再 FALLBACK_KMH。
   */
  private resolveFallbackKmh(
    sport: SportType,
    thresholds: ThresholdSnapshot,
    bucket: EstimateBucket,
    ifValue: number,
  ): number {
    if (
      sport === SportType.RUN &&
      thresholds.runThresholdPaceSecPerKm &&
      thresholds.runThresholdPaceSecPerKm > 0
    ) {
      return 3600 / thresholds.runThresholdPaceSecPerKm;
    }
    if (
      sport === SportType.SWIM &&
      thresholds.swimThresholdPaceSecPer100m &&
      thresholds.swimThresholdPaceSecPer100m > 0
    ) {
      return 360 / thresholds.swimThresholdPaceSecPer100m;
    }
    const ftp = thresholds.ftp ?? thresholds.cp;
    if (
      sport === SportType.CYCLING &&
      bucket === 'POWER' &&
      ifValue > 0 &&
      ftp &&
      ftp > 0
    ) {
      return Math.min(55, Math.max(18, ifValue * 36));
    }
    return FALLBACK_KMH[sport] ?? 10;
  }

  /** 把 durationValue + durationUnit 解释成秒；非 TIME/DISTANCE 步骤返回 null。 */
  private resolveDurationSeconds(
    sport: SportType,
    step: PlanWorkoutStepRow,
    bucket: EstimateBucket,
    ifValue: number,
    thresholds: ThresholdSnapshot,
  ): { sec: number | null; partial: boolean } {
    const value = step.durationValue ?? 0;
    if (value <= 0) return { sec: null, partial: false };

    if (step.durationType === WorkoutPlanStepDurationType.TIME) {
      return {
        sec: this.normalizeTimeUnit(value, step.durationUnit),
        partial: false,
      };
    }
    if (step.durationType === WorkoutPlanStepDurationType.DISTANCE) {
      const meters = this.normalizeMeters(value, step.durationUnit);
      if (meters <= 0) return { sec: null, partial: false };

      // 优先用 step 自己的速度（SPEED target）；否则按 IF 反推阈速；都不行用兜底速度
      let speedMps: number | null = null;
      if (
        step.targetType === WorkoutPlanStepTargetType.SPEED &&
        bucket === 'PACE'
      ) {
        const stepPaceSecPerUnit = this.midPaceSecPerUnit(step);
        if (stepPaceSecPerUnit) {
          speedMps =
            sport === SportType.SWIM
              ? 100 / stepPaceSecPerUnit
              : 1000 / stepPaceSecPerUnit;
        }
      }
      if (
        speedMps == null &&
        bucket === 'PACE' &&
        thresholds.runThresholdPaceSecPerKm &&
        sport === SportType.RUN &&
        ifValue > 0
      ) {
        const thresholdMps = 1000 / thresholds.runThresholdPaceSecPerKm;
        speedMps = thresholdMps * ifValue;
      }
      if (
        speedMps == null &&
        bucket === 'PACE' &&
        thresholds.swimThresholdPaceSecPer100m &&
        sport === SportType.SWIM &&
        ifValue > 0
      ) {
        const thresholdMps = 100 / thresholds.swimThresholdPaceSecPer100m;
        speedMps = thresholdMps * ifValue;
      }
      if (speedMps == null) {
        const kmh = this.resolveFallbackKmh(sport, thresholds, bucket, ifValue);
        speedMps = kmh / 3.6;
      }
      return { sec: meters / speedMps, partial: true };
    }
    return { sec: null, partial: false };
  }

  private normalizeTimeUnit(
    value: number,
    unit: WorkoutPlanValueUnit | null,
  ): number {
    if (unit == null || unit === WorkoutPlanValueUnit.SECONDS) return value;
    return value;
  }

  private normalizeMeters(
    value: number,
    unit: WorkoutPlanValueUnit | null,
  ): number {
    if (unit === WorkoutPlanValueUnit.METERS || unit == null) return value;
    return value;
  }

  private midPaceSecPerUnit(step: PlanWorkoutStepRow): number | null {
    const low = step.targetValueLow;
    const high = step.targetValueHigh;
    let base: number | null = null;
    if (low != null && high != null && low > 0 && high > 0) {
      base = (low + high) / 2;
    } else if (low != null && low > 0) {
      base = low;
    } else if (high != null && high > 0) {
      base = high;
    }
    if (base == null) return null;
    if (step.targetUnit === WorkoutPlanValueUnit.KMH) {
      // KMH → sec/km
      if (base <= 0) return null;
      return 3600 / base;
    }
    return base;
  }

  /** 把 POWER / HR / SPEED 目标转成 IF（=阈值归一化）。返回 null 表示无法估出。 */
  private computeIfFromTarget(
    sport: SportType,
    step: PlanWorkoutStepRow,
    thresholds: ThresholdSnapshot,
  ): {
    ifValue: number | null;
    bucket: EstimateBucket;
    thresholdSource?: LthrCalculationSource;
  } {
    const target = step.targetType;
    const low = step.targetValueLow;
    const high = step.targetValueHigh;
    const unit = step.targetUnit;
    const mid = this.midValue(low, high);

    if (target === WorkoutPlanStepTargetType.POWER) {
      if (mid == null) return { ifValue: null, bucket: 'POWER' };
      if (unit === WorkoutPlanValueUnit.PERCENT) {
        return { ifValue: clampIf(mid / 100), bucket: 'POWER' };
      }
      const ftp = thresholds.ftp ?? thresholds.cp;
      if (!ftp || ftp <= 0) return { ifValue: null, bucket: 'POWER' };
      return { ifValue: clampIf(mid / ftp), bucket: 'POWER' };
    }

    if (target === WorkoutPlanStepTargetType.HEART_RATE) {
      if (mid == null) return { ifValue: null, bucket: 'HR' };
      if (unit === WorkoutPlanValueUnit.PERCENT) {
        return { ifValue: clampIf(mid / 100), bucket: 'HR' };
      }
      const lthr = resolveLthrForCalculation({
        lthr: thresholds.lthr,
        maxHeartRate: thresholds.maxHeartRate,
      });
      if (!lthr) return { ifValue: null, bucket: 'HR' };
      return {
        ifValue: clampIf(mid / lthr.value),
        bucket: 'HR',
        thresholdSource: lthr.source,
      };
    }

    if (target === WorkoutPlanStepTargetType.SPEED) {
      if (sport === SportType.RUN) {
        const tp = thresholds.runThresholdPaceSecPerKm;
        if (!tp || tp <= 0) return { ifValue: null, bucket: 'PACE' };
        const stepPaceSecPerKm = this.midPaceSecPerUnit(step);
        if (!stepPaceSecPerKm || stepPaceSecPerKm <= 0) {
          return { ifValue: null, bucket: 'PACE' };
        }
        return { ifValue: clampIf(tp / stepPaceSecPerKm), bucket: 'PACE' };
      }
      if (sport === SportType.SWIM) {
        const css = thresholds.swimThresholdPaceSecPer100m;
        if (!css || css <= 0) return { ifValue: null, bucket: 'PACE' };
        const stepPaceSecPer100m = this.midPaceSecPerUnit(step);
        if (!stepPaceSecPer100m || stepPaceSecPer100m <= 0) {
          return { ifValue: null, bucket: 'PACE' };
        }
        return {
          ifValue: clampIf(css / stepPaceSecPer100m),
          bucket: 'PACE',
        };
      }
      // 骑车 SPEED 目标罕见；直接退化到 RPE
      return { ifValue: null, bucket: 'PACE' };
    }

    // CADENCE / GRADE / OPEN：均无直接强度，走 RPE 兜底
    return { ifValue: null, bucket: 'RPE' };
  }

  private midValue(low: number | null, high: number | null): number | null {
    if (low != null && high != null && low > 0 && high > 0)
      return (low + high) / 2;
    if (low != null && low > 0) return low;
    if (high != null && high > 0) return high;
    return null;
  }

  /** 展开 REPEAT 子树：返回 leaf step 列表，REPEAT 容器按 durationValue 当作重复次数累乘 */
  private flattenSteps(
    rows: PlanWorkoutStepRow[],
  ): { step: PlanWorkoutStepRow; multiplier: number }[] {
    const byParent = new Map<string | null, PlanWorkoutStepRow[]>();
    for (const r of rows) {
      const key = r.parentId ?? null;
      const list = byParent.get(key) ?? [];
      list.push(r);
      byParent.set(key, list);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => a.orderIndex - b.orderIndex);
    }

    const out: { step: PlanWorkoutStepRow; multiplier: number }[] = [];
    const walk = (parentId: string | null, multiplier: number) => {
      const list = byParent.get(parentId) ?? [];
      for (const step of list) {
        if (step.stepType === 'REPEAT') {
          let times = 1;
          if (
            step.durationType === WorkoutPlanStepDurationType.REPEAT_COUNT &&
            typeof step.durationValue === 'number' &&
            step.durationValue > 0
          ) {
            times = Math.round(step.durationValue);
          }
          walk(step.id, multiplier * Math.max(1, times));
        } else {
          out.push({ step, multiplier });
        }
      }
    };
    walk(null, 1);
    return out;
  }

  /** 纯逻辑：给定 workout（含 steps）和阈值快照，算出估值与归因 */
  estimate(args: {
    sport: SportType;
    steps: PlanWorkoutStepRow[];
    thresholds: ThresholdSnapshot;
    plannedSessionRpe?: number | null;
  }): EstimateResult {
    const { sport, steps, thresholds, plannedSessionRpe } = args;
    const flat = this.flattenSteps(steps);

    const contributions: EstimateStepContribution[] = [];
    let totalLoad = 0;

    for (const { step, multiplier } of flat) {
      const targetResult = this.computeIfFromTarget(sport, step, thresholds);
      let ifValue = targetResult.ifValue;
      let bucket = targetResult.bucket;
      let partial = false;
      let reason: string | undefined;

      if (ifValue == null) {
        // 缺阈值或目标缺信息 → 退到 intensity 常量（RPE 兜底）
        const fallback = step.intensity
          ? INTENSITY_FALLBACK_IF[step.intensity]
          : DEFAULT_IF;
        ifValue = clampIf(fallback);
        if (
          targetResult.bucket === 'POWER' ||
          targetResult.bucket === 'HR' ||
          targetResult.bucket === 'PACE'
        ) {
          partial = true;
          reason = `missing_threshold_${targetResult.bucket.toLowerCase()}`;
        }
        bucket = 'RPE';
      }

      const { sec, partial: durationPartial } = this.resolveDurationSeconds(
        sport,
        step,
        bucket,
        ifValue,
        thresholds,
      );
      if (sec == null || sec <= 0) continue;

      const stepLoad = ifValue * ifValue * (sec / 3600) * 100 * multiplier;
      totalLoad += stepLoad;

      contributions.push({
        stepId: step.id ?? null,
        parentId: step.parentId ?? null,
        bucket,
        ifValue,
        durationSec: sec * multiplier,
        contribution: stepLoad,
        partialEstimate: partial || durationPartial,
        reason,
        thresholdSource: targetResult.thresholdSource,
      });
    }

    if (contributions.length === 0 || totalLoad <= 0) {
      return {
        estimatedLoad: null,
        estimatedLoadSource: PlanLoadSource.NONE,
        estimatedLoadInputs: {
          thresholds,
          bySteps: [],
          empty: true,
        },
      };
    }

    const sessionRpeLoad = computeSessionRpeLoad({
      rating: plannedSessionRpe,
      timerTimeSeconds: contributions.reduce(
        (total, contribution) => total + contribution.durationSec,
        0,
      ),
    });
    if (sessionRpeLoad) {
      return {
        estimatedLoad: round(sessionRpeLoad.normalizedLoad, 1),
        estimatedLoadSource: PlanLoadSource.SESSION_RPE,
        estimatedLoadInputs: {
          thresholds,
          bySteps: contributions,
          empty: false,
          sessionRpe: {
            formulaVersion: 1,
            durationMinutes: sessionRpeLoad.durationMinutes,
            rating: sessionRpeLoad.rating,
            rawAu: sessionRpeLoad.rawAu,
            normalizedLoad: sessionRpeLoad.normalizedLoad,
          },
        },
      };
    }

    const buckets: Record<EstimateBucket, number> = {
      POWER: 0,
      HR: 0,
      PACE: 0,
      RPE: 0,
    };
    for (const c of contributions) {
      buckets[c.bucket] += c.contribution;
    }
    const sortedBuckets = (Object.keys(buckets) as EstimateBucket[])
      .map((k) => ({ bucket: k, value: buckets[k] }))
      .sort((a, b) => b.value - a.value);
    const dominant = sortedBuckets[0]!;
    const second = sortedBuckets[1];
    const mixedSource =
      second != null &&
      second.value > 0 &&
      Math.abs(dominant.value - second.value) / dominant.value < 0.1;

    return {
      estimatedLoad: round(totalLoad, 1),
      estimatedLoadSource: bucketToEnum(dominant.bucket),
      estimatedLoadInputs: {
        thresholds,
        bySteps: contributions,
        empty: false,
        mixedSource: mixedSource ? true : undefined,
      },
    };
  }

  /**
   * 将 DSL 解析产物（与保存 workout 时同源）铺平成与 DB step 行相同的结构，
   * 供 flattenSteps / estimate 使用。
   */
  private draftsToFlatRows(
    drafts: WorkoutPlanStepDraft[],
  ): PlanWorkoutStepRow[] {
    const rows: PlanWorkoutStepRow[] = [];
    let seq = 0;
    const nextId = () => `dsl-${seq++}`;
    const walk = (nodes: WorkoutPlanStepDraft[], parentId: string | null) => {
      for (const d of nodes) {
        const id = nextId();
        rows.push({
          id,
          parentId,
          orderIndex: d.orderIndex,
          stepType: d.stepType,
          intensity: (d.intensity ?? null) as WorkoutPlanStepIntensity | null,
          durationType: d.durationType as WorkoutPlanStepDurationType,
          durationValue: d.durationValue ?? null,
          durationUnit: (d.durationUnit ?? null) as WorkoutPlanValueUnit | null,
          targetType: (d.targetType ??
            null) as WorkoutPlanStepTargetType | null,
          targetValueLow: d.targetValueLow ?? null,
          targetValueHigh: d.targetValueHigh ?? null,
          targetUnit: (d.targetUnit ?? null) as WorkoutPlanValueUnit | null,
        });
        if (d.stepType === 'REPEAT' && d.children?.length) {
          walk(d.children, id);
        }
      }
    };
    walk(drafts, null);
    return rows;
  }

  /**
   * 优先使用 DB 已物化的步骤树（激活/编辑时由 DSL 写入）；若无则当场解析 `text`，
   * 与 `PlanService.replaceWorkoutSteps` 同源。
   */
  private resolvePlanStepsForEstimate(workout: {
    text?: string | null;
    steps?: PlanWorkoutStepRow[] | null;
  }): PlanWorkoutStepRow[] {
    const persisted = Array.isArray(workout.steps) ? workout.steps : [];
    if (persisted.length > 0) {
      return persisted as PlanWorkoutStepRow[];
    }
    const raw = typeof workout.text === 'string' ? workout.text.trim() : '';
    if (!raw) {
      return [];
    }
    try {
      const blocks = this.workoutService.parsePlanText(raw);
      const drafts = this.workoutService.buildWorkoutPlanSteps(blocks);
      return this.draftsToFlatRows(drafts);
    } catch (err) {
      this.logger.warn(
        `[PlanLoadEstimator] parse DSL fallback failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }

  private estimateStrength(workout: {
    plannedDurationSeconds?: number | null;
    plannedSessionRpe?: number | null;
  }): EstimateResult {
    const emptyInputs: EstimateInputs = {
      thresholds: {
        ftp: null,
        cp: null,
        maxHeartRate: null,
        lthr: null,
        runThresholdPaceSecPerKm: null,
        swimThresholdPaceSecPer100m: null,
      },
      bySteps: [],
      empty: true,
    };
    const load = computeSessionRpeLoad({
      rating: workout.plannedSessionRpe,
      timerTimeSeconds: workout.plannedDurationSeconds,
    });
    if (!load) {
      return {
        estimatedLoad: null,
        estimatedLoadSource: PlanLoadSource.NONE,
        estimatedLoadInputs: emptyInputs,
      };
    }
    return {
      estimatedLoad: round(load.normalizedLoad, 1),
      estimatedLoadSource: PlanLoadSource.SESSION_RPE,
      estimatedLoadInputs: {
        ...emptyInputs,
        empty: false,
        strength: {
          formulaVersion: 1,
          durationMinutes: load.durationMinutes,
          sessionRpeRating: load.rating,
          rawAu: load.rawAu,
          normalizedLoad: load.normalizedLoad,
        },
      },
    };
  }

  async estimateForViewerWorkouts(
    userId: string,
    workouts: Array<{
      sportType: string;
      structureKind?: string | null;
      text?: string | null;
      durationSeconds?: number | null;
      plannedSessionRpe?: number | null;
    }>,
  ): Promise<
    Array<{
      estimatedLoad: number | null;
      estimatedLoadSource: PlanLoadSource;
    }>
  > {
    const sports = [
      ...new Set(workouts.map((workout) => asViewerSport(workout.sportType))),
    ];
    const thresholdsBySport = new Map<SportType, ThresholdSnapshot>();
    await Promise.all(
      sports.map(async (sport) => {
        thresholdsBySport.set(
          sport,
          await this.loadThresholdsForUser(userId, sport),
        );
      }),
    );

    return workouts.map((workout) => {
      const kind = String(workout.structureKind ?? 'ENDURANCE').toUpperCase();
      if (kind === 'STRENGTH' || kind === 'FREEFORM') {
        const result = this.estimateStrength({
          plannedDurationSeconds: workout.durationSeconds,
          plannedSessionRpe: workout.plannedSessionRpe,
        });
        return {
          estimatedLoad: result.estimatedLoad,
          estimatedLoadSource: result.estimatedLoadSource,
        };
      }
      const sport = asViewerSport(workout.sportType);
      const result = this.estimate({
        sport,
        steps: this.resolvePlanStepsForEstimate({ text: workout.text }),
        thresholds: thresholdsBySport.get(sport)!,
        plannedSessionRpe: workout.plannedSessionRpe,
      });
      return {
        estimatedLoad: result.estimatedLoad,
        estimatedLoadSource: result.estimatedLoadSource,
      };
    });
  }

  /** 计算单节课并写回快照（含阈值读取）。Tx 可选；缺省走全局 prisma。 */
  async applyForWorkout(
    workoutId: string,
    options?: { tx?: PlanDb; persistDraft?: boolean },
  ): Promise<EstimateResult | null> {
    const tx = options?.tx;
    const workout = await this.workouts.findUnique(
      {
        where: { id: workoutId },
        include: {
          plan: { select: { userId: true, status: true } },
          steps: {
            orderBy: [{ parentId: 'asc' }, { orderIndex: 'asc' }],
          },
        },
      },
      tx,
    );
    const userId = workout?.userId ?? workout?.plan?.userId ?? null;
    if (!workout || !userId) return null;
    if (
      workout.plan?.status === 'COMPLETED' ||
      workout.plan?.status === 'CANCELLED'
    ) {
      // 历史课不再重算
      return null;
    }
    if (workout.plan?.status === 'DRAFT' && !options?.persistDraft) {
      // 草稿态绝不落库
      await this.workouts.update(
        {
          where: { id: workoutId },
          data: {
            estimatedLoad: null,
            estimatedLoadSource: null,
            estimatedLoadInputs: undefined,
            estimatedLoadComputedAt: null,
          },
        },
        tx,
      );
      return null;
    }

    const result =
      workout.structureKind === 'STRENGTH'
        ? this.estimateStrength(workout)
        : workout.structureKind === 'FREEFORM'
          ? this.estimateStrength({})
          : await (async () => {
              const currentWorkout = this.workoutTargetResolver
                ? await this.workoutTargetResolver.resolveWorkout(
                    userId,
                    workout,
                    tx,
                  )
                : workout;
              const thresholds = await this.loadThresholdsForUser(
                userId,
                workout.sportType,
                tx,
              );
              return this.estimate({
                sport: workout.sportType,
                steps: this.resolvePlanStepsForEstimate(currentWorkout),
                thresholds,
                plannedSessionRpe: workout.plannedSessionRpe,
              });
            })();

    await this.workouts.update(
      {
        where: { id: workoutId },
        data: {
          estimatedLoad: result.estimatedLoad,
          estimatedLoadSource: result.estimatedLoadSource,
          estimatedLoadInputs: result.estimatedLoadInputs as unknown as object,
          estimatedLoadComputedAt: new Date(),
        },
      },
      tx,
    );

    return result;
  }

  /** 按 plan 全量重算（激活 / 回填 / 手动重算） */
  async applyForPlan(
    planId: string,
    options?: { tx?: PlanDb },
  ): Promise<number> {
    const tx = options?.tx;
    const plan = await this.plans.findUnique(
      {
        where: { id: planId },
        select: { id: true, userId: true, status: true },
      },
      tx,
    );
    if (!plan) return 0;
    if (plan.status === 'DRAFT') return 0; // 不会落库
    if (plan.status === 'COMPLETED' || plan.status === 'CANCELLED') return 0;

    const workouts = await this.workouts.findMany(
      {
        where: {
          planId,
          status: {
            in: [
              PlanWorkoutStatus.PLANNED,
              PlanWorkoutStatus.IN_PROGRESS,
              PlanWorkoutStatus.MOVED,
            ],
          },
        },
        select: { id: true },
      },
      tx,
    );

    let count = 0;
    for (const workout of workouts) {
      try {
        const res = await this.applyForWorkout(workout.id, {
          tx: tx ?? this.prisma,
        });
        if (res) count += 1;
      } catch (err) {
        this.logger.warn(
          `[PlanLoadEstimator] applyForWorkout(${workout.id}) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return count;
  }
}

function asViewerSport(value: string): SportType {
  switch (String(value ?? '').toUpperCase()) {
    case 'CYCLING':
      return SportType.CYCLING;
    case 'SWIM':
      return SportType.SWIM;
    case 'STRETCHING':
      return SportType.STRETCHING;
    case 'RUN':
      return SportType.RUN;
    default:
      return SportType.UNKNOWN;
  }
}

function clampIf(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  // 实操中 IF > 1.5 通常是单位错配；保留上限避免炸数。
  return Math.min(value, 1.5);
}

function round(value: number, digits = 1): number {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

function bucketToEnum(bucket: EstimateBucket): PlanLoadSource {
  switch (bucket) {
    case 'POWER':
      return PlanLoadSource.POWER;
    case 'HR':
      return PlanLoadSource.HR;
    case 'PACE':
      return PlanLoadSource.PACE;
    default:
      return PlanLoadSource.RPE;
  }
}
