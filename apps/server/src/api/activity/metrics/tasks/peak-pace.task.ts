import { Injectable, Logger } from '@nestjs/common';
import { PeakType, ScaleType } from '@prisma/client';
import type { Activity } from '@prisma/client';
import { SportType } from '@prisma/client';
import type { MetricsContext } from '../context';
import type { MetricsTask } from '../task';
import { SensorDataService } from '@/sensor/sensor-data.service';
import {
  findBestDistanceWindowForTime,
  findBestTimeWindowForDistance,
} from '@/algorithm/window-analysis.util';
import { ActivityPeakMetricWriterService } from '../shared/peak-metric-writer.service';
import { ActivityPerformanceTTWriterService } from '../shared/performance-tt-writer.service';
import type { PeakIntervalObservation } from '../context';
import { PEAK_WINDOW_ALGORITHM_VERSION } from '../shared/peak-window.util';

export type PeakPaceSeriesPoint = { tMs: number; dM: number };

/**
 * 峰值窗口只接受按时间正序的累计距离流。
 * 第一次时间倒退意味着上游把回填/汇总记录附加到了 record 尾部；继续计算会把
 * 活动早期时间戳与活动末尾累计距离拼成虚假的一秒窗口。
 */
export function normalizePeakPaceSeries(
  raw: Array<{ time: string; distance: string | number }>,
): PeakPaceSeriesPoint[] {
  const series: PeakPaceSeriesPoint[] = [];
  let previousTimestampMs = Number.NEGATIVE_INFINITY;
  let previousDistanceM = Number.NEGATIVE_INFINITY;

  for (const record of raw) {
    const point = {
      tMs: new Date(record.time).getTime(),
      dM: Number(record.distance),
    };
    if (!Number.isFinite(point.tMs) || !Number.isFinite(point.dM)) continue;
    if (point.tMs < previousTimestampMs) break;
    if (point.tMs === previousTimestampMs) continue;
    if (point.dM < previousDistanceM) break;
    previousTimestampMs = point.tMs;
    previousDistanceM = point.dM;
    series.push(point);
  }
  return series;
}

/**
 * 计算并存储活动的配速表现（Peak Pace）。这个任务会根据活动的运动类型，计算在不同距离和时间尺度上的最佳配速表现。计算完成后，会使用 ActivityPeakMetricWriterService 将配速指标写入数据库，并更新缓存；同时也会将最佳距离和时间表现写入性能 TT 表。
 */
@Injectable()
export class PeakPaceTask implements MetricsTask {
  key = 'peakPace' as const;
  private readonly logger = new Logger(PeakPaceTask.name);
  constructor(
    private readonly sensorDataService: SensorDataService,
    private readonly peakWriter: ActivityPeakMetricWriterService,
    private readonly ttWriter: ActivityPerformanceTTWriterService,
  ) {}

  // 根据运动类型返回对应的标准距离列表和时间列表，这些是计算配速表现的目标尺度
  private getStandardDistancesBySport(sport: SportType): number[] {
    if (sport === SportType.RUN) {
      return [400, 800, 1000, 1500, 1609, 3000, 5000, 10000, 21097, 42195];
    }
    if (sport === SportType.SWIM) {
      return [50, 100, 200, 400, 800, 1500];
    }
    if (sport === SportType.CYCLING) {
      return [1000, 2000, 3000, 5000, 10000, 20000, 40000, 100000];
    }
    return [];
  }
  // 根据运动类型返回对应的标准时间列表，这些是计算配速表现的目标尺度
  private getStandardTimesBySport(sport: SportType): number[] {
    const common = [
      1, 5, 10, 30, 60, 300, 600, 1200, 1800, 3600, 7200, 10800, 18000, 28800,
    ];
    if (sport === SportType.RUN) {
      return [...common, 720].sort((a, b) => a - b);
    }
    return common;
  }

