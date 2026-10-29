import { Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import {
  computeSRISwim,
  computeSTPSwim,
  computeSwimScore,
  computeXPowerSwim,
} from '@/algorithm/SwimScore';
import { AnalyzePersistenceService } from '@/analyze/analyze-persistence.service';

export const SWIM_SCORE_ALGORITHM_VERSION = 2;
export const SWIM_SCORE_MIN_SPEED_COVERAGE_RATIO = 0.8;

@Injectable()
export class SwimScoreTask implements MetricsTask {
  key = 'swimScore' as const;

  constructor(private readonly persistence: AnalyzePersistenceService) {}

  async pre(ctx: MetricsContext) {
    return ctx;
  }

  async exec(ctx: MetricsContext) {
    const { activity } = ctx.inputs;
    if (activity.sportType !== $Enums.SportType.SWIM) return ctx;

    const weight = ctx.cache.profile?.weight;
    const thresholdSpeedMps =
      ctx.cache.fitnessMetrics?.[$Enums.UserFitnessMetricType.CS]?.value ??
      ctx.cache.profile?.cs;
    const rows = ctx.inputs.canonicalRecords ?? [];
    const sampleSec = ctx.cache.sampleSec ?? 1;
    if (
      !weight ||
      weight <= 0 ||
      !thresholdSpeedMps ||
      thresholdSpeedMps <= 0 ||
      !rows.length ||
      !Number.isFinite(sampleSec) ||
      sampleSec <= 0
    ) {
      return ctx;
    }

    const validRows = rows.filter((row) => {
      const speed = row.enhancedSpeed ?? row.speed;
      return speed != null && Number.isFinite(speed) && speed >= 0;
    });
    const activitySeconds =
      activity.timerTime && activity.timerTime > 0
        ? activity.timerTime
        : rows.length * sampleSec;
    const coveredSeconds = Math.min(
      activitySeconds,
      validRows.length * sampleSec,
    );
    const coverageRatio =
      activitySeconds > 0 ? coveredSeconds / activitySeconds : 0;
    if (coverageRatio < SWIM_SCORE_MIN_SPEED_COVERAGE_RATIO) return ctx;

    const swimRecords = validRows.map((row, index) => ({
      activityId: activity.id,
      index,
      lapIndex: 0,
      timestamp: new Date(row.time),
      distance: row.distance ?? 0,
      speed: row.speed,
      enhancedSpeed: row.enhancedSpeed,
    }));
    const normalized = computeXPowerSwim(swimRecords, { weight, sampleSec });
    const stp = computeSTPSwim(weight, 1 / thresholdSpeedMps, 1);
    if (!normalized || !stp || stp <= 0) return ctx;
    const sri = computeSRISwim(normalized.xPower, stp);
    if (!sri) return ctx;

    const swimScore = computeSwimScore({
      xPower: normalized.xPower,
      durationSec: normalized.durationSec,
      sri,
      stp,
    });
    if (!Number.isFinite(swimScore) || swimScore < 0) return ctx;

    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        swimScore: {
          algorithmVersion: SWIM_SCORE_ALGORITHM_VERSION,
          swimScore,
          thresholdSpeedMps,
          xPower: normalized.xPower,
          durationSec: normalized.durationSec,
          coveredSeconds,
          coverageRatio,
          parameters: {
            thresholdMetric: 'CS',
            speedSource: 'record',
            sampleSec,
            weightKg: weight,
            stp,
            sri,
            minimumCoverageRatio: SWIM_SCORE_MIN_SPEED_COVERAGE_RATIO,
          },
        },
      },
    };
  }

  async post(ctx: MetricsContext) {
    const result = ctx.outputs.swimScore;
    if (!result) return ctx;
    await this.persistence.saveActivitySwimScore(
      ctx.inputs.activity.id,
      ctx.inputs.activity.sportType,
      result,
    );
    return ctx;
  }
}
