import { Injectable } from '@nestjs/common';
import { round } from 'lodash';
import type {
  AnalyzePowerByRecordsResult,
  SensorData,
} from '@/analyze/analyze.interface';
import type { SensorRecord } from '@/sensor/sensor-data.service';
import { $Enums } from '@prisma/client';
import type { UserZoneValue } from '@/utils/zones';
import { fillValueToPowerZones } from '@/utils/zones';
import { detectSampleSec } from '@/algorithm/utils';
import { calculateBikeScoreMetrics } from '@/algorithm/BikeScore';
import { computeCogganFromTimeline } from '@/algorithm/coggan';
import { calculateEfficiencyIndexPower } from '@/algorithm/power';
import type { CogganResult } from '@/algorithm/coggan';
import type { BikeScoreResult } from '@/algorithm/BikeScore';
import {
  averageKnownValues,
  resampleObservedValues,
} from '@/algorithm/time-series-metrics';

type PowerContextInput = {
  FTP?: number;
  CP?: number;
  userWeight?: number;
  zones?: UserZoneValue[];
  sportType: $Enums.SportType;
};

/** 单次活动功率序列聚合（无分区、无模型指标）；供 metrics task 链复用。 */
export type PowerSeriesAggregates = {
  sampleSec: number;
  powerRecords: number[];
  avgPower: number;
  avgHeartRate: number;
  avgSpeedMps: number;
  powerTimeline: Array<{ tMs: number; power: number | null }>;
};

@Injectable()
export class PowerEngineService {
  /**
   * 从 records 抽出基础统计：采样间隔、时长、平均功率/心率/速度。
   * 无有效功率点时返回 undefined。
   */
  computePowerSeriesAggregates(
    records: SensorData[],
    sampleSecInput?: number,
    reuse?: {
      avgHeartRate?: number;
      avgSpeedMps?: number;
    },
  ): PowerSeriesAggregates | undefined {
    const sampleSec =
      sampleSecInput != null &&
      Number.isFinite(sampleSecInput) &&
      sampleSecInput > 0
        ? sampleSecInput
        : detectSampleSec(records);
    const powerRecords = records
      .map((r) => r.power)
      .filter((v): v is number => v !== undefined && v !== null);
    if (powerRecords.length === 0) return undefined;

    const timeWeightedAverage = (
      selector: (record: SensorData) => number | null | undefined,
    ) =>
      averageKnownValues(
        resampleObservedValues(
          records.map((record) => {
            const value = selector(record);
            return {
              tMs: record.tMs,
              value:
                typeof value === 'number' && Number.isFinite(value)
                  ? value
                  : null,
            };
          }),
        ).values,
      );
    const avgPower = timeWeightedAverage((record) => record.power);
    const avgHeartRate =
      reuse?.avgHeartRate != null && Number.isFinite(reuse.avgHeartRate)
        ? reuse.avgHeartRate
        : timeWeightedAverage((record) => record.heartRate);
    const avgSpeedMps =
      reuse?.avgSpeedMps != null && Number.isFinite(reuse.avgSpeedMps)
        ? reuse.avgSpeedMps
        : timeWeightedAverage((record) => record.speed);

    return {
      sampleSec,
      powerRecords,
      avgPower,
      avgHeartRate,
      avgSpeedMps,
      powerTimeline: records.map((record) => ({
        tMs: record.tMs,
        power:
          typeof record.power === 'number' &&
          Number.isFinite(record.power) &&
          record.power >= 0
            ? record.power
            : null,
      })),
    };
  }

  /**
   * 跑步/骑行共用的效率向指标：WKG、RE、EI（仅依赖聚合与体重）。
   */
  computePowerEfficiencyMetrics(
    agg: PowerSeriesAggregates,
    userWeight?: number,
  ): { wkg: number; re: number; ei: number } {
    const wkg = userWeight ? agg.avgPower / userWeight : 0;
    const re =
      userWeight && userWeight > 0
        ? agg.avgSpeedMps / (agg.avgPower / userWeight)
        : 0;
    const ei =
      agg.avgSpeedMps > 0 && agg.avgPower > 0
        ? (agg.avgSpeedMps * 60) / agg.avgPower
        : 0;
    return { wkg, re, ei };
  }

  /**
   * 功率分区时长/占比统计（落库 ActivityZone POWER）。
   */
  computePowerZoneDistribution(
    records: SensorData[],
    zoneTemplate: UserZoneValue[] | undefined,
    sampleSecInput?: number,
  ): UserZoneValue[] {
    if (!zoneTemplate?.length) return [];
    return fillValueToPowerZones(
      records
        .filter((r) => typeof r.power === 'number' && Number.isFinite(r.power))
        .map((r) => ({ power: r.power as number })),
      zoneTemplate,
      sampleSecInput,
    );
  }

  private toBikeScoreSensorRecords(records: SensorData[]): SensorRecord[] {
    return records.map((r, index) => ({
      activityId: 0,
      index,
      lapIndex: 0,
      timestamp: new Date(r.time),
      distance: Number(r.distance),
      power: r.power,
      heartRate: r.heartRate,
      grade: r.grade,
    }));
  }
  /**
   * 计算 Coggan 相关指标（仅依赖聚合与 FTP）。
   */
  computeCogganMetrics(
    agg: PowerSeriesAggregates,
    ftp: number,
    sportType: $Enums.SportType,
  ): CogganResult {
    return computeCogganFromTimeline(
      agg.powerTimeline,
      ftp,
      agg.avgHeartRate,
      sportType,
    );
  }
  /**
   * 计算 BikeScore 相关指标（仅依赖聚合与 CP）。
   */
  computeBikeScoreMetrics(
    records: SensorData[],
    agg: PowerSeriesAggregates,
    cp: number,
  ): BikeScoreResult {
    const sensorRecords = this.toBikeScoreSensorRecords(records);
    return calculateBikeScoreMetrics(sensorRecords, {
      cp: cp || 0,
      sampleSec: agg.sampleSec,
      avgPower: agg.avgPower,
      avgHeartRate: agg.avgHeartRate,
    });
  }
}
