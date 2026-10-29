import { Injectable, Logger } from '@nestjs/common';
import { SensorDataService } from '../sensor/sensor-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { DurationCurvePoint, MaxMeanPower } from './power.interface';
import {
  Activity,
  PeakType,
  ScaleType,
  SportType,
  ZoneBase,
  ZoneType,
} from '@prisma/client';
import dayjs = require('dayjs');
import {
  computeMaxMeanSampledValues,
  computeMaxMeanValues,
} from '@/algorithm/window-analysis.util';
import { round } from 'lodash';
import { PowerDurationCurveByTimeRange } from './power.interface';
import { UserService } from '../api/user/user.service';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import {
  fillValueToPowerZones,
  isSameZones,
  UserZoneSetting,
  UserZoneValue,
} from '@/utils/zones';
import { detectSampleSec } from '@/algorithm/utils';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { replaceActivityZoneRows } from '@/prisma/activity-zone-write';

@Injectable()
export class powerService {
  private readonly logger = new Logger(powerService.name);

  constructor(
    private sensorDataService: SensorDataService,
    private prisma: PrismaService,
    private readonly userService: UserService,
    private readonly activityRead: ActivityReadService,
  ) {}

  /**
   * 获取 power 区间
   * 1. 如果有 activityHashId 则查 activity 相关的
   * 2. 如果没有 则查用户配置相关的
   */
  async getPowerZones(
    hashId?: string,
    params?: {
      userId?: string;
      sportType?: SportType;
      readOnly?: boolean;
    },
  ): Promise<UserZoneSetting | undefined> {
    const userId = params?.userId;
    if (!userId) return undefined;

    if (hashId) {
      const activity = await this.activityRead.findReadyByHashId(
        userId,
        hashId,
      );
      if (!activity) return undefined;
      // 1. 先获取 activity 缓存的 power zones
      const persistedZones = await this.getZonesByActivity(activity);
      // 2. 使用当前分析日真正生效的 FTP/CP 组合档案
      const profile = await this.userService.getComposedUserProfile(
        userId,
        activity.sportType,
        activity.startTime ?? undefined,
      );
      // 如果没有 FTP 或 CP，则直接返回 persistedZones
      // if (!profile.ftp || !profile.cp) {
      //   return persistedZones;
      // }

      // 3. 获取当前用户配置的 zones
      const userZones = await this.userService.getPowerZoneSettingResolved(
        userId,
        activity.sportType || params?.sportType,
        profile,
      );
      // 比对 persistedZones 和 targetZones 是否相同，如果相同则直接返回 persistedZones
      if (
        persistedZones &&
        userZones &&
        isSameZones(persistedZones, userZones)
      ) {
        return persistedZones;
      }

      // 5. 生成新的 power zones 并保存
      if (userZones) {
        return this.recalculateAndPersistPowerZonesByActivity(
          activity.id,
          userZones,
          { persist: !params?.readOnly },
        );
      }
      return persistedZones || undefined;
    }

    return await this.userService.getPowerZoneSettingResolved(
      userId,
      params.sportType,
    );
  }

