import { Injectable, Logger } from '@nestjs/common';
import { ActivityReadService } from '../api/activity/activity-read.service';
import {
  MaxMeanHeartRate,
  HeartRateDurationCurvePoint,
  HeartRateDurationCurveByTimeRange,
} from './heart-rate.interfaces';
import { PrismaService } from '../prisma/prisma.service';
import {
  Activity,
  SportType,
  ZoneType,
  PeakType,
  ScaleType,
  ZoneBase,
} from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { UserService } from '../api/user/user.service';

import { SensorDataService } from '../sensor/sensor-data.service';
import { computeTRIMP } from '../algorithm/trimp';
import dayjs = require('dayjs');
import { round } from 'lodash';
import {
  computeMaxMeanSampledValues,
  computeMaxMeanValues,
} from '@/algorithm/window-analysis.util';
import {
  fillValueToHeartRateZones,
  isSameZones,
  UserZoneSetting,
  UserZoneValue,
} from '@/utils/zones';
import { detectSampleSec } from '@/algorithm/utils';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { replaceActivityZoneRows } from '@/prisma/activity-zone-write';

@Injectable()
export class HeartRateService {
  private readonly logger = new Logger(HeartRateService.name);

  constructor(
    private readonly activityRead: ActivityReadService,
    private prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly userService: UserService,
    private sensorDataService: SensorDataService,
  ) {}

  /**
   * 获取活动的心率区间设置
   * - 如果有 hashId，则返回该活动的 zones
   * - 如果没有 hashId，则返回当前用户的默认 zones
   * @param hashId
   * @param opts
   * @returns
   */
  async getHeartRateZones(
    hashId?: string,
    params?: {
      userId?: string;
      sportType?: SportType;
      readOnly?: boolean;
    },
  ): Promise<UserZoneSetting | undefined> {
    const userId = params?.userId;
    if (!userId) return undefined;

    // 1. 如果有 hashId，则返回该活动的 zones
    if (hashId) {
      const activity = await this.activityRead.findReadyByHashId(
        userId,
        hashId,
      );
      if (!activity) return undefined;

      // 1.1 获取持久化的 zones
      const persistedZones = await this.getZonesByActivity(activity);

      // 1.2 获取当前分析日真正生效的用户配置
      const profile = await this.userService.getComposedUserProfile(
        userId,
        activity.sportType,
        activity.startTime ?? undefined,
      );

      // 3. 获取当前用户配置的 zones
      const userZones = await this.userService.getHeartRateZoneSetting(
        userId,
        activity.sportType || params?.sportType,
        profile,
      );
      if (!userZones?.zones?.length) return persistedZones;

      // 比对 persistedZones 和 targetZones 是否相同，如果相同则直接返回 persistedZones
      if (
        persistedZones &&
        userZones &&
        isSameZones(persistedZones, userZones)
      ) {
        return persistedZones;
      }
      // 5. 生成新的 zones 并保存
      if (userZones) {
        return this.recalculateAndPersistHeartRateZonesByActivity(
          activity.id,
          userZones,
          { persist: !params?.readOnly },
        );
      }
      return persistedZones || undefined;
    }

    return await this.userService.getHeartRateZoneSetting(
      userId,
      params.sportType,
    );
  }

