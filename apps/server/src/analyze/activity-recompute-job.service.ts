import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import {
  Prisma,
  SportType,
  UserFitnessMetricType,
} from '@prisma/client';
import { UserService } from '@/api/user/user.service';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

export type FitnessMetricRecomputeType =
  | 'LTHR'
  | 'MHR'
  | 'RHR'
  | 'FTP'
  | 'CP'
  | 'CS';

type ScheduleFitnessMetricChangeArgs = {
  userId: string;
  metricType: FitnessMetricRecomputeType;
  originalType: UserFitnessMetricType;
  sportType?: SportType;
  changedTimes: number[];
};

/**
 * 活动复算任务调度器。
 * 这里只负责“要不要创建 DB job、什么时候可执行、如何去重”，真正复算由 worker 调用 orchestrator 完成。
 */
@Injectable()
export class ActivityRecomputeJobService {
  private readonly logger = new Logger(ActivityRecomputeJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {}

  /**
   * 只有会改变历史活动分析结果的基准指标才会触发复算。
   */
  mapFitnessMetricTypeToRecomputeType(
    type: UserFitnessMetricType,
  ): FitnessMetricRecomputeType | null {
    if (type === UserFitnessMetricType.LTHR) return 'LTHR';
    if (type === UserFitnessMetricType.MAX_HR) return 'MHR';
    if (type === UserFitnessMetricType.RESTING_HR) return 'RHR';
    if (type === UserFitnessMetricType.FTP) return 'FTP';
    if (type === UserFitnessMetricType.CP) return 'CP';
    if (type === UserFitnessMetricType.CS) return 'CS';
    return null;
  }

  private affectedPipelines(metricType: FitnessMetricRecomputeType) {
    switch (metricType) {
      case 'LTHR':
      case 'MHR':
      case 'RHR':
        return [
          'HEART_RATE_ANALYSIS',
          'TRAINING_EFFECT',
          'VO2MAX',
          'FITNESS_SNAPSHOT',
        ];
      case 'FTP':
      case 'CP':
        return ['POWER_ANALYSIS', 'TRAINING_LOAD', 'FITNESS_SNAPSHOT'];
      case 'CS':
        return ['PACE_ANALYSIS', 'VO2MAX', 'FITNESS_SNAPSHOT'];
      default:
        return ['FITNESS_SNAPSHOT'];
    }
  }

  private defaultTimezone() {
    return (
      this.configService.get<string>(
        'activityRecomputePolicy.defaultTimezone',
      ) ?? 'Asia/Shanghai'
    );
  }

  private normalizeTimezone(value?: string | null) {
    const candidate = value?.trim() || this.defaultTimezone();
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
      return candidate;
    } catch {
      return this.defaultTimezone();
    }
  }

  private async getUserTimezone(userId: string) {
    const preferred = await this.userService.getPreferredTimezone(userId);
    return this.normalizeTimezone(preferred);
  }

  private nextNightlyAvailableAt(now: Date, timezoneName: string) {
    const hour =
      this.configService.get<number>(
        'activityRecomputePolicy.nightlyStartHour',
      ) ?? 2;
    const jitterMax =
      this.configService.get<number>(
        'activityRecomputePolicy.nightlyJitterMinutes',
      ) ?? 60;
    const jitterMinutes =
      jitterMax > 0 ? Math.floor(Math.random() * (jitterMax + 1)) : 0;

    const localNow = dayjs(now).tz(timezoneName);
    let target = localNow
      .hour(hour)
      .minute(0)
      .second(0)
      .millisecond(0)
      .add(jitterMinutes, 'minute');
    if (!target.isAfter(localNow)) {
      target = target.add(1, 'day');
    }
    return target.utc().toDate();
  }

