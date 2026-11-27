import { treadmillPaceTimeline } from '../treadmill-pace-timeline';
import { Injectable, Logger } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import {
  calculateObservedGradeCoverageRatio,
  computeGOVSS,
  computeRunningPaceLoadEstimate,
  RUNNING_PACE_MIN_GRADE_COVERAGE_RATIO,
  type RunningPaceLoadResult,
} from '@/algorithm/GOVSS';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';

const MIN_RUNNING_THRESHOLD_SPEED_METERS_PER_SECOND = 1.8;

@Injectable()
export class PaceGovssTask implements MetricsTask {
  key = 'paceGovss' as const;

  private readonly logger = new Logger(PaceGovssTask.name);

  constructor(private readonly persistence: AnalyzePersistenceService) {}

  async pre(ctx: MetricsContext) {
    return ctx;
  }

  async exec(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    let canonical = ctx.inputs.canonicalRecords;
    const context = ctx.cache.pacePreload?.context;
    let sampleSec = ctx.cache.sampleSec;

    if (
      !activity?.id ||
      activity.sportType !== $Enums.SportType.RUN ||
      activity.sportDefinitionCode === 'WALKING' ||
      activity.sportDefinitionCode === 'HIKING'
    ) {
      return ctx;
    }
    if (!canonical?.length || !context) return ctx;

    // Leave regularly sampled treadmill/watch records unchanged. Cumulative
    // screen-off updates need elapsed coverage rather than callback-count weighting.
    if (
      (activity.sportDefinitionCode === 'TREADMILL_RUNNING' ||
        activity.subSport === 1) &&
      sampleSec > 0 &&
      activity.timerTime > 0 &&
      canonical.length * sampleSec < activity.timerTime * 0.8
    ) {
      const timeline = treadmillPaceTimeline(canonical, activity);
      if (!timeline) {
        this.logger.debug(
          `[paceGovss] 跳过，活动ID=${activity.id}，稀疏累计距离不足以覆盖训练`,
        );
        return ctx;
      }
      canonical = timeline.records;
      sampleSec = timeline.sampleSec;
    }

    const weight = firstPositiveNumber(context.userWeight);
    const threshold = weight
      ? firstRunningThresholdSpeed(context.CS, context.TP)
      : firstRunningThresholdSpeed(context.TP, context.CS);
    if (!threshold) return ctx;

    const samples = canonical.map((row) => ({
      timestamp: new Date(row.time),
      distance: toFiniteNumber(row.distance),
      speed: toFiniteNumber(row.enhancedSpeed ?? row.speed),
      grade: toFiniteNumber(row.grade),
    }));

    let load: RunningPaceLoadResult | undefined;
    if (weight) {
      const records = samples.filter(
        ({ speed, distance }) =>
          speed != null && speed >= 0 && distance != null,
      );
      if (records.length === 0) return ctx;

      const gradeCoverageRatio = calculateObservedGradeCoverageRatio(records);
      const gradeMode =
        gradeCoverageRatio >= RUNNING_PACE_MIN_GRADE_COVERAGE_RATIO
          ? 'record'
          : 'flat';
      const height = normalizeHeightMeters(context.userHeight);
      const result = computeGOVSS(
        records,
        weight,
        height,
        threshold,
        sampleSec,
        {
          gradeMode,
        },
      );
      load = {
        method: 'GOVSS',
        score: result.govss,
        algorithmVersion: result.algorithmVersion,
        gradeMode: result.gradeMode,
        coveredSeconds: result.coveredSeconds,
        gradeCoverageRatio: result.gradeCoverageRatio,
      };
    } else {
      load = computeRunningPaceLoadEstimate(samples, threshold);
    }
    if (!load || !Number.isFinite(load.score) || load.score <= 0) return ctx;

    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        paceGovss: load,
      },
    };
  }

  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const load = ctx.outputs.paceGovss;
    if (
      !activity?.id ||
      activity.sportType !== $Enums.SportType.RUN ||
      activity.sportDefinitionCode === 'WALKING' ||
      activity.sportDefinitionCode === 'HIKING' ||
      !load
    ) {
      return ctx;
    }

    await this.persistence.saveActivityRunningPaceLoad(
      activity.id,
      activity.sportType,
      load,
      ctx.persistenceTx,
    );
    return ctx;
  }
}

function firstPositiveNumber(
  ...values: Array<number | null | undefined>
): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

export function firstRunningThresholdSpeed(
  ...values: Array<number | null | undefined>
): number | undefined {
  return values.find(
    (value): value is number =>
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= MIN_RUNNING_THRESHOLD_SPEED_METERS_PER_SECOND,
  );
}

function toFiniteNumber(value: unknown): number | undefined {
  const numberValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeHeightMeters(value: unknown): number {
  const height = toFiniteNumber(value);
  if (!height || height <= 0) return 1.75;
  return height > 3 ? height / 100 : height;
}
