import { Injectable, Logger } from '@nestjs/common';
import { mean, round } from 'lodash';
import type {
  AnalyzePaceResult,
  SensorData,
} from '@/analyze/analyze.interface';
import type { UserZoneSetting, UserZoneValue } from '@/utils/zones';
import { fillValueToPaceZones } from '@/utils/zones';
import {
  averageKnownValues,
  computeNormalizedRollingValue,
  resampleObservedValues,
} from '@/algorithm/time-series-metrics';

/** 配速 scalar 指标（不含分区）；与 `AnalyzePaceResult` 对齐字段子集 */
export type PaceBaseMetrics = Omit<AnalyzePaceResult, 'zones'>;

/** PaceBaseTask / PaceZonesTask 之间复用 */
export type PaceComputationCache = {
  base: PaceBaseMetrics;
  speedRecords: { speed: number }[];
};

@Injectable()
export class PaceEngineService {
  private readonly logger = new Logger(PaceEngineService.name);

  private getEmptyPaceResult(): AnalyzePaceResult {
    return {
      avgSpeed: 0,
      avgGap: 0,
      xPace: 0,
      xGap: 0,
      viPace: 0,
      viGap: 0,
      avgAerobicEfficiency: 0,
    };
  }

  /**
   * 从 records 得到基础配速标量（不含分区）；无有效速度数据时返回 null。
   */
  computePaceInternals(records: SensorData[]): PaceComputationCache | null {
    if (!records || records.length === 0) {
      this.logger.debug('[分析 pace] 跳过，没有传感器数据');
      return null;
    }
    const validRecords = records
      .map((r) => {
        const primary = r.speed;
        const fallback = r.enhancedSpeed;
        const effectiveSpeed =
          typeof primary === 'number' && Number.isFinite(primary) && primary > 0
            ? primary
            : typeof fallback === 'number' &&
                Number.isFinite(fallback) &&
                fallback > 0
              ? fallback
              : undefined;
        return { ...r, speed: effectiveSpeed };
      })
      .filter(
        (r) =>
          typeof r.speed === 'number' &&
          Number.isFinite(r.speed) &&
          r.speed > 0,
      );
    if (validRecords.length === 0) {
      this.logger.debug('[分析 pace] 跳过，未发现有效速度数据');
      return null;
    }

    const speedRecords = validRecords.map((r) => ({ speed: r.speed! }));
    const speedTimeline = resampleObservedValues(
      records.map((record) => ({
        tMs: record.tMs,
        value:
          typeof record.speed === 'number' &&
          Number.isFinite(record.speed) &&
          record.speed > 0
            ? record.speed
            : typeof record.enhancedSpeed === 'number' &&
                Number.isFinite(record.enhancedSpeed) &&
                record.enhancedSpeed > 0
              ? record.enhancedSpeed
              : null,
      })),
    );
    const gapSpeedTimeline = resampleObservedValues(
      records.map((record) => ({
        tMs: record.tMs,
        value:
          typeof record.gap === 'number' &&
          Number.isFinite(record.gap) &&
          record.gap > 0
            ? 1 / record.gap
            : null,
      })),
    );
    const avgSpeedMs = averageKnownValues(speedTimeline.values);
    const avgGapSpeedMs = averageKnownValues(gapSpeedTimeline.values);
    const avgGapSecPerM = avgGapSpeedMs > 0 ? round(1 / avgGapSpeedMs, 6) : 0;

    const xSpeedMs = computeNormalizedRollingValue(speedTimeline.values).value;
    const xPaceSecPerM = xSpeedMs > 0 ? round(1 / xSpeedMs, 6) : 0;

    const xGapSpeedMs = computeNormalizedRollingValue(
      gapSpeedTimeline.values,
    ).value;
    const xGapSecPerM = xGapSpeedMs > 0 ? round(1 / xGapSpeedMs, 6) : 0;

    const viPace = avgSpeedMs > 0 ? round(xSpeedMs / avgSpeedMs, 2) : 0;
    const viGap = avgGapSpeedMs > 0 ? round(xGapSpeedMs / avgGapSpeedMs, 2) : 0;

    const aeValues = validRecords
      .map((r) => {
        const aePace = r.aePace;
        if (aePace != null && Number.isFinite(aePace) && aePace > 0) {
          return aePace;
        }
        const speed = r.speed ?? 0;
        const hr = r.heartRate ?? 0;
        return hr > 0 && speed > 0 ? (47 * speed) / hr : undefined;
      })
      .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
    const avgAerobicEfficiency =
      aeValues.length > 0 ? round(mean(aeValues), 4) : 0;

    const base: PaceBaseMetrics = {
      avgSpeed: avgSpeedMs,
      avgGap: avgGapSecPerM,
      xPace: xPaceSecPerM,
      xGap: xGapSecPerM,
      viPace,
      viGap,
      avgAerobicEfficiency,
    };
    this.logger.log(
      `[分析 pace] 完成 inputRecords=${records.length} validSpeed=${validRecords.length}` +
        `avgSpeed=${round(base.avgSpeed, 6)} avgGap=${round(base.avgGap, 6)} xPace=${base.xPace} xGap=${base.xGap} ` +
        `viPace=${base.viPace} viGap=${base.viGap} avgAe=${base.avgAerobicEfficiency}`,
    );

    return { base, speedRecords };
  }

  /**
   * 配速分区统计（落库 ActivityZone.PACE）。
   * canonical 为 m/s 等序列；`sampleSec` 与 recordsBootstrap 一致时由调用方传入。
   */
  computePaceZoneDistribution(
    records: {
      gap?: number;
      speed?: number;
      enhancedSpeed?: number;
    }[],
    zoneTemplate: UserZoneValue[] | undefined,
    sampleSec?: number,
    reusableSpeedRecords?: { speed: number }[],
  ): UserZoneValue[] {
    const speedRecords =
      reusableSpeedRecords && reusableSpeedRecords.length > 0
        ? reusableSpeedRecords
        : (() => {
            const values: { speed: number }[] = [];
            for (const r of records) {
              let speed: number | undefined;
              if (
                typeof r.speed === 'number' &&
                Number.isFinite(r.speed) &&
                r.speed > 0
              ) {
                speed = r.speed;
              } else if (
                typeof r.enhancedSpeed === 'number' &&
                Number.isFinite(r.enhancedSpeed) &&
                r.enhancedSpeed > 0
              ) {
                speed = r.enhancedSpeed;
              }
              if (speed != null) {
                values.push({ speed });
              }
            }
            return values;
          })();
    return fillValueToPaceZones(speedRecords, zoneTemplate, sampleSec);
  }
}