  /**
   * 获取某次活动的按分钟 TRIMP
   * 返回分钟粒度数据：[timestamp, hrPercent, cumulativeTrimp]
   */
  async getTrimpPerMinute(
    hashId: string,
    userId: string,
  ): Promise<
    Array<{
      time: string;
      hrPercent: number;
      trimp: number;
      cumulativeTrimp: number;
    }>
  > {
    const activity = await this.activityRead.findReadyByHashId(userId, hashId);
    if (!activity) {
      return [];
    }

    // 计算最大心率与静息心率
    const hrThreshold = await this.userService.getUserHeartRateThreshold(
      activity.userId,
      activity.sportType,
      activity.startTime ?? undefined,
      activity.id,
    );
    const maxHR = hrThreshold?.maxHeartRate;
    const restHR = hrThreshold?.restingHeartRate;
    let gender = 'male';

    const profile = await this.userService.getComposedUserProfile(
      userId,
      activity.sportType,
      activity.startTime ?? undefined,
    );
    if (profile?.gender) gender = profile.gender;

    if (!maxHR || !restHR) {
      this.logger.warn(
        `[getTrimpPerMinute] 缺少最大心率或静息心率：maxHR=${maxHR}，restHR=${restHR}，活动ID=${hashId}`,
      );
      return [];
    }

    // 读取心率数据
    const records = await this.sensorDataService.getRecordSeriesMulti(
      activity.id,
      ['heartRate'],
    );

    if (!records || records.length === 0) {
      return [];
    }

    // 按分钟聚合
    const minuteData = new Map<
      string,
      { sumHr: number; count: number; timestamp: string }
    >();

    for (const record of records) {
      if (record.heartRate !== undefined && record.heartRate !== null) {
        // 使用分钟桶键（YYYY-MM-DD HH:mm）
        const time = dayjs(record.time);
        const key = time.format('YYYY-MM-DD HH:mm');

        if (!minuteData.has(key)) {
          minuteData.set(key, { sumHr: 0, count: 0, timestamp: key });
        }

        const entry = minuteData.get(key)!;
        entry.sumHr += record.heartRate;
        entry.count += 1;
      }
    }

    // 计算每分钟 TRIMP 并累计
    const result: Array<{
      time: string;
      hrPercent: number;
      trimp: number;
      cumulativeTrimp: number;
    }> = [];

    let cumulativeTrimp = 0;
    const sortedMinutes = Array.from(minuteData.values()).sort(
      (a, b) => dayjs(a.timestamp).valueOf() - dayjs(b.timestamp).valueOf(),
    );

    for (const minute of sortedMinutes) {
      const avgHr = minute.sumHr / minute.count;
      // 计算 1 分钟 TRIMP
      const minuteTrimp = computeTRIMP(1, avgHr, maxHR, restHR, gender);
      cumulativeTrimp += minuteTrimp;

      // 计算相对最大心率的百分比
      const hrPercent = round((avgHr / maxHR) * 100);

      result.push({
        time: minute.timestamp,
        hrPercent,
        trimp: minuteTrimp,
        cumulativeTrimp: round(cumulativeTrimp, 2),
      });
    }

    return result;
  }

  /**
   * Get heart rate zone analysis (basic stats + zone analysis).
   * By default, returns zone boundaries and distribution based on %MHR.
   */
  async getZonesByActivity(
    activity: Activity,
  ): Promise<UserZoneSetting | undefined> {
    const zones = await this.activityRead.zones().findMany({
      where: {
        activityId: activity.id,
        zoneType: ZoneType.HEART_RATE,
      },
      orderBy: {
        order: 'asc',
      },
    });
    if (!zones || zones.length === 0) {
      return undefined;
    }

    return {
      zones: zones.map((item, index) => ({
        name: item.name || item.zoneType || `z${item.order ?? index + 1}`,
        order: item.order ?? undefined,
        duration: item.duration ?? undefined,
        percent: item.percent ?? undefined,
        min: item.min ?? undefined,
        max: item.max ?? undefined,
        avg: item.avg ?? undefined,
        color: item.color ?? undefined,
      })),
    };
  }

  /**
   * 计算 MMHR
   * @param activityId
   * @returns
   */
  async computeActivityMaxMeanHeartRates(
    activityId: number,
    options?: {
      records?: Array<{ time: string; tMs?: number; heartRate?: number }>;
      sampleSec?: number;
    },
  ): Promise<MaxMeanHeartRate | undefined> {
    const series =
      options?.records ??
      (await this.sensorDataService.getRecordSeriesMulti(activityId, [
        'heartRate',
      ]));
    const hrSeries = series
      .map((r) => ({
        tMs: r.tMs ?? new Date(r.time).getTime(),
        value: Number(r.heartRate),
      }))
      .filter(
        (p) =>
          Number.isFinite(p.tMs) && Number.isFinite(p.value) && p.value > 0,
      )
      .sort((a, b) => a.tMs - b.tMs); // ensure sorted

    // Skip if too few data points
    if (hrSeries?.length <= 2) {
      return undefined;
    }

    const durations = {
      '1s': 1,
      '5s': 5,
      '10s': 10,
      '20s': 20,
      '30s': 30,
      '1m': 60,
      '3m': 180,
      '5m': 300,
      '10m': 600,
      '20m': 1200,
      '30m': 1800,
      '60m': 3600,
      '2h': 7200,
      '3h': 10800,
      '6h': 21600,
    };

    const result =
      options?.sampleSec != null &&
      Number.isFinite(options.sampleSec) &&
      options.sampleSec > 0
        ? computeMaxMeanSampledValues(hrSeries, durations, options.sampleSec)
        : computeMaxMeanValues(hrSeries, durations);

    this.logger.log(`MMHR 的计算结果为 ${JSON.stringify(result)}`);
    return result as unknown as MaxMeanHeartRate;
  }

