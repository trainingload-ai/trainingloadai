import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  SportType,
  ScaleType,
  Activity,
  ZoneType,
  Prisma,
  $Enums,
} from '@prisma/client';
import {
  PaceDistancePerformanceResponseItem,
  PaceDistanceValue,
} from './dto/pace-distance-performance.dto';
import { ActivityReadService } from '../activity/activity-read.service';
import { UserService } from '../user/user.service';
import dayjs = require('dayjs');
import {
  fillValueToPaceZones,
  isSameZones,
  UserZoneSetting,
  UserZoneValue,
} from '@/utils/zones';
import { detectSampleSec } from '@/algorithm/utils';
import { SensorDataService } from '@/sensor/sensor-data.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { replaceActivityZoneRows } from '@/prisma/activity-zone-write';

type DistanceKey = string;

const RUN_CYCLING_DISTANCES: Array<{ key: DistanceKey; distanceM: number }> = [
  { key: '400m', distanceM: 400 },
  { key: '800m', distanceM: 800 },
  { key: '1500m', distanceM: 1500 },
  { key: '1mi', distanceM: 1609 },
  { key: '3k', distanceM: 3000 },
  { key: '5k', distanceM: 5000 },
  { key: '10k', distanceM: 10000 },
  { key: '20k', distanceM: 20000 },
  { key: '42.2k', distanceM: 42200 },
];

const SWIM_DISTANCES: Array<{ key: DistanceKey; distanceM: number }> = [
  { key: '50m', distanceM: 50 },
  { key: '100m', distanceM: 100 },
  { key: '200m', distanceM: 200 },
  { key: '400m_swim', distanceM: 400 },
  { key: '800m_swim', distanceM: 800 },
  { key: '1500m_swim', distanceM: 1500 },
];

const STANDARD_TIMES: Array<{ key: string; timeS: number }> = [
  { key: '60s', timeS: 60 },
  { key: '300s', timeS: 300 },
  { key: '720s', timeS: 720 },
  { key: '1200s', timeS: 1200 },
  { key: '1800s', timeS: 1800 },
  { key: '3600s', timeS: 3600 },
  { key: '7200s', timeS: 7200 },
  { key: '10800s', timeS: 10800 },
  { key: '18000s', timeS: 18000 },
  { key: '28800s', timeS: 28800 },
];

function getDistancesBySportType(
  sportType: SportType,
): Array<{ key: DistanceKey; distanceM: number }> {
  if (sportType === 'SWIM') return SWIM_DISTANCES;
  return RUN_CYCLING_DISTANCES;
}

function getTimesBySportType(
  _sportType: SportType,
): Array<{ key: string; timeS: number }> {
  // Currently using same times for all sports, can be customized later
  return STANDARD_TIMES;
}

@Injectable()
export class PaceService {
  private readonly logger = new Logger(PaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private sensorDataService: SensorDataService,
    private readonly activityRead: ActivityReadService,
    private readonly userService: UserService,
  ) {}

  async getPaceZonePreviews(userId: string, sportType: SportType) {
    return this.userService.getZoneModelPreviews(
      userId,
      sportType,
      ZoneType.PACE,
    );
  }