  private async computeActivityPace(
    activity: Activity,
    canonicalRecords?: Array<{ time: string; distance?: number }>,
  ): Promise<{
    [ScaleType.DISTANCE]: Record<string, number>;
    [ScaleType.TIME]: Record<string, number>;
    bestDistances: Record<string, number>;
    bestTimes: Record<string, number>;
    distanceWindows: Record<string, PeakIntervalObservation | undefined>;
    timeWindows: Record<string, PeakIntervalObservation | undefined>;
  }> {
    if (!activity) {
      return {
        [ScaleType.DISTANCE]: {},
        [ScaleType.TIME]: {},
        bestDistances: {},
        bestTimes: {},
        distanceWindows: {},
        timeWindows: {},
      };
    }

    const sport = activity.sportType;
    const activityId = activity.id;
    this.logger.log(
      `[配速] 开始计算活动 ${activityId} 的配速表现，运动类型：${sport}`,
    );

    // 尽量复用 recordsBootstrap 的 canonicalRecords；游泳仍走 length 序列
    let raw: Array<{ time: string; distance: string | number }>;
    if (sport === SportType.SWIM) {
      raw = await this.sensorDataService.getLengthSeriesAsDistance(activityId);
    } else if (canonicalRecords?.length) {
      raw = canonicalRecords.map((r) => ({
        time: r.time,
        distance: r.distance ?? '',
      }));
    } else {
      raw = await this.sensorDataService.getRecordSeriesMulti(activityId, [
        'speed',
      ]);
    }

    const series = normalizePeakPaceSeries(raw ?? []);

    if (series.length < 2) {
      this.logger.warn(
        `[配速] 活动 ${activityId} 的序列点不足 2 个，跳过距离/时间表现计算`,
      );
      return {
        [ScaleType.DISTANCE]: {},
        [ScaleType.TIME]: {},
        bestDistances: {},
        bestTimes: {},
        distanceWindows: {},
        timeWindows: {},
      };
    }

    const distResults: Record<string, number> = {};
    const timeResults: Record<string, number> = {};
    const bestDistResults: Record<string, number> = {};
    const bestTimeResults: Record<string, number> = {};
    const distanceWindows: Record<string, PeakIntervalObservation | undefined> =
      {};
    const timeWindows: Record<string, PeakIntervalObservation | undefined> = {};
    const timelineStartMs = series[0].tMs;

    const distTargets = this.getStandardDistancesBySport(sport);
    if (distTargets.length > 0) {
      for (const target of distTargets) {
        const window = findBestTimeWindowForDistance(series, target);
        if (window && Number.isFinite(window.value) && window.value > 0) {
          const bestTimeS = window.value;
          const speedMps = target / window.value;
          distResults[target.toString()] = speedMps;
          bestTimeResults[target.toString()] = bestTimeS;
          distanceWindows[target.toString()] = {
            value: speedMps,
            startElapsedSec: (window.startMs - timelineStartMs) / 1000,
            endElapsedSec: (window.endMs - timelineStartMs) / 1000,
            startDistanceM: window.startDistanceM,
            endDistanceM: window.endDistanceM,
            coveredSeconds: window.durationSec,
            coverageRatio: 1,
            algorithmVersion: PEAK_WINDOW_ALGORITHM_VERSION,
            parameters: {
              targetDistanceM: target,
              boundaryInterpolation: 'LINEAR',
              maxGapSeconds: 10,
            },
          };
        }
      }
    }

    const timeTargets = this.getStandardTimesBySport(sport);
    if (timeTargets.length > 0) {
      for (const targetSec of timeTargets) {
        const window = findBestDistanceWindowForTime(series, targetSec);
        if (window && Number.isFinite(window.value) && window.value > 0) {
          const bestDistM = window.value;
          const speedMps = bestDistM / targetSec;
          const key = targetSec.toString() + 's';
          timeResults[key] = speedMps;
          bestDistResults[key] = bestDistM;
          timeWindows[key] = {
            value: speedMps,
            startElapsedSec: (window.startMs - timelineStartMs) / 1000,
            endElapsedSec: (window.endMs - timelineStartMs) / 1000,
            startDistanceM: window.startDistanceM,
            endDistanceM: window.endDistanceM,
            coveredSeconds: targetSec,
            coverageRatio: 1,
            algorithmVersion: PEAK_WINDOW_ALGORITHM_VERSION,
            parameters: {
              targetDurationSec: targetSec,
              boundaryInterpolation: 'LINEAR',
              maxGapSeconds: 10,
            },
          };
        }
      }
    }

    this.logger.log(
      `[配速] 活动 ${activityId} 的距离/时间表现计算完成：` +
        `距离项 ${Object.keys(distResults).length} 个 ${JSON.stringify(distResults)}；` +
        `时间项 ${Object.keys(timeResults).length} 个 ${JSON.stringify(timeResults)}；` +
        `最佳用时(s) ${JSON.stringify(bestTimeResults)}；` +
        `最佳距离(m) ${JSON.stringify(bestDistResults)}`,
    );
    return {
      [ScaleType.DISTANCE]: distResults,
      [ScaleType.TIME]: timeResults,
      bestDistances: bestDistResults,
      bestTimes: bestTimeResults,
      distanceWindows,
      timeWindows,
    };
  }
  async pre(ctx: MetricsContext) {
    return ctx;
  }
  async exec(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const paceIntervals = await this.computeActivityPace(
      activity,
      ctx.inputs.canonicalRecords ?? [],
    );

    const byDistance = paceIntervals?.[ScaleType.DISTANCE];
    const byTime = paceIntervals?.[ScaleType.TIME];
    const bestDistances = paceIntervals?.bestDistances || undefined;
    const bestTimes = paceIntervals?.bestTimes as
      | Record<string, number | undefined>
      | undefined;
    const distanceWindows = paceIntervals?.distanceWindows;
    const timeWindows = paceIntervals?.timeWindows;

    const cachePatchByDistance =
      byDistance && Object.keys(byDistance).length > 0
        ? this.peakWriter.buildPeakMetricsCachePatch(
            byDistance,
            PeakType.pace,
            ScaleType.DISTANCE,
          )
        : {};
    const cachePatchByTime =
      byTime && Object.keys(byTime).length > 0
        ? this.peakWriter.buildPeakMetricsCachePatch(
            byTime,
            PeakType.pace,
            ScaleType.TIME,
          )
        : {};

    return {
      ...ctx,
      outputs: {
        ...ctx.outputs,
        peakPace: {
          DISTANCE: byDistance,
          TIME: byTime,
          bestDistances,
          bestTimes,
          distanceWindows,
          timeWindows,
        },
      },
      cache: {
        ...ctx.cache,
        peakMetrics: {
          ...(ctx.cache.peakMetrics ?? {}),
          ...cachePatchByDistance,
          ...cachePatchByTime,
        },
      },
    };
  }
  async post(ctx: MetricsContext) {
    const activity = ctx.inputs.activity;
    const out = ctx.outputs.peakPace;
    if (!out) return ctx;

    const byDistance = out.DISTANCE;
    if (byDistance && Object.keys(byDistance).length > 0) {
      await this.peakWriter.replacePeakMetrics({
        activity,
        intervals: byDistance,
        type: PeakType.pace,
        scaleType: ScaleType.DISTANCE,
        windows: out.distanceWindows,
      });
    }

    const byTime = out.TIME;
    if (byTime && Object.keys(byTime).length > 0) {
      await this.peakWriter.replacePeakMetrics({
        activity,
        intervals: byTime,
        type: PeakType.pace,
        scaleType: ScaleType.TIME,
        windows: out.timeWindows,
      });
    }

    const bestDistances = out.bestDistances;
    if (bestDistances && Object.keys(bestDistances).length > 0) {
      await this.ttWriter.replaceTT({
        activity,
        entries: bestDistances,
        targetScaleType: ScaleType.TIME,
        windows: out.timeWindows,
      });
    }

    const bestTimes = out.bestTimes;
    if (bestTimes && Object.keys(bestTimes).length > 0) {
      await this.ttWriter.replaceTT({
        activity,
        entries: bestTimes,
        targetScaleType: ScaleType.DISTANCE,
        windows: out.distanceWindows,
      });
    }

    this.logger.log(`[峰值配速任务] 活动 ${activity.id} 保存完成`);
    return ctx;
  }
}