  /**
   * 按活动 ID 获取心率持续时间曲线分析
   * 返回不同持续时间下的最大平均心率
   */
  async getHeartRateDurationCurveByActivityId(
    activityId: number,
  ): Promise<HeartRateDurationCurvePoint[]> {
    const peaks = await this.prisma.activityPeakMetric.findMany({
      where: {
        activity: readyActivityWhere({ id: activityId }),
        type: PeakType.hr,
        scaleType: ScaleType.TIME,
      },
      select: {
        scaleValue: true,
        value: true,
      },
    });
    if (!peaks.length) {
      return [];
    }

    const map = new Map(peaks.map((p) => [p.scaleValue, round(p.value, 0)]));
    const getVal = (sec: number) => map.get(sec) ?? 0;

    // 构建结果点
    const points: HeartRateDurationCurvePoint[] = [];

    // 仅添加实际存在的点（值 > 0）
    const durations = [
      1, 5, 10, 20, 30, 60, 180, 300, 600, 1200, 1800, 3600, 7200, 10800, 21600,
    ];
    durations.forEach((d) => {
      const val = getVal(d);
      if (val > 0) {
        points.push({ duration: d, bpm: val });
      }
    });

    return points;
  }

  /**
   * 按时间范围查询心率数据
   */
  async getHeartRateDurationCurve(
    timeRanges: { start?: string; end?: string }[],
    userId: string,
    sportType?: SportType | 'all',
  ): Promise<HeartRateDurationCurveByTimeRange[]> {
    const results: HeartRateDurationCurveByTimeRange[] = [];

    for (const range of timeRanges) {
      const startDate = range.start
        ? dayjs(range.start).startOf('day').toDate()
        : undefined;
      const endDate = range.end
        ? dayjs(range.end).endOf('day').toDate()
        : undefined;

      const peaks = await this.prisma.activityPeakMetric.groupBy({
        by: ['scaleValue'],
        where: {
          type: PeakType.hr,
          scaleType: ScaleType.TIME,
          sport:
            sportType && sportType !== 'all'
              ? (sportType as SportType)
              : undefined,
          activity: readyActivityWhere({
            userId,
            startTime: {
              gte: startDate,
              lte: endDate,
            },
          }),
        },
        _max: {
          value: true,
        },
      });
      const map = new Map(
        peaks.map((p) => [p.scaleValue, round(p._max.value || 0, 0)]),
      );
      const getVal = (sec: number) => map.get(sec) ?? 0;

      results.push({
        timeRange: {
          start: range.start,
          end: range.end,
        },
        '1s': getVal(1),
        '5s': getVal(5),
        '10s': getVal(10),
        '20s': getVal(20),
        '30s': getVal(30),
        '1m': getVal(60),
        '3m': getVal(180),
        '5m': getVal(300),
        '10m': getVal(600),
        '20m': getVal(1200),
        '30m': getVal(1800),
        '60m': getVal(3600),
        '2h': getVal(7200),
        '3h': getVal(10800),
        '6h': getVal(21600),
      });
    }

    return results;
  }

