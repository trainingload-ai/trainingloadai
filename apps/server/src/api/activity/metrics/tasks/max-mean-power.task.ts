import { Injectable } from '@nestjs/common';
import { PeakType, ScaleType } from '@prisma/client';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { ActivityPeakMetricWriterService } from '../shared/peak-metric-writer.service';
import {
  computeMaxMeanObservedWindows,
  STANDARD_PEAK_DURATIONS,
} from '@/algorithm/time-series-metrics';
import { permitsMeasuredPowerFitness } from '@/training-load/measured-power-evidence';
import { toPeakIntervalObservation } from '../shared/peak-window.util';

@Injectable()
export class MaxMeanPowerTask implements MetricsTask {
  key = 'maxMeanPower' as const;
  constructor(private readonly peakWriter: ActivityPeakMetricWriterService) {}
  async pre(ctx: MetricsContext) {
    return ctx;
  }
  async exec(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const records = ctx.inputs.canonicalRecords;
    if (!permitsMeasuredPowerFitness(ctx.inputs.measuredPowerEvidence)) {
      return ctx;
    }
    if (!activity || !records || records.length < 2) return ctx;

    const rawWindows = computeMaxMeanObservedWindows(
      records.map((record) => ({
        tMs: record.tMs,
        // 峰值只读取功率计样本。calculatedPower 留在独立列，不能进入 PeakType.power。
        value:
          typeof record.power === 'number' &&
          Number.isFinite(record.power) &&
          record.power >= 0
            ? record.power
            : null,
      })),
      STANDARD_PEAK_DURATIONS,
    );
    const timelineStartMs = Math.min(...records.map((record) => record.tMs));
    const windows = Object.fromEntries(
      Object.entries(rawWindows).map(([key, window]) => [
        key,
        window
          ? toPeakIntervalObservation(window, timelineStartMs, records, 'POWER')
          : undefined,
      ]),
    );
    const intervals = Object.fromEntries(
      Object.entries(windows).map(([key, window]) => [
        key,
        window ? Math.round(window.value * 100) / 100 : undefined,
      ]),
    );
    const peakPatch = this.peakWriter.buildPeakMetricsCachePatch(
      intervals,
      PeakType.power,
      ScaleType.TIME,
    );
    const durationList = this.peakWriter.buildDurationValueListFromIntervals(
      intervals,
      ScaleType.TIME,
    );
    const listKey = `list:${PeakType.power}:${ScaleType.TIME}`;

    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        maxMeanPower: intervals,
        maxMeanPowerWindows: windows,
      },
      cache: {
        ...ctx.cache,
        peakMetrics: { ...(ctx.cache.peakMetrics ?? {}), ...peakPatch },
        ...({ [listKey]: durationList } as Record<string, unknown>),
      } as MetricsContext['cache'],
    };
  }
  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    if (!activity?.id) return ctx;
    if (!permitsMeasuredPowerFitness(ctx.inputs.measuredPowerEvidence)) {
      await this.peakWriter.replacePeakMetrics({
        activity,
        intervals: {},
        type: PeakType.power,
        scaleType: ScaleType.TIME,
        tx: ctx.persistenceTx,
      });
      return ctx;
    }
    const intervals = ctx.outputs.maxMeanPower;
    if (!intervals) return ctx;

    await this.peakWriter.replacePeakMetrics({
      activity,
      intervals,
      windows: ctx.outputs.maxMeanPowerWindows,
      type: PeakType.power,
      scaleType: ScaleType.TIME,
      tx: ctx.persistenceTx,
    });
    return ctx;
  }
}
