import { isPrismaSerializableConflict } from '@/prisma/prisma-transaction-errors';
import {
  permitsMeasuredPowerFitness,
  permitsPowerDerivedMetrics,
} from '@/training-load/measured-power-evidence';
import { Injectable, Logger } from '@nestjs/common';
import type {
  MetricsContext,
  MetricsTaskKey,
  MetricsTaskOutcome,
} from './context';
import type { MetricsTask } from './task';
import type { Prisma } from '@prisma/client';

const TASK_OUTPUT_KEYS: Partial<
  Record<MetricsTaskKey, Array<keyof MetricsContext['outputs']>>
> = {
  heartRateBase: ['heartRateBase'],
  heartRateZones: ['heartRateZones'],
  heartRateTrimp: ['heartRateTrimp'],
  paceBase: ['paceBase'],
  paceZones: ['paceZoneDistribution'],
  paceGovss: ['paceGovss'],
  swimScore: ['swimScore'],
  calculatedPowerSummary: ['calculatedPowerSummary'],
  activityStatistics: ['activityStatistics'],
  powerBase: ['powerBase'],
  powerZones: ['powerZoneDistribution'],
  powerCogganBike: ['powerCoggan', 'powerBikeScore'],
  trainingEffect: ['trainingEffect'],
  calories: ['calories'],
  maxMeanPower: ['maxMeanPower'],
  maxMeanHeartRate: ['maxMeanHeartRate'],
  lthrObservation: ['lthrObservation'],
  peakPace: ['peakPace'],
  estimatedPowerMetrics: ['estimatedPowerMetrics'],
  vo2Max: ['vo2max'],
};

/** 负荷任务：明确覆盖不足才跳过，历史未知来源仍可使用已有实测功率。 */
const POWER_LOAD_TASKS = new Set<MetricsTaskKey>([
  'powerBase',
  'powerZones',
  'powerCogganBike',
]);

/** 体能任务：只有可靠实测功率可以写入峰值或 CP/FTP/W′/Pmax。 */
const POWER_FITNESS_TASKS = new Set<MetricsTaskKey>([
  'maxMeanPower',
  'estimatedPowerMetrics',
]);

const NO_RELIABLE_MEASURED_POWER = 'no_reliable_measured_power';

function powerDerivedSkipReason(
  ctx: MetricsContext,
  key: MetricsTaskKey,
): string | null {
  const evidence = ctx.inputs.measuredPowerEvidence;
  if (POWER_FITNESS_TASKS.has(key) && !permitsMeasuredPowerFitness(evidence)) {
    return NO_RELIABLE_MEASURED_POWER;
  }
  if (POWER_LOAD_TASKS.has(key) && !permitsPowerDerivedMetrics(evidence)) {
    return NO_RELIABLE_MEASURED_POWER;
  }
  return null;
}

function positiveSampleCount(
  ctx: MetricsContext,
  field: 'heartRate' | 'power' | 'speed',
): number {
  const rows = ctx.inputs.canonicalRecords ?? [];
  return rows.filter((row) => {
    const raw =
      field === 'speed' ? (row.enhancedSpeed ?? row.speed) : row[field];
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0;
  }).length;
}

