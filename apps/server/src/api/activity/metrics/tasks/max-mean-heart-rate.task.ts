import { Injectable } from '@nestjs/common';
import { PeakType, ScaleType } from '@prisma/client';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { ActivityPeakMetricWriterService } from '../shared/peak-metric-writer.service';
import {
  computeMaxMeanObservedWindows,
  STANDARD_PEAK_DURATIONS,
} from '@/algorithm/time-series-metrics';
import { toPeakIntervalObservation } from '../shared/peak-window.util';

/**
 * 计算并存储活动的最大平均心率（Max Mean Heart Rate, MMHR）。这个任务会调用 HeartRateService 来计算 MMHR，然后使用 ActivityPeakMetricWriterService 将结果写入数据库，并更新缓存。
 */
@Injectable()
export class MaxMeanHeartRateTask implements MetricsTask {
  key = 'maxMeanHeartRate' as const;
  constructor(private readonly peakWriter: ActivityPeakMetricWriterService) {}
  async pre(ctx: MetricsContext) {
    return ctx;
  }
  async exec(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const records = ctx.inputs.canonicalRecords;
    if (!activity || !records || records.length < 2) return ctx;
    const rawWindows = computeMaxMeanObservedWindows(
      records.map((record) => ({
        tMs: record.tMs,
        value:
          typeof record.heartRate === 'number' &&
          Number.isFinite(record.heartRate) &&
          record.heartRate > 0
            ? record.heartRate
            : null,
      })),
      STANDARD_PEAK_DURATIONS,
    );
    const timelineStartMs = Math.min(...records.map((record) => record.tMs));
    const windows = Object.fromEntries(
      Object.entries(rawWindows).map(([key, window]) => [
        key,
        window
          ? toPeakIntervalObservation(
              window,
              timelineStartMs,
              records,
              'HEART_RATE',
            )
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
      PeakType.hr,
      ScaleType.TIME,
    );

    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        maxMeanHeartRate: intervals,
        maxMeanHeartRateWindows: windows,
      },
      cache: {
        ...ctx.cache,
        peakMetrics: { ...(ctx.cache.peakMetrics ?? {}), ...peakPatch },
      },
    };
  }
  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const intervals = ctx.outputs.maxMeanHeartRate;
    if (!intervals) return ctx;

    await this.peakWriter.replacePeakMetrics({
      activity,
      intervals,
      windows: ctx.outputs.maxMeanHeartRateWindows,
      type: PeakType.hr,
      scaleType: ScaleType.TIME,
    });
    return ctx;
  }
}