  /**
   * 获取配速区间配置
   * @param hashId {string} 活动 hashId
   * @param opts {object} 选项
   * @param opts.userId {string} 用户 ID
   * @param opts.sportType {SportType} 运动类型
   * @returns {Promise<UserZoneSetting>} 配速区间配置，未找到时返回空区间
   */
  async getPaceZones(
    hashId?: string,
    opts?: { userId?: string; sportType?: SportType; readOnly?: boolean },
  ): Promise<UserZoneSetting> {
    const userId = opts?.userId;
    if (!userId) return { zones: [] };
    // 如果 hashId 存在，则获取活动对应的配速区间配置
    if (hashId) {
      // 1. 获取活动
      const activity = await this.activityRead.findReadyByHashId(
        userId,
        hashId,
      );
      // 2. 如果活动不存在，则返回空区间
      if (!activity) return { zones: [] };
      // 3. 获取活动对应的配速区间配置
      const persistedZones = await this.getZonesByActivity(activity);
      // 4. 获取当前分析日真正生效的 VO2MAX/TP/CS
      const profile = await this.userService.getComposedUserProfile(
        userId,
        activity.sportType,
        activity.startTime ?? undefined,
      );

      const userZones = await this.userService.getPaceZoneSettingResolved(
        userId,
        activity.sportType || opts?.sportType,
        profile,
      );
      // 5. 比对 persistedZones 和 targetZones 是否相同，如果相同则直接返回 persistedZones
      if (
        persistedZones &&
        userZones &&
        isSameZones(persistedZones, userZones)
      ) {
        return persistedZones;
      }
      // 6. 如果 userZones 存在，则重新计算并保存配速区间配置
      if (userZones) {
        return await this.recalculateAndPersistPaceZonesByActivity(
          activity.id,
          userZones,
          { persist: !opts?.readOnly },
        );
      }
      return persistedZones ?? { zones: [] };
    }

    // 如果 hashId 不存在，则获取用户配置的配速区间配置
    return (
      (await this.userService.getPaceZoneSettingResolved(
        userId,
        opts?.sportType,
      )) ?? { zones: [] }
    );
  }

  private toEmptyPaceZoneDistribution(
    setting: UserZoneSetting,
  ): UserZoneSetting | undefined {
    const zones = setting?.zones || [];
    if (zones.length === 0) return undefined;

    return {
      benchmark: setting.benchmark,
      zones: zones.map((zone, index) => ({
        ...zone,
        name: zone.name || `z${index + 1}`,
        order:
          typeof zone.order === 'number' &&
          Number.isFinite(zone.order) &&
          zone.order > 0
            ? zone.order
            : index + 1,
        duration: 0,
        percent: 0,
        avg: 0,
      })),
    };
  }