  /**
   * 按时间范围聚合并获取心率区间占比
   */
  async getHeartRateZonesDistribution(
    timeRanges: { start?: string; end?: string }[],
    userId: string,
    sportType?: SportType | 'all',
  ): Promise<
    {
      timeRange: { start?: string; end?: string };
      zones: UserZoneValue[];
      benchmark?: ZoneBase;
    }[]
  > {
    const querySportType =
      sportType && sportType !== 'all' ? (sportType as SportType) : undefined;

    const results: {
      timeRange: { start?: string; end?: string };
      zones: UserZoneValue[];
      benchmark?: ZoneBase;
    }[] = [];
    for (const range of timeRanges) {
      const startDate = range?.start
        ? dayjs(range.start).startOf('day').toDate()
        : undefined;
      const endDate = range?.end
        ? dayjs(range.end).endOf('day').toDate()
        : undefined;

      const startTimeFilter =
        startDate || endDate
          ? {
              startTime: {
                ...(startDate ? { gte: startDate } : {}),
                ...(endDate ? { lte: endDate } : {}),
              },
            }
          : {};
      const where = {
        zoneType: ZoneType.HEART_RATE,
        activity: readyActivityWhere({
          userId,
          ...(querySportType ? { sportType: querySportType } : {}),
          ...startTimeFilter,
        }),
      };

      const rows = await this.activityRead.zones().findMany({
        where: where,
        select: {
          order: true,
          name: true,
          color: true,
          min: true,
          max: true,
          duration: true,
          avg: true,
        },
      });

      const agg = new Map<
        number,
        {
          order: number;
          name: string;
          color?: string;
          min?: number;
          max?: number;
          duration: number;
          avgSum: number;
          avgWeight: number;
        }
      >();

      for (const r of rows) {
        const order = r.order;
        const dur = Number(r.duration ?? 0);
        if (!Number.isFinite(dur) || dur < 0) continue;

        const existing = agg.get(order) ?? {
          order,
          name: r.name || `z${order}`,
          color: r.color ?? undefined,
          min: r.min ?? undefined,
          max: r.max ?? undefined,
          duration: 0,
          avgSum: 0,
          avgWeight: 0,
        };

        if (!existing.color && r.color) {
          existing.color = r.color;
        }

        existing.duration += dur;

        const avg = Number(r.avg ?? NaN);
        if (Number.isFinite(avg)) {
          existing.avgSum += avg * dur;
          existing.avgWeight += dur;
        }

        agg.set(order, existing);
      }

      const totalDuration = Array.from(agg.values()).reduce(
        (sum, z) => sum + z.duration,
        0,
      );

      const orders = Array.from(agg.keys()).sort((a, b) => a - b);

      const zones: UserZoneValue[] = orders.map((order, idx) => {
        const a = agg.get(order);
        const duration = a?.duration ?? 0;
        const percent =
          totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
        const avg = a && a.avgWeight > 0 ? a.avgSum / a.avgWeight : undefined;

        return {
          order,
          name: a?.name || `z${idx + 1}`,
          color: a?.color,
          min: a?.min,
          max: a?.max,
          duration,
          percent,
          avg,
        };
      });

      results.push({
        timeRange: { start: range?.start, end: range?.end },
        zones,
        benchmark: undefined,
      });
    }

    return results;
  }

  /**
   * 重新计算并保存心率区间数据
   *
   * @param activityId
   * @param targetZones
   * @returns
   */
  private async recalculateAndPersistHeartRateZonesByActivity(
    activityId: number,
    targetZones: UserZoneSetting,
    options: { persist?: boolean } = {},
  ): Promise<UserZoneSetting | undefined> {
    const records = await this.sensorDataService.getRecordSeriesMulti(
      activityId,
      ['heartRate'],
    );
    if (!records || records.length === 0) {
      return undefined;
    }
    const validRecords = records
      .filter((r) => r.heartRate !== undefined)
      .map((r) => ({
        heartRate: Number(r.heartRate),
      }));
    const sampleSec = detectSampleSec(records as { time: string }[]);
    const calculatedZones = fillValueToHeartRateZones(
      validRecords,
      targetZones.zones,
      sampleSec,
    );

    const zoneRows = calculatedZones.map((z, idx) => ({
      activityId,
      zoneType: ZoneType.HEART_RATE,
      name: z.name ?? '',
      order: typeof z.order === 'number' && z.order > 0 ? z.order : idx + 1,
      color: z.color ?? undefined,
      duration: z.duration ?? undefined,
      percent: z.percent ?? undefined,
      min: z.min ?? undefined,
      max: z.max ?? undefined,
      avg: z.avg ?? undefined,
    }));

    if (options.persist !== false) {
      await replaceActivityZoneRows(this.prisma, {
        activityId,
        zoneType: ZoneType.HEART_RATE,
        rows: zoneRows,
      });
    }

    return {
      benchmark: targetZones.benchmark,
      zones: calculatedZones,
    };
  }
}