  /**
   * 重新计算并保存 power zones
   *
   * @param activityId {number} 活动 ID
   * @param targetZones {UserZoneSetting} 目标区间配置
   * @returns {Promise<UserZoneSetting | undefined>} 功率区间配置 未找到则返回 undefined
   */
  private async recalculateAndPersistPowerZonesByActivity(
    activityId: number,
    targetZones: UserZoneSetting,
    options: { persist?: boolean } = {},
  ): Promise<UserZoneSetting | undefined> {
    const records = await this.sensorDataService.getRecordSeriesMulti(
      activityId,
      ['power'],
    );
    if (!records || records.length === 0) {
      return undefined;
    }
    const validRecords = records
      .filter((r) => r.power !== undefined)
      .map((r) => ({
        power: Number(r.power),
      }));
    const sampleSec = detectSampleSec(records as { time: string }[]);
    const calculatedZones = fillValueToPowerZones(
      validRecords,
      targetZones.zones,
      sampleSec,
    );

    const zoneRows = calculatedZones.map((z, idx) => ({
      activityId,
      zoneType: ZoneType.POWER,
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
        zoneType: ZoneType.POWER,
        rows: zoneRows,
      });
    }

    return {
      benchmark: targetZones.benchmark,
      zones: calculatedZones,
    };
  }
  /**
   * 获取 activity 的功率区间分析
   * @param activity
   * @param type
   * @returns
   */
  private async getZonesByActivity(
    activity: Activity,
  ): Promise<UserZoneSetting> {
    const zones = await this.activityRead.zones().findMany({
      where: {
        activityId: activity.id,
        zoneType: ZoneType.POWER,
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
   * 根据 活动 ID 来计算 最大平均功率（MMP）
   * @param activityId
   * @returns
   */
  async computeActivityMaxMeanPowers(
    activityId: number,
    options?: {
      records?: Array<{ time: string; tMs?: number; power?: number }>;
      sampleSec?: number;
    },
  ): Promise<MaxMeanPower | undefined> {
    const series =
      options?.records ??
      (await this.sensorDataService.getRecordSeriesMulti(activityId, [
        'power',
      ]));
    const powerSeries = series
      .map((r) => ({
        tMs: r.tMs ?? new Date(r.time).getTime(),
        value: Number(r.power),
      }))
      .filter(
        (p) =>
          Number.isFinite(p.tMs) && Number.isFinite(p.value) && p.value >= 0,
      )
      .sort((a, b) => a.tMs - b.tMs); // ensure sorted
    // 跳过少于 2 条数据的 activity
    if (powerSeries?.length <= 2) {
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
        ? computeMaxMeanSampledValues(powerSeries, durations, options.sampleSec)
        : computeMaxMeanValues(powerSeries, durations);

    this.logger.log(`MMP 的计算结果 为 ${JSON.stringify(result)}`);
    return result as unknown as MaxMeanPower;
  }

  /**
   * Get power duration curve analysis
   * Returns max mean power for different durations.
   */
  async getPowerDurationCurveByActivityId(
    activityId: number,
  ): Promise<DurationCurvePoint[]> {
    const peaks = await this.prisma.activityPeakMetric.findMany({
      where: {
        activity: readyActivityWhere({ id: activityId }),
        type: PeakType.power,
        scaleType: ScaleType.TIME,
      },
      select: {
        scaleValue: true,
        value: true,
      },
    });
    if (!peaks.length) {
      return null;
    }

    const map = new Map(peaks.map((p) => [p.scaleValue, round(p.value, 0)]));
    const getVal = (sec: number) => map.get(sec) ?? 0;

    // Build result points
    const points: DurationCurvePoint[] = [];

    // Add actual points (only those with values > 0)
    const durations = [1, 5, 10, 20, 30, 60, 180, 300, 1200, 3600, 7200, 10800];
    durations.forEach((d) => {
      const val = getVal(d);
      if (val > 0) {
        points.push({ duration: d, power: val });
      }
    });

    return points;
  }

  /**
   * Query power data by time ranges
   */
  async getPowerDurationCurve(
    timeRanges: { start?: string; end?: string }[],
    userId: string,
    sportType?: SportType | 'all',
  ): Promise<PowerDurationCurveByTimeRange[]> {
    const results: PowerDurationCurveByTimeRange[] = [];

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
          type: PeakType.power,
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
        '30s': getVal(30),
        '1m': getVal(60),
        '3m': getVal(180),
        '5m': getVal(300),
        '20m': getVal(1200),
        '60m': getVal(3600),
        '2h': getVal(7200),
        '3h': getVal(10800),
        '6h': getVal(21600),
      });
    }

    return results;
  }

  async getPowerMmpHistory(params: {
    start: string;
    end: string;
    userId: string;
    bucket: 'day' | 'week' | 'month';
    duration: '5s' | '10s' | '30s' | '1m' | '5m' | '20m' | '60m';
    sportType?: SportType | 'all';
  }): Promise<{ time: string; value: number }[]> {
    const { start, end, userId, bucket, duration, sportType } = params;

    const startDate = dayjs(start).startOf('day').toDate();
    const endDate = dayjs(end).endOf('day').toDate();

    const durationToSeconds = {
      '5s': 5,
      '10s': 10,
      '30s': 30,
      '1m': 60,
      '5m': 300,
      '20m': 1200,
      '60m': 3600,
    } as const;

    const scaleValue = durationToSeconds[duration];

    const sportFilter =
      sportType && sportType !== 'all'
        ? this.prisma.$queryRaw<
            { time: Date; value: number | null }[]
          >`SELECT date_trunc(${bucket}, a.start_time) AS time, MAX(p.value) AS value
            FROM t_activity_peak_metric p
            JOIN t_activity a ON a.id = p.activity_id
            WHERE a.user_id = ${userId}
              AND a.state = 1
              AND (a.processing_status = 'READY' OR a.ready_at IS NOT NULL)
              AND a.start_time IS NOT NULL
              AND a.start_time >= ${startDate}
              AND a.start_time <= ${endDate}
              AND p.type = 'power'::enum_peak_type
              AND p.scale_type = 'TIME'::enum_scale_type
              AND p.scale_value = ${scaleValue}
              AND p.sport = ${sportType}::enum_sport_type
            GROUP BY 1
            ORDER BY 1 ASC`
        : this.prisma.$queryRaw<{ time: Date; value: number | null }[]>`
            SELECT date_trunc(${bucket}, a.start_time) AS time, MAX(p.value) AS value
            FROM t_activity_peak_metric p
            JOIN t_activity a ON a.id = p.activity_id
            WHERE a.user_id = ${userId}
              AND a.state = 1
              AND (a.processing_status = 'READY' OR a.ready_at IS NOT NULL)
              AND a.start_time IS NOT NULL
              AND a.start_time >= ${startDate}
              AND a.start_time <= ${endDate}
              AND p.type = 'power'::enum_peak_type
              AND p.scale_type = 'TIME'::enum_scale_type
              AND p.scale_value = ${scaleValue}
            GROUP BY 1
            ORDER BY 1 ASC`;

    const rows = await sportFilter;
    return rows.map((r) => ({
      time: r.time.toISOString(),
      value: round(r.value || 0, 0),
    }));
  }

  async getPowerDurationCurvePoints(
    timeRanges: { start?: string; end?: string }[],
    userId: string,
    sportType?: SportType | 'all',
  ): Promise<
    {
      timeRange: { start?: string; end?: string };
      points: {
        durationSec: number;
        activities: {
          value: number;
          hashId: string;
          activityName?: string | null;
          startTime?: string | null;
          sportType?: SportType | null;
        }[];
      }[];
    }[]
  > {
    const durations = [5, 30, 60, 180, 300, 1200, 3600, 7200, 10800] as const;
    const topN = 6;

    const resolvedSportType =
      sportType && sportType !== 'all' ? (sportType as SportType) : undefined;

    const results: {
      timeRange: { start?: string; end?: string };
      points: {
        durationSec: number;
        activities: {
          value: number;
          hashId: string;
          activityName?: string | null;
          startTime?: string | null;
          sportType?: SportType | null;
        }[];
      }[];
    }[] = [];

    for (const range of timeRanges) {
      const startDate =
        typeof range?.start === 'string' ? new Date(range.start) : undefined;
      const endDate =
        typeof range?.end === 'string' ? new Date(range.end) : undefined;

      const startTimeFilter =
        startDate || endDate
          ? {
              startTime: {
                ...(startDate ? { gte: startDate } : {}),
                ...(endDate ? { lte: endDate } : {}),
              },
            }
          : {};

      const rows = await this.prisma.activityPeakMetric.findMany({
        where: {
          type: PeakType.power,
          scaleType: ScaleType.TIME,
          scaleValue: { in: [...durations] },
          ...(resolvedSportType ? { sport: resolvedSportType } : {}),
          activity: readyActivityWhere({
            userId,
            ...startTimeFilter,
          }),
        },
        orderBy: [{ scaleValue: 'asc' }, { value: 'desc' }],
        select: {
          scaleValue: true,
          value: true,
          activity: {
            select: {
              hashId: true,
              activityName: true,
              startTime: true,
              sportType: true,
            },
          },
        },
      });

      const grouped = new Map<
        number,
        {
          value: number;
          hashId: string;
          activityName?: string | null;
          startTime?: string | null;
          sportType?: SportType | null;
        }[]
      >();

      for (const r of rows) {
        if (!(typeof r.value === 'number' && Number.isFinite(r.value)))
          continue;
        if (!r?.activity?.hashId) continue;
        const list = grouped.get(r.scaleValue) ?? [];
        if (list.length >= topN) continue;
        list.push({
          value: round(r.value || 0, 0),
          hashId: r.activity.hashId,
          activityName: r.activity.activityName,
          startTime: r.activity.startTime
            ? r.activity.startTime.toISOString()
            : null,
          sportType: r.activity.sportType,
        });
        grouped.set(r.scaleValue, list);
      }

      results.push({
        timeRange: {
          start: range?.start,
          end: range?.end,
        },
        points: durations.map((d) => ({
          durationSec: d,
          activities: grouped.get(d) ?? [],
        })),
      });
    }

    return results;
  }
  /**
   * 获取 功率 区间分布
   * @param timeRanges
   * @param userId
   * @param sportType
   * @returns
   */
  async getPowerZonesDistribution(
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
        zoneType: ZoneType.POWER,
        activity: readyActivityWhere({
          userId,
          ...(querySportType ? { sportType: querySportType } : {}),
          ...startTimeFilter,
        }),
      };
      this.logger.debug(`[功率分区分布] 查询条件：${JSON.stringify(where)}`);
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
      this.logger.debug(`[功率分区分布] 查询结果行数：${rows.length}`);
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
        const order = Number(r.order ?? 0);
        if (!Number.isFinite(order) || order <= 0) continue;

        const dur = Number(r.duration ?? 0);
        if (!Number.isFinite(dur) || dur <= 0) continue;

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
}