  private computeValue(
    distanceM: number,
    timeS: number,
    sportType?: SportType,
  ): PaceDistanceValue | undefined {
    try {
      const base = sportType === 'SWIM' ? 100 : 1000;
      const computedTimeS = timeS;

      const paceSec = (computedTimeS / distanceM) * base;
      return { paceSec, timeSec: computedTimeS, paceBaseM: base };
    } catch (error) {
      this.logger.error(
        `[computeValue] 计算配速值失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }

  async getDistancePerformanceByRanges(
    userId: string,
    sportType: SportType,
    ranges: { start?: string; end?: string }[],
    customTargets?: number[],
    mode: 'distance' | 'time' = 'distance',
    limit: number = 1,
  ): Promise<PaceDistancePerformanceResponseItem[]> {
    try {
      const isTimeMode = mode === 'time';
      let targetItems: { key: string; value: number }[] = [];

      if (customTargets && customTargets.length > 0) {
        targetItems = customTargets.map((t) => ({
          key: isTimeMode ? `${t}s` : t.toString(),
          value: t,
        }));
      } else {
        if (isTimeMode) {
          targetItems = getTimesBySportType(sportType).map((t) => ({
            key: t.key,
            value: t.timeS,
          }));
        } else {
          targetItems = getDistancesBySportType(sportType).map((d) => ({
            key: d.key,
            value: d.distanceM,
          }));
        }
      }

      const targetValues = targetItems.map((t) => t.value);
      const results: PaceDistancePerformanceResponseItem[] = [];

      for (const range of ranges) {
        const start = range.start
          ? dayjs(range.start).startOf('day').toDate()
          : undefined;
        const end = range.end
          ? dayjs(range.end).endOf('day').toDate()
          : undefined;

        const where: Prisma.ActivityPerformanceTTWhereInput = {
          sport: sportType,
          targetScaleType: isTimeMode ? ScaleType.TIME : ScaleType.DISTANCE,
          targetScaleValue: { in: targetValues },
          activity: readyActivityWhere({ userId }),
        };

        if (start && end) {
          where.activity.startTime = { gte: start, lte: end };
        }

        const perfRows = await this.prisma.activityPerformanceTT.findMany({
          where,
          select: {
            targetScaleValue: true,
            resultTimeSec: true,
            resultDistanceM: true,
            activity: {
              select: {
                hashId: true,
                startTime: true,
              },
            },
          },
        });

        const map: Record<
          number,
          Array<{
            timeS?: number | null; // For distance mode (from duration) or time mode (scaleValue)
            distanceM?: number | null; // For time mode (from value)
            activityId?: string;
            activityTime?: Date;
          }>
        > = {};

        // Process rows to find best performance
        for (const row of perfRows as Array<{
          targetScaleValue: number;
          resultTimeSec?: number | null;
          resultDistanceM?: number | null;
          activity: { hashId: string; startTime: Date };
        }>) {
          const scaleVal = row.targetScaleValue; // Distance (m) or Time (s)

          if (isTimeMode) {
            // Time mode: value is distance (m), looking for MAX distance
            const distanceM = row.resultDistanceM || 0;
            const timeS = scaleVal;

            if (distanceM <= 0) continue;

            const entry = {
              timeS,
              distanceM,
              activityId: row.activity.hashId,
              activityTime: row.activity.startTime,
            };

            if (!map[scaleVal]) map[scaleVal] = [];
            map[scaleVal].push(entry);
          } else {
            // Distance mode: looking for MIN time
            const timeS = row.resultTimeSec || 0;

            if (!timeS || timeS <= 0) continue;

            const entry = {
              timeS,
              activityId: row.activity.hashId,
              activityTime: row.activity.startTime,
            };

            if (!map[scaleVal]) map[scaleVal] = [];
            map[scaleVal].push(entry);
          }
        }

        // Sort and limit
        for (const scaleVal in map) {
          if (isTimeMode) {
            // Max distance is better
            map[scaleVal].sort(
              (a, b) => (b.distanceM || 0) - (a.distanceM || 0),
            );
          } else {
            // Min time is better
            map[scaleVal].sort(
              (a, b) => (a.timeS || Infinity) - (b.timeS || Infinity),
            );
          }
          if (limit > 0) {
            map[scaleVal] = map[scaleVal].slice(0, limit);
          }
        }

        const values: Record<string, PaceDistanceValue | undefined> = {};
        const topValues: Record<string, PaceDistanceValue[]> = {};

        for (const { key, value } of targetItems) {
          const pickedList = map[value];
          if (!pickedList || pickedList.length === 0) {
            values[key] = undefined;
            topValues[key] = [];
            continue;
          }

          const convertToVal = (picked: (typeof pickedList)[0]) => {
            let val: PaceDistanceValue | undefined;
            if (isTimeMode) {
              if (picked.distanceM) {
                val = this.computeValue(picked.distanceM, value, sportType);
              }
            } else {
              if (picked.timeS) {
                val = this.computeValue(value, picked.timeS, sportType);
              }
            }
            if (val) {
              val.activityId = picked.activityId;
              val.activityTime = picked.activityTime?.toISOString();
            }
            return val;
          };

          // Best value (first one)
          values[key] = convertToVal(pickedList[0]);

          // Top values
          topValues[key] = pickedList
            .map(convertToVal)
            .filter((v): v is PaceDistanceValue => !!v);
        }

        results.push({
          timeRange: { start: range.start, end: range.end },
          values,
          topValues,
        });
      }
      return results;
    } catch (error) {
      this.logger.error(
        `[getDistancePerformanceByRanges] 获取区间距离表现失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * 获取 activity 的配速区间分析
   * @param activity
   * @returns {Promise<UserZoneSetting | undefined>} 配速区间配置 未找到则返回 undefined
   */
  async getZonesByActivity(
    activity: Activity,
  ): Promise<UserZoneSetting | undefined> {
    const zones = await this.activityRead.zones().findMany({
      where: {
        activityId: activity.id,
        zoneType: ZoneType.PACE,
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
   * 按时间范围聚合并获取配速区间占比
   */
  async getPaceZonesDistribution(
    timeRanges: { start?: string; end?: string }[],
    userId: string,
    sportType?: SportType | 'all',
  ): Promise<
    Array<{
      timeRange: { start?: string; end?: string };
      zones: UserZoneValue[];
      benchmark?: $Enums.ZoneBase;
    }>
  > {
    const querySportType =
      sportType && sportType !== 'all' ? (sportType as SportType) : undefined;

    const setting = await this.prisma.userZoneSetting.findFirst({
      where: {
        userId,
        sportType: querySportType,
        zoneType: ZoneType.PACE,
      },
      include: { zones: { orderBy: { order: 'asc' } } },
    });
    const baseZones: Array<{
      order: number;
      name: string;
      min?: number | null;
      max?: number | null;
    }> = (setting?.zones ?? []).map((z, idx) => ({
      order: Number(z.order ?? idx + 1),
      name: z.name || `z${idx + 1}`,
      min: z.min ?? null,
      max: z.max ?? null,
    }));

    const results: {
      timeRange: { start?: string; end?: string };
      zones: UserZoneValue[];
      benchmark?: $Enums.ZoneBase;
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

      const rows = await this.activityRead.zones().findMany({
        where: {
          zoneType: ZoneType.PACE,
          activity: readyActivityWhere({
            userId,
            ...(querySportType ? { sportType: querySportType } : {}),
            ...startTimeFilter,
          }),
        },
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

      const orders =
        baseZones.length > 0
          ? baseZones
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((z) => z.order)
          : Array.from(agg.keys()).sort((a, b) => a - b);

      const zones: UserZoneValue[] = orders.map((order, idx) => {
        const base = baseZones.find((z) => z.order === order);
        const a = agg.get(order);
        const duration = a?.duration ?? 0;
        const percent =
          totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
        const avg = a && a.avgWeight > 0 ? a.avgSum / a.avgWeight : undefined;

        return {
          order,
          name: base?.name || a?.name || `z${idx + 1}`,
          color: a?.color,
          min: base?.min ?? a?.min,
          max: base?.max ?? a?.max,
          duration,
          percent,
          avg,
        } as UserZoneValue;
      });

      results.push({
        timeRange: { start: range?.start, end: range?.end },
        zones,
        benchmark: (setting?.benchmark as $Enums.ZoneBase) || undefined,
      });
    }

    return results;
  }

  /**
   * 重新计算并保存配速区间配置
   * @param activityId
   * @param targetZones
   * @returns {Promise<UserZoneSetting | undefined>} 配速区间配置 未找到则返回 undefined
   */
  private async recalculateAndPersistPaceZonesByActivity(
    activityId: number,
    targetZones: UserZoneSetting,
    options: { persist?: boolean } = {},
  ): Promise<UserZoneSetting | undefined> {
    const records = await this.sensorDataService.getRecordSeriesMulti?.(
      activityId,
      ['gap', 'speed', 'time'],
    );
    const sensorRecords =
      records ??
      (await (
        this.prisma as PrismaService & {
          activityRecord?: {
            findMany(args: {
              where: { activityId: number };
              select: { gap: true; speed: true; time: true };
            }): Promise<
              Array<{
                gap?: number | null;
                speed?: number | null;
                time?: string | Date | null;
              }>
            >;
          };
        }
      ).activityRecord?.findMany?.({
        where: { activityId },
        select: { gap: true, speed: true, time: true },
      }));
    if (!sensorRecords || sensorRecords.length === 0) {
      return undefined;
    }
    const sampleSec = detectSampleSec(sensorRecords as { time: string }[]) || 1;
    const validRecords = sensorRecords
      .map((r) => {
        const speed =
          Number.isFinite(r?.speed) && Number(r.speed) > 0
            ? Number(r.speed)
            : Number.isFinite(r?.gap) && Number(r.gap) > 0
              ? 1 / Number(r.gap)
              : NaN;
        return { speed } as { speed: number };
      })
      .filter((r) => Number.isFinite(r.speed) && r.speed > 0);

    const calculatedZones = fillValueToPaceZones(
      validRecords,
      targetZones.zones,
      sampleSec,
    );
    if (calculatedZones.length === 0) {
      return undefined;
    }

    const zoneRows = calculatedZones.map((z, idx) => ({
      activityId,
      zoneType: ZoneType.PACE,
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
        zoneType: ZoneType.PACE,
        rows: zoneRows,
      });
    }

    return {
      benchmark: targetZones.benchmark,
      zones: calculatedZones,
    };
  }
}