  async scheduleFitnessMetricChangeRecompute(
    args: ScheduleFitnessMetricChangeArgs,
  ) {
    if (args.changedTimes.length === 0) {
      return { scheduled: false, reason: 'no_changes' as const };
    }

    const policy = await this.userService.getActivityRecomputePolicyForUser(
      args.userId,
    );
    const lookbackDays = policy.lookbackDays;
    const now = new Date();
    const recomputeFrom = dayjs(now).subtract(lookbackDays, 'day').toDate();
    const recomputeTo = now;
    const windowFromMs = recomputeFrom.getTime();
    const windowToMs = recomputeTo.getTime();
    const hasChangeInWindow = args.changedTimes.some(
      (t) => t >= windowFromMs && t <= windowToMs,
    );
    if (!hasChangeInWindow) {
      return {
        scheduled: false,
        reason: 'change_outside_window' as const,
        lookbackDays,
      };
    }

    const timezoneName = await this.getUserTimezone(args.userId);
    const availableAt = this.nextNightlyAvailableAt(now, timezoneName);
    const scheduledLocalDay = dayjs(availableAt)
      .tz(timezoneName)
      .format('YYYY-MM-DD');
    const sport = args.sportType ?? 'ALL';
    const dedupeKey = [
      'fitness-metric',
      args.userId,
      args.metricType,
      sport,
      scheduledLocalDay,
    ].join(':');

    const payload = {
      originalType: args.originalType,
      changedDates: args.changedTimes
        .sort((a, b) => a - b)
        .map((t) => dayjs(t).format('YYYY-MM-DD')),
      timezone: timezoneName,
      entitlement: policy.entitlement,
    };

    const existing = await this.prisma.activityRecomputeJob.findUnique({
      where: { dedupeKey },
      select: { id: true, status: true },
    });
    if (existing?.status === 'RUNNING') {
      this.logger.log(
        `[活动复算] 已有运行中任务，跳过重置：任务ID=${existing.id}, key=${dedupeKey}`,
      );
      return { scheduled: false, reason: 'already_running' as const };
    }

    const data = {
      userId: args.userId,
      reason: 'FITNESS_METRIC_CHANGED',
      metricType: args.metricType,
      sportType: args.sportType,
      affectedPipelines: this.affectedPipelines(args.metricType),
      recomputeFrom,
      recomputeTo,
      lookbackDays,
      status: 'SCHEDULED' as const,
      availableAt,
      attempts: 0,
      maxAttempts:
        this.configService.get<number>('activityRecomputeWorker.maxAttempts') ??
        3,
      lastError: null,
      triggerSource: 'manual_fitness_metric',
      triggerPayload: payload,
      startedAt: null,
      completedAt: null,
    };

    let job;
    if (existing) {
      job = await this.prisma.activityRecomputeJob.update({
        where: { id: existing.id },
        data,
      });
    } else {
      try {
        job = await this.prisma.activityRecomputeJob.create({
          data: {
            ...data,
            dedupeKey,
          },
        });
      } catch (e) {
        // 并发下可能出现“先查为空，后续 create 撞上唯一键”。
        // 这里回查并复用已存在任务，保证调度端幂等。
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          const concurrent = await this.prisma.activityRecomputeJob.findUnique({
            where: { dedupeKey },
            select: { id: true, status: true },
          });
          if (!concurrent) throw e;
          if (concurrent.status === 'RUNNING') {
            this.logger.log(
              `[活动复算] 并发命中运行中任务，跳过重置：任务ID=${concurrent.id}, key=${dedupeKey}`,
            );
            return {
              scheduled: false,
              reason: 'already_running' as const,
            };
          }
          job = await this.prisma.activityRecomputeJob.update({
            where: { id: concurrent.id },
            data,
          });
        } else {
          throw e;
        }
      }
    }

    this.logger.log(
      `[活动复算] 已创建夜间任务：任务ID=${job.id}, 用户ID=${args.userId}, 类型=${args.metricType}, 运动类型=${sport}, 回溯天数=${lookbackDays}, availableAt=${availableAt.toISOString()}`,
    );
    return { scheduled: true, job };
  }
}