function inferSkippedReason(key: MetricsTaskKey, ctx: MetricsContext): string {
  const activity = ctx.inputs.activity;
  if (!activity?.id) return 'missing_activity';
  if (!ctx.inputs.userId && key !== 'recordsBootstrap') return 'missing_user';
  const sportType = activity.sportType ?? ctx.inputs.sportType;

  const records = ctx.inputs.canonicalRecords ?? [];
  if (key === 'recordsBootstrap') {
    return records.length > 0 ? 'not_persisted' : 'no_sensor_records';
  }
  if (key === 'calculatedPowerSummary') {
    return 'calculated_power_unavailable';
  }
  if (key === 'activityStatistics') {
    return records.length > 0
      ? 'insufficient_timeline_coverage'
      : 'no_sensor_records';
  }
  if (key === 'bindFitnessMetrics') {
    if (!activity.startTime) return 'missing_activity_start_time';
    return 'fitness_snapshot_not_persisted';
  }

  if (
    (key === 'paceGovss' && sportType !== 'RUN') ||
    (key === 'swimScore' && sportType !== 'SWIM') ||
    (key === 'lthrObservation' &&
      sportType !== 'RUN' &&
      sportType !== 'CYCLING') ||
    (key.startsWith('power') && sportType !== 'RUN' && sportType !== 'CYCLING')
  ) {
    return 'not_applicable_for_sport';
  }
  if (records.length === 0) return 'no_sensor_records';

  if (key === 'lthrObservation') {
    if (positiveSampleCount(ctx, 'heartRate') === 0) {
      return 'no_heart_rate_samples';
    }
    return 'no_quality_qualified_30_minute_window';
  }

  if (key.startsWith('heartRate')) {
    if (positiveSampleCount(ctx, 'heartRate') === 0) {
      return 'no_heart_rate_samples';
    }
    if (key === 'heartRateZones' && !ctx.cache.heartRateZoneSetting?.zones) {
      return 'heart_rate_zones_unavailable';
    }
    return 'insufficient_heart_rate_inputs';
  }

  if (key.startsWith('pace')) {
    if (positiveSampleCount(ctx, 'speed') === 0) {
      return 'no_speed_samples';
    }
    if (!ctx.cache.pacePreload) return 'pace_profile_unavailable';
    if (key === 'paceGovss') {
      const paceContext = ctx.cache.pacePreload.context;
      if (!(paceContext?.CS > 0 || paceContext?.TP > 0)) {
        return 'pace_threshold_unavailable';
      }
      if (!(paceContext?.userWeight > 0)) return 'user_weight_unavailable';
      if (!(ctx.cache.sampleSec && ctx.cache.sampleSec > 0)) {
        return 'sample_interval_unavailable';
      }
    }
    return 'insufficient_pace_inputs';
  }

  if (key === 'swimScore') {
    if (positiveSampleCount(ctx, 'speed') === 0) return 'no_speed_samples';
    if (!ctx.cache.profile?.weight) return 'user_weight_unavailable';
    if (!ctx.cache.fitnessMetrics?.CS?.value && !ctx.cache.profile?.cs) {
      return 'swim_threshold_unavailable';
    }
    return 'insufficient_swim_speed_coverage';
  }

  if (key.startsWith('power')) {
    if (positiveSampleCount(ctx, 'power') === 0) {
      return 'no_power_samples';
    }
    if (!ctx.cache.powerPreload) return 'power_profile_unavailable';
    return 'insufficient_power_inputs';
  }

  if (key === 'trainingEffect') {
    const threshold = ctx.cache.hrThreshold as
      | { maxHeartRate?: number; restingHeartRate?: number }
      | undefined;
    if (
      !threshold?.maxHeartRate ||
      (!threshold?.restingHeartRate && !ctx.cache.loadRestingHeartRateDefault)
    ) {
      return 'heart_rate_threshold_unavailable';
    }
    return 'insufficient_training_effect_inputs';
  }

  if (key === 'calories') {
    if (!(activity.timerTime && activity.timerTime > 0)) {
      return 'duration_unavailable';
    }
    return 'power_or_user_profile_unavailable';
  }

  return 'no_metric_output';
}

function resolveTaskOutcome(
  key: MetricsTaskKey,
  ctx: MetricsContext,
): MetricsTaskOutcome {
  if (key === 'recordsBootstrap') {
    return (ctx.inputs.canonicalRecords?.length ?? 0) > 0
      ? { key, status: 'APPLIED' }
      : { key, status: 'SKIPPED', reason: inferSkippedReason(key, ctx) };
  }
  if (key === 'bindFitnessMetrics') {
    return ctx.inputs.userId && ctx.inputs.activity.startTime
      ? { key, status: 'APPLIED' }
      : { key, status: 'SKIPPED', reason: inferSkippedReason(key, ctx) };
  }

  const outputKeys = TASK_OUTPUT_KEYS[key] ?? [];
  const produced = outputKeys.some(
    (outputKey) => ctx.outputs[outputKey] != null,
  );
  if (produced) return { key, status: 'APPLIED' };
  const reason = inferSkippedReason(key, ctx);
  return reason === 'not_applicable_for_sport'
    ? { key, status: 'IGNORED', reason }
    : { key, status: 'SKIPPED', reason };
}

function withTaskOutcome(
  ctx: MetricsContext,
  outcome: MetricsTaskOutcome,
): MetricsContext {
  return {
    ...ctx,
    taskOutcomes: {
      ...ctx.taskOutcomes,
      [outcome.key]: outcome,
    },
  };
}

export type MetricsRunOptions = {
  /**
   * 指标不适用或输入不足应由 task 正常返回；这里记录的 error 代表真实执行失败。
   * 严格模式仍会执行完后续 task，最后统一抛错，避免单点失败掩盖更多问题。
   */
  failOnTaskError?: boolean;
};

export type ComputedMetricsRun = {
  context: MetricsContext;
  tasks: readonly MetricsTask[];
};

export class ActivityMetricsPipelineError extends Error {
  constructor(
    readonly taskErrors: MetricsContext['errors'],
    message = ActivityMetricsPipelineError.buildMessage(taskErrors),
  ) {
    super(message);
    this.name = 'ActivityMetricsPipelineError';
  }

  private static buildMessage(errors: MetricsContext['errors']): string {
    const failures = Object.entries(errors);
    const summary = failures
      .map(([key, error]) => `${key}: ${error?.message ?? 'unknown error'}`)
      .join('; ');
    return `Activity metrics pipeline failed in ${failures.length} task(s): ${summary}`;
  }
}

@Injectable()
export class ActivityMetricsOrchestratorService {
  private readonly logger = new Logger(ActivityMetricsOrchestratorService.name);

