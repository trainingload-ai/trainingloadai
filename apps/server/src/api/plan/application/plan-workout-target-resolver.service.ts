import { Injectable, Logger } from '@nestjs/common';
import {
  SportType,
  WorkoutPlanStepTargetType,
  WorkoutPlanValueUnit,
} from '@prisma/client';
import { UserService } from '@/api/user/user.service';
import {
  WorkoutPrescriptionError,
  WorkoutPrescriptionService,
  type PrescriptionTargetDimension,
  type PrescriptionZoneSetting,
} from '@/api/workout/workout-prescription.service';
import type { WorkoutIntensityIntent } from '@shared/endurance-workout-ir';
import type { PlanDb } from '../persistence/plan-db';

export type DynamicPlanWorkoutStep = {
  targetResolutionMode?: string | null;
  targetType?: WorkoutPlanStepTargetType | string | null;
  targetValueLow?: number | null;
  targetValueHigh?: number | null;
  targetUnit?: WorkoutPlanValueUnit | string | null;
  targetZoneIndex?: number | null;
  targetZoneLabel?: string | null;
  targetZoneSystem?: string | null;
  targetZoneSource?: string | null;
  targetZoneBasis?: unknown;
  targetZoneSystemKey?: string | null;
  targetZoneFingerprint?: string | null;
  intensityIntent?: unknown;
  intensity?: string | null;
  name?: string | null;
  notes?: string | null;
  children?: DynamicPlanWorkoutStep[];
};

export type PlanWorkoutWithSteps = {
  sportType: SportType;
  status?: string | null;
  plan?: unknown;
  steps?: DynamicPlanWorkoutStep[];
};

type ZoneSettingCache = Map<string, Promise<PrescriptionZoneSetting | null>>;

const SUPPORTED_SPORTS = new Set<SportType>([
  SportType.RUN,
  SportType.CYCLING,
  SportType.SWIM,
]);

/**
 * 将计划中的语义目标（例如 RUN / PACE / Z4）解析为“当前可执行范围”。
 *
 * 数据库里的 targetZoneIndex 是事实来源；targetValueLow/High 只是历史投影，
 * 不能在读取、负荷估算或第三方导出时直接信任。这个服务只返回克隆后的
 * 当前投影，不修改 PlanWorkoutStep，也不因阈值变化触发计划写事务。
 */
@Injectable()
export class PlanWorkoutTargetResolver {
  private readonly logger = new Logger(PlanWorkoutTargetResolver.name);

  constructor(
    private readonly users: UserService,
    private readonly prescriptions: WorkoutPrescriptionService,
  ) {}

  async resolveWorkout<T extends PlanWorkoutWithSteps>(
    userId: string,
    workout: T,
    tx?: PlanDb,
  ): Promise<T> {
    return this.resolveWorkoutWithCache(userId, workout, new Map(), tx);
  }

  private async resolveWorkoutWithCache<T extends PlanWorkoutWithSteps>(
    userId: string,
    workout: T,
    cache: ZoneSettingCache,
    tx?: PlanDb,
  ): Promise<T> {
    if (
      !workout.steps?.length ||
      !SUPPORTED_SPORTS.has(workout.sportType) ||
      ['DONE', 'SKIPPED'].includes(String(workout.status ?? '')) ||
      this.isTerminalPlan(workout.plan)
    ) {
      return workout;
    }
    return {
      ...workout,
      steps: await this.resolveStepsWithCache(
        userId,
        workout.sportType,
        workout.steps,
        cache,
        tx,
      ),
    } as T;
  }

  async resolveWorkouts<T extends PlanWorkoutWithSteps>(
    userId: string,
    workouts: T[],
    tx?: PlanDb,
  ): Promise<T[]> {
    // 同一批页面/导出通常包含很多同项目训练；每个 sport + dimension 只读一次区间。
    const cache: ZoneSettingCache = new Map();
    return Promise.all(
      workouts.map((workout) =>
        this.resolveWorkoutWithCache(userId, workout, cache, tx),
      ),
    );
  }

