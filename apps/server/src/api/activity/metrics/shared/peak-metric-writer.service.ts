import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { Activity, PeakType, ScaleType, SportType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import type { PeakIntervalObservation, PeakMetricKey } from '../context';

@Injectable()
export class ActivityPeakMetricWriterService {
  private readonly logger = new Logger(ActivityPeakMetricWriterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 负责将计算好的峰值指标写入数据库，并更新缓存。这个方法会先删除已有的同类型同尺度的峰值数据，再批量插入新的数据。
   * @param args
   */
  async replacePeakMetrics(args: {
    activity: Activity;
    intervals: Record<string, number | undefined>;
    type: PeakType;
    scaleType: ScaleType;
    windows?: Record<string, PeakIntervalObservation | undefined>;
  }) {
    const { activity, intervals, type, scaleType, windows } = args;
    try {
      const calculatedAt =
        activity.startTime ?? activity.timestamp ?? new Date();
      const data: Array<{
        activityId: number;
        sport: SportType;
        type: PeakType;
        scaleType: ScaleType;
        scaleValue: number;
        value: number;
        startElapsedSec: number | null;
        endElapsedSec: number | null;
        startDistanceM: number | null;
        endDistanceM: number | null;
        coveredSeconds: number | null;
        coverageRatio: number | null;
        algorithmVersion: number | null;
        parameters: Prisma.InputJsonValue | typeof Prisma.JsonNull;
        calculatedAt: Date;
      }> = [];

      for (const [key, value] of Object.entries(intervals)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        let scaleValue = 0;
        if (scaleType === 'TIME') {
          scaleValue = this.parseIntervalKeyToSeconds(key);
        } else if (scaleType === 'DISTANCE') {
          scaleValue = parseInt(key, 10);
        }
        if (scaleValue > 0) {
          const window = windows?.[key];
          data.push({
            activityId: activity.id,
            sport: (activity.sportType ?? 'UNKNOWN') as SportType,
            type,
            scaleType,
            scaleValue,
            value,
            startElapsedSec: window?.startElapsedSec ?? null,
            endElapsedSec: window?.endElapsedSec ?? null,
            startDistanceM: window?.startDistanceM ?? null,
            endDistanceM: window?.endDistanceM ?? null,
            coveredSeconds: window?.coveredSeconds ?? null,
            coverageRatio: window?.coverageRatio ?? null,
            algorithmVersion: window?.algorithmVersion ?? null,
            parameters: window?.parameters
              ? (window.parameters as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            calculatedAt,
          });
        }
      }

      await this.prisma.activityPeakMetric.deleteMany({
        where: { activityId: activity.id, type, scaleType },
      });
      if (data.length > 0) {
        await this.prisma.activityPeakMetric.createMany({
          data,
          skipDuplicates: true,
        });
      }
    } catch (e) {
      this.logger.error(
        `[replacePeakMetrics] 替换峰值指标失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'internal server error',
      });
    }
  }

  /**
   * Same mapping as DB `scaleValue` for TIME peaks (seconds).
   */
  parseIntervalKeyToSeconds(duration: string): number {
    try {
      const unit = duration.slice(-1);
      const value = parseInt(duration.slice(0, -1), 10);
      if (Number.isNaN(value)) return 0;
      if (unit === 's') return value;
      if (unit === 'm') return value * 60;
      if (unit === 'h') return value * 3600;
      return 0;
    } catch (e) {
      this.logger.error(
        `[parseIntervalKeyToSeconds] 解析区间键失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return 0;
    }
  }

  /**
   * 构造一个平坦的 key-value 对象，key 是 `power:TIME:3600` 这种格式，value 是对应的功率值，
   * so downstream tasks can use {@link ActivityMetricsPreloaderService.ensurePeakMetric}
   * without hitting the DB.
   */
  buildPeakMetricsCachePatch(
    intervals: Record<string, number | undefined>,
    type: PeakType,
    scaleType: ScaleType,
  ): Partial<Record<PeakMetricKey, number>> {
    const patch: Partial<Record<PeakMetricKey, number>> = {};
    for (const [key, value] of Object.entries(intervals)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      let scaleValue = 0;
      if (scaleType === 'TIME') {
        scaleValue = this.parseIntervalKeyToSeconds(key);
      } else if (scaleType === 'DISTANCE') {
        scaleValue = parseInt(key, 10);
      }
      if (scaleValue > 0) {
        const pk = `${type}:${scaleType}:${scaleValue}` as PeakMetricKey;
        patch[pk] = value;
      }
    }
    return patch;
  }

  /**
   * 根据 intervals 构造一个有序的 {duration, value} 列表，duration 是秒数或者距离，value 是对应的功率值。
   * Same shape as {@link ActivityMetricsPreloaderService.ensurePeakMetricsList} loads from DB,
   * so `list:power:TIME` can be prefilled after MMP compute to skip a read.
   */
  buildDurationValueListFromIntervals(
    intervals: Record<string, number | undefined>,
    scaleType: ScaleType,
  ): Array<{ duration: number; value: number }> {
    const list: Array<{ duration: number; value: number }> = [];
    for (const [key, value] of Object.entries(intervals)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      let scaleValue = 0;
      if (scaleType === 'TIME') {
        scaleValue = this.parseIntervalKeyToSeconds(key);
      } else if (scaleType === 'DISTANCE') {
        scaleValue = parseInt(key, 10);
      }
      if (scaleValue > 0) {
        list.push({ duration: scaleValue, value });
      }
    }
    return list.sort((a, b) => a.duration - b.duration);
  }
}