  async runStrict(
    ctx: MetricsContext,
    tasks: MetricsTask[],
  ): Promise<MetricsContext> {
    return this.run(ctx, tasks, { failOnTaskError: true });
  }

  async run(
    ctx: MetricsContext,
    tasks: MetricsTask[],
    options: MetricsRunOptions = {},
  ): Promise<MetricsContext> {
    // 任务按调用方给出的顺序执行；任务之间通过 MetricsContext 传递已预加载数据和中间结果。
    let current = ctx;

    for (const task of tasks) {
      current = await this.runOne(current, task);
    }

    if (options.failOnTaskError && Object.keys(current.errors).length > 0) {
      throw new ActivityMetricsPipelineError(current.errors);
    }

    return current;
  }

  /** 只读取事实并计算内存结果；不会调用任何 task.post 持久化。 */
  async computeStrict(
    ctx: MetricsContext,
    tasks: readonly MetricsTask[],
  ): Promise<ComputedMetricsRun> {
    let current = ctx;
    for (const task of tasks) {
      current = await this.computeOne(current, task);
    }
    if (Object.keys(current.errors).length > 0) {
      throw new ActivityMetricsPipelineError(current.errors);
    }
    return { context: current, tasks };
  }

  /** 提交 computeStrict 产生的 mutation plan；调用方负责 revision fencing。 */
  async commitComputed(
    run: ComputedMetricsRun,
    tx: Prisma.TransactionClient,
  ): Promise<MetricsContext> {
    let current: MetricsContext = { ...run.context, persistenceTx: tx };
    for (const task of run.tasks) {
      try {
        current = await task.post(current);
      } catch (error) {
        if (isPrismaSerializableConflict(error)) throw error;
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        current = withTaskOutcome(
          {
            ...current,
            errors: {
              ...current.errors,
              [task.key]: { message, stack },
            },
          },
          { key: task.key, status: 'FAILED', reason: message },
        );
        break;
      }
    }
    if (Object.keys(current.errors).length > 0) {
      throw new ActivityMetricsPipelineError(current.errors);
    }
    const { persistenceTx: _transaction, ...committed } = current;
    return committed;
  }

  private skipPowerDerivedTask(
    ctx: MetricsContext,
    key: MetricsTaskKey,
  ): MetricsContext | null {
    const reason = powerDerivedSkipReason(ctx, key);
    if (!reason) return null;
    if (
      POWER_FITNESS_TASKS.has(key) &&
      ![...POWER_FITNESS_TASKS].some(
        (taskKey) => ctx.taskOutcomes?.[taskKey]?.reason === reason,
      )
    ) {
      const evidence = ctx.inputs.measuredPowerEvidence ?? 'UNKNOWN';
      this.logger.log(
        `[CP] 活动缺少可靠实测功率，跳过 MMP/CP：活动=${ctx.inputs.activity?.id ?? 'unknown'}，证据=${evidence}，原因=${reason}`,
      );
    }
    return withTaskOutcome(ctx, { key, status: 'SKIPPED', reason });
  }

  private async computeOne(
    ctx: MetricsContext,
    task: MetricsTask,
  ): Promise<MetricsContext> {
    const key = task.key;
    const skipped = this.skipPowerDerivedTask(ctx, key);
    if (skipped) return skipped;
    try {
      const prepared = await task.pre(ctx);
      const computed = await task.exec(prepared);
      return withTaskOutcome(computed, resolveTaskOutcome(key, computed));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      return withTaskOutcome(
        {
          ...ctx,
          errors: { ...ctx.errors, [key]: { message, stack } },
        },
        { key, status: 'FAILED', reason: message },
      );
    }
  }

  private async runOne(
    ctx: MetricsContext,
    task: MetricsTask,
  ): Promise<MetricsContext> {
    // 指标任务是尽力而为：单个指标失败会写入 ctx.errors，但不阻断后续指标计算。
    const key = task.key;
    const skipped = this.skipPowerDerivedTask(ctx, key);
    if (skipped && !POWER_FITNESS_TASKS.has(key)) return skipped;
    try {
      if (skipped) {
        // 重新分析时清掉以前写入的功率峰值和活动 eCP，避免未知来源继续进模型。
        const cleared = await task.post(skipped);
        return withTaskOutcome(cleared, {
          key,
          status: 'SKIPPED',
          reason: NO_RELIABLE_MEASURED_POWER,
        });
      }
      let next = ctx;
      next = await task.pre(next);
      next = await task.exec(next);
      next = await task.post(next);
      return withTaskOutcome(next, resolveTaskOutcome(key, next));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      this.logger.warn(`[${key}] 执行失败（尽力而为）：${message}`);
      const errors: MetricsContext['errors'] = { ...ctx.errors };
      errors[key] = { message, stack };
      return withTaskOutcome(
        {
          ...ctx,
          errors,
        },
        { key, status: 'FAILED', reason: message },
      );
    }
  }
}
