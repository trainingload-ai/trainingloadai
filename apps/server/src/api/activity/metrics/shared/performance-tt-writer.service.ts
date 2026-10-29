import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { Activity, ScaleType, SportType } from '@prisma/client';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import type { PeakIntervalObservation } from '../context';

@Injectable()
export class ActivityPerformanceTTWriterService {
  private readonly logger = new Logger(ActivityPerformanceTTWriterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async replaceTT(args: {
    activity: Activity;
    entries: Record<string, number | undefined>;
    targetScaleType: ScaleType;
    windows?: Record<string, PeakIntervalObservation | undefined>;
  }) {
    const { activity, entries, targetScaleType, windows } = args;
    try {
      const calculatedAt =
        activity.startTime ?? activity.timestamp ?? new Date();
      const data: Prisma.ActivityPerformanceTTCreateManyInput[] = [];

      for (const [key, val] of Object.entries(entries)) {
        if (typeof val !== 'number' || !Number.isFinite(val)) continue;
        const window = windows?.[key];
        const boundaries = {
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
        };
        let targetScaleValue = 0;
        if (targetScaleType === 'TIME') {
          targetScaleValue = this.parseDurationString(key);
          if (targetScaleValue > 0) {
            data.push({
              activityId: activity.id,
              sport: (activity.sportType ?? 'UNKNOWN') as SportType,
              targetScaleType,
              targetScaleValue,
              resultDistanceM: val,
              ...boundaries,
              calculatedAt,
            });
          }
        } else if (targetScaleType === 'DISTANCE') {
          targetScaleValue = parseInt(key, 10);
          if (targetScaleValue > 0) {
            data.push({
              activityId: activity.id,
              sport: (activity.sportType ?? 'UNKNOWN') as SportType,
              targetScaleType,
              targetScaleValue,
              resultTimeSec: val,
              ...boundaries,
              calculatedAt,
            });
          }
        }
      }

      await this.prisma.activityPerformanceTT.deleteMany({
        where: { activityId: activity.id, targetScaleType },
      });
      if (data.length > 0) {
        await this.prisma.activityPerformanceTT.createMany({
          data,
          skipDuplicates: true,
        });
      }
    } catch (e) {
      this.logger.error(
        `[replaceTT] 替换 TT 成绩失败：${e instanceof Error ? e.message : String(e)}`,
      );
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'internal server error',
      });
    }
  }

  private parseDurationString(duration: string): number {
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
        `[parseDurationString] 解析时长字符串失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return 0;
    }
  }
}
