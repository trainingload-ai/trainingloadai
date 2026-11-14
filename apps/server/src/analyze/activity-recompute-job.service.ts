import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma, SportType, UserFitnessMetricType } from '@prisma/client';
import { UserService } from '@/api/user/user.service';
import { withSerializableRetry } from '@/prisma/prisma-transaction-errors';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import {
  createActivityInputReplayJob,
  type ActivityInputReplayJobInput,
} from './activity-recompute-job.writer';

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

export type FitnessContextRecomputeType =
  | 'ZONE_HEART_RATE'
  | 'ZONE_POWER'
  | 'ZONE_PACE'
  | 'PROFILE';

type ScheduleContextChangeArgs = {
  userId: string;
  contextType: FitnessContextRecomputeType;
  sportType?: SportType;
  changedTimes: number[];
  triggerPayload?: Record<string, unknown>;
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

  scheduleActivityInputReplay(input: ActivityInputReplayJobInput) {
    return this.prisma.$transaction((tx) =>
      createActivityInputReplayJob(tx, input),
    );
  }

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

  private async upsertScheduledJob(
    data: Prisma.ActivityRecomputeJobUncheckedCreateInput,
  ) {
    return withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          let dedupeKey = data.dedupeKey;
          while (true) {
            // Seed the row without aborting this transaction on a dedupe race.
            // Only this unique constraint is ignored; other failures still escape.
            // Raw Date parameters are timestamptz; these columns store UTC timestamps.
            await tx.$executeRaw`
              INSERT INTO t_activity_recompute_job
                (id, user_id, metric_type, recompute_from, recompute_to,
                 lookback_days, available_at, dedupe_key, created_at, updated_at)
              VALUES (${randomUUID()}, ${data.userId}, ${data.metricType},
                (${data.recomputeFrom}::timestamptz AT TIME ZONE 'UTC'),
                (${data.recomputeTo}::timestamptz AT TIME ZONE 'UTC'),
                ${data.lookbackDays},
                (${data.availableAt}::timestamptz AT TIME ZONE 'UTC'),
                ${dedupeKey}, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
              ON CONFLICT (dedupe_key) DO NOTHING
            `;
            // The worker claims this same row with FOR UPDATE SKIP LOCKED.
            // Read Committed sees the latest status and range after any lock wait.
            const [current] = await tx.$queryRaw<
              Array<{
                id: string;
                status: string;
                recomputeFrom: Date;
                recomputeTo: Date;
              }>
            >`
              SELECT id, status::text AS status,
                recompute_from AS "recomputeFrom", recompute_to AS "recomputeTo"
              FROM t_activity_recompute_job
              WHERE dedupe_key = ${dedupeKey}
              FOR UPDATE
            `;
            // A concurrent cleanup may remove an existing row before we lock it.
            if (!current) continue;
            if (current.status === 'RUNNING') {
              dedupeKey += ':followup';
              continue;
            }
            const job = await tx.activityRecomputeJob.update({
              where: { id: current.id },
              data: {
                ...data,
                dedupeKey,
                recomputeFrom:
                  current.recomputeFrom < data.recomputeFrom
                    ? current.recomputeFrom
                    : data.recomputeFrom,
                recomputeTo:
                  current.recomputeTo > data.recomputeTo
                    ? current.recomputeTo
                    : data.recomputeTo,
              },
            });
            return { scheduled: true as const, job };
          }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 10_000,
          timeout: 10_000,
        },
      ),
    );
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
    // 套餐 lookback 只保留为主动增强能力与审计信息。已接受的 MANUAL
    // 指标变更必须从其真实生效时刻重放，否则会制造同一用户时间线不一致。
    const recomputeFrom = new Date(Math.min(...args.changedTimes));
    // Cross-metric projections can propagate past a later same-type MANUAL
    // point (for example MAX_HR affects VO2Max and load). Scan the complete
    // suffix; dependency fingerprints prevent unnecessary Parquet reads.
    const recomputeTo = now;

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
      schemaVersion: 1,
      originalType: args.originalType,
      changedInstants: args.changedTimes
        .sort((a, b) => a - b)
        .map((t) => new Date(t).toISOString()),
      timezone: timezoneName,
      entitlement: policy.entitlement,
    };

    const data: Prisma.ActivityRecomputeJobUncheckedCreateInput = {
      dedupeKey,
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
      priority: 100,
      replayCheckpoint: Prisma.DbNull,
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

    const result = await this.upsertScheduledJob(data);
    if (!result.scheduled) return result;
    const job = result.job;

    this.logger.log(
      `[活动复算] 已创建夜间任务：任务ID=${job.id}, 用户ID=${args.userId}, 类型=${args.metricType}, 运动类型=${sport}, 回溯天数=${lookbackDays}, availableAt=${availableAt.toISOString()}`,
    );
    return { scheduled: true, job };
  }

  async scheduleContextChangeRecompute(args: ScheduleContextChangeArgs) {
    const changedTimes = args.changedTimes.filter(Number.isFinite);
    if (changedTimes.length === 0) {
      return { scheduled: false, reason: 'no_changes' as const };
    }
    const policy = await this.userService.getActivityRecomputePolicyForUser(
      args.userId,
    );
    const now = new Date();
    const timezoneName = await this.getUserTimezone(args.userId);
    const availableAt = this.nextNightlyAvailableAt(now, timezoneName);
    const scheduledLocalDay = dayjs(availableAt)
      .tz(timezoneName)
      .format('YYYY-MM-DD');
    const sport = args.sportType ?? 'ALL';
    const dedupeKey = [
      'fitness-context',
      args.userId,
      args.contextType,
      sport,
      scheduledLocalDay,
    ].join(':');
    const zonePipelines: Record<
      Exclude<FitnessContextRecomputeType, 'PROFILE'>,
      string[]
    > = {
      ZONE_HEART_RATE: ['HEART_RATE_ANALYSIS', 'FITNESS_SNAPSHOT'],
      ZONE_POWER: ['POWER_ANALYSIS', 'TRAINING_LOAD', 'FITNESS_SNAPSHOT'],
      ZONE_PACE: ['PACE_ANALYSIS', 'FITNESS_SNAPSHOT'],
    };
    const affectedPipelines =
      args.contextType === 'PROFILE'
        ? [
            'PROFILE',
            'HEART_RATE_ANALYSIS',
            'TRAINING_LOAD',
            'FITNESS_SNAPSHOT',
          ]
        : zonePipelines[args.contextType];
    const data: Prisma.ActivityRecomputeJobUncheckedCreateInput = {
      dedupeKey,
      userId: args.userId,
      reason: 'FITNESS_CONTEXT_CHANGED',
      metricType: args.contextType,
      sportType: args.sportType,
      affectedPipelines,
      recomputeFrom: new Date(Math.min(...changedTimes)),
      recomputeTo: now,
      lookbackDays: policy.lookbackDays,
      status: 'SCHEDULED',
      availableAt,
      priority: 100,
      replayCheckpoint: Prisma.DbNull,
      attempts: 0,
      maxAttempts:
        this.configService.get<number>('activityRecomputeWorker.maxAttempts') ??
        3,
      lastError: null,
      triggerSource: 'fitness_context_change',
      triggerPayload: {
        changedInstants: changedTimes
          .sort((left, right) => left - right)
          .map((value) => new Date(value).toISOString()),
        timezone: timezoneName,
        entitlement: policy.entitlement,
        ...(args.triggerPayload ?? {}),
        schemaVersion: 1,
      } as Prisma.InputJsonValue,
      startedAt: null,
      completedAt: null,
    };
    const result = await this.upsertScheduledJob(data);
    if (result.scheduled) {
      this.logger.log(
        `[活动复算] 已创建上下文变更任务：任务ID=${result.job.id}, 用户ID=${args.userId}, 类型=${args.contextType}, 运动类型=${sport}`,
      );
    }
    return result;
  }
}