  async resolveSteps<T extends DynamicPlanWorkoutStep>(
    userId: string,
    sportType: SportType,
    steps: T[],
    tx?: PlanDb,
  ): Promise<T[]> {
    return this.resolveStepsWithCache(userId, sportType, steps, new Map(), tx);
  }

  private async resolveStepsWithCache<T extends DynamicPlanWorkoutStep>(
    userId: string,
    sportType: SportType,
    steps: T[],
    cache: ZoneSettingCache,
    tx?: PlanDb,
  ): Promise<T[]> {
    if (!SUPPORTED_SPORTS.has(sportType)) return steps;

    const dimensions = new Set<PrescriptionTargetDimension>();
    this.collectDynamicDimensions(steps, dimensions);
    if (!dimensions.size) return steps;

    const settings = new Map<
      PrescriptionTargetDimension,
      PrescriptionZoneSetting | null
    >();
    await Promise.all(
      [...dimensions].map(async (dimension) => {
        settings.set(
          dimension,
          await this.cachedZoneSetting(cache, userId, sportType, dimension, tx),
        );
      }),
    );

    return steps.map((step) =>
      this.resolveStep(step, sportType as 'RUN' | 'CYCLING' | 'SWIM', settings),
    );
  }

  private cachedZoneSetting(
    cache: ZoneSettingCache,
    userId: string,
    sportType: SportType,
    dimension: PrescriptionTargetDimension,
    tx?: PlanDb,
  ): Promise<PrescriptionZoneSetting | null> {
    const key = `${sportType}:${dimension}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const pending = this.readZoneSetting(
      userId,
      sportType,
      dimension,
      tx,
    ).catch((error) => {
      this.logger.warn(
        `Resolve current plan target failed userId=${userId} sport=${sportType} dimension=${dimension}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    });
    cache.set(key, pending);
    return pending;
  }

  private collectDynamicDimensions(
    steps: DynamicPlanWorkoutStep[],
    result: Set<PrescriptionTargetDimension>,
  ) {
    for (const step of steps) {
      if (
        step.targetResolutionMode === 'DYNAMIC_ZONE' &&
        Number.isInteger(step.targetZoneIndex) &&
        Number(step.targetZoneIndex) > 0
      ) {
        const dimension = this.dimensionForTarget(step.targetType);
        if (dimension) result.add(dimension);
      }
      if (step.children?.length) {
        this.collectDynamicDimensions(step.children, result);
      }
    }
  }

  private resolveStep<T extends DynamicPlanWorkoutStep>(
    step: T,
    sportType: 'RUN' | 'CYCLING' | 'SWIM',
    settings: Map<PrescriptionTargetDimension, PrescriptionZoneSetting | null>,
  ): T {
    const children = step.children?.length
      ? step.children.map((child) =>
          this.resolveStep(child, sportType, settings),
        )
      : step.children;
    if (
      step.targetResolutionMode !== 'DYNAMIC_ZONE' ||
      !Number.isInteger(step.targetZoneIndex) ||
      Number(step.targetZoneIndex) <= 0
    ) {
      return (children === step.children ? step : { ...step, children }) as T;
    }

    const dimension = this.dimensionForTarget(step.targetType);
    if (!dimension) return this.unavailableProjection(step, children) as T;
    const zoneSetting = settings.get(dimension);
    if (!zoneSetting) return this.unavailableProjection(step, children) as T;

    try {
      const resolved = this.prescriptions.resolve({
        sportType,
        dimension,
        intent: this.intensityIntent(step),
        zoneSetting,
        zoneIndex: Number(step.targetZoneIndex),
      });
      if (!resolved.target) {
        return this.unavailableProjection(step, children) as T;
      }
      return {
        ...step,
        children,
        targetValueLow: resolved.target.value ?? null,
        targetValueHigh: resolved.target.valueHigh ?? null,
        targetUnit: this.targetUnit(resolved.target.unit),
        targetZoneLabel: resolved.target.zoneLabel ?? null,
        targetZoneSystem: resolved.target.zoneSystem ?? null,
        targetZoneSource: resolved.target.zoneSource ?? null,
        targetZoneBasis: resolved.target.zoneBasis ?? null,
        targetZoneSystemKey: resolved.zoneSystemKey,
        targetZoneFingerprint: resolved.zoneFingerprint,
      } as T;
    } catch (error) {
      if (!(error instanceof WorkoutPrescriptionError)) {
        this.logger.warn(
          `Resolve current plan step target failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return this.unavailableProjection(step, children) as T;
    }
  }

  private unavailableProjection(
    step: DynamicPlanWorkoutStep,
    children: DynamicPlanWorkoutStep[] | undefined,
  ): DynamicPlanWorkoutStep {
    return {
      ...step,
      children,
      // 当前区间无法解析时必须显式不可用，不能悄悄回退到数据库里的旧阈值。
      targetValueLow: null,
      targetValueHigh: null,
      targetUnit: null,
      targetZoneLabel: `Z${step.targetZoneIndex}`,
      targetZoneSystem: null,
      targetZoneSource: null,
      targetZoneBasis: null,
      targetZoneSystemKey: null,
      targetZoneFingerprint: null,
    };
  }

  private intensityIntent(
    step: DynamicPlanWorkoutStep,
  ): WorkoutIntensityIntent {
    const stored = step.intensityIntent;
    if (
      stored &&
      typeof stored === 'object' &&
      typeof (stored as { family?: unknown }).family === 'string'
    ) {
      return stored as WorkoutIntensityIntent;
    }
    const intensity = String(step.intensity ?? '').toUpperCase();
    return {
      family:
        intensity === 'RECOVERY' ||
        intensity === 'REST' ||
        intensity === 'WARMUP' ||
        intensity === 'COOLDOWN'
          ? 'RECOVERY'
          : intensity === 'ACTIVE'
            ? 'ENDURANCE'
            : 'OTHER',
      purpose: step.name ?? step.notes ?? undefined,
    };
  }

  private dimensionForTarget(
    targetType: DynamicPlanWorkoutStep['targetType'],
  ): PrescriptionTargetDimension | null {
    if (targetType === WorkoutPlanStepTargetType.SPEED) return 'PACE';
    if (targetType === WorkoutPlanStepTargetType.HEART_RATE)
      return 'HEART_RATE';
    if (targetType === WorkoutPlanStepTargetType.POWER) return 'POWER';
    return null;
  }

  private targetUnit(unit: string | undefined): WorkoutPlanValueUnit | null {
    if (unit === 'seconds') return WorkoutPlanValueUnit.SECONDS;
    if (unit === 'bpm') return WorkoutPlanValueUnit.BPM;
    if (unit === 'W') return WorkoutPlanValueUnit.WATTS;
    if (unit === 'km/h') return WorkoutPlanValueUnit.KMH;
    return null;
  }

  private isTerminalPlan(plan: unknown): boolean {
    if (!plan || typeof plan !== 'object') return false;
    const status = (plan as { status?: unknown }).status;
    return ['COMPLETED', 'CANCELLED', 'SUPERSEDED'].includes(String(status));
  }

  private async readZoneSetting(
    userId: string,
    sportType: SportType,
    dimension: PrescriptionTargetDimension,
    tx?: PlanDb,
  ): Promise<PrescriptionZoneSetting> {
    const profile = await this.users.getComposedUserProfile(
      userId,
      sportType,
      undefined,
      tx,
    );
    if (dimension === 'PACE') {
      return this.users.getPaceZoneSettingResolved(
        userId,
        sportType,
        {
          vo2max: profile?.vo2max,
          tp: profile?.tp,
          cs: profile?.cs,
          paceZoneModel: profile?.paceZoneModel,
        },
        tx,
      );
    }
    if (dimension === 'POWER') {
      return this.users.getPowerZoneSettingResolved(
        userId,
        sportType,
        {
          FTP: profile?.ftp,
          CP: profile?.cp,
          powerZoneModel: profile?.powerZoneModel,
        },
        tx,
      );
    }
    return this.users.getHeartRateZoneSetting(
      userId,
      sportType,
      {
        maxHeartRate: profile?.maxHeartRate,
        restingHeartRate: profile?.restingHeartRate,
        lthr: profile?.lthr,
        heartRateZoneModel: profile?.heartRateZoneModel,
      },
      tx,
    );
  }
}
