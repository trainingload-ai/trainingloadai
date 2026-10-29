import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { CronJob } from 'cron';
import { PrismaService } from '@/prisma/prisma.service';
import { DEFAULT_REVIEW_SEND_AT_LOCAL_TIME } from './review-schedule.constants';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import {
  FEATURE_ACCESS_POLICY,
  type FeatureAccessPolicy,
} from '@/access/feature-access-policy.port';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class ReviewCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewCronService.name);
  private jobs: CronJob[] = [];
  private unsubscribeCapabilityChange?: () => void;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FEATURE_ACCESS_POLICY)
    private readonly featureAccess: FeatureAccessPolicy,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  onModuleInit() {
    this.unsubscribeCapabilityChange = this.capabilities?.onChange?.(() =>
      this.reconcileJobs(),
    );
    this.reconcileJobs();
  }

  onModuleDestroy() {
    this.unsubscribeCapabilityChange?.();
    this.stopJobs();
  }

  private reconcileJobs() {
    if (!this.enabled()) {
      this.stopJobs();
      return;
    }
    if (this.jobs.length > 0) return;
    try {
      this.jobs = [
        CronJob.from({
          cronTime: process.env.REVIEW_CRON_DAILY_CRON || '0 * * * *',
          onTick: () => void this.tickDaily(),
          start: true,
        }),
        CronJob.from({
          cronTime: process.env.REVIEW_CRON_WEEKLY_CRON || '0 * * * *',
          onTick: () => void this.tickWeekly(),
          start: true,
        }),
        CronJob.from({
          cronTime: process.env.REVIEW_CRON_MONTHLY_CRON || '0 * * * *',
          onTick: () => void this.tickMonthly(),
          start: true,
        }),
      ];
    } catch (error) {
      this.stopJobs();
      this.logger.error(
        `[复盘][cron] 注册失败 error=${this.errorMessage(error)}`,
      );
    }
  }

  private stopJobs() {
    for (const job of this.jobs) job.stop();
    this.jobs = [];
  }

  private enabled() {
    return (
      this.capabilities?.isEnabled('ai') !== false &&
      (process.env.REVIEW_CRON_ENABLED ?? 'true') === 'true'
    );
  }

  private debugEnabled() {
    return process.env.REVIEW_CRON_DEBUG === 'true';
  }

  /**
   * 候选人和调试漏斗共用同一套 CTE，避免发送时刻的逻辑漂移。
   * AI_PLAN 只是可失效的兼容投影，不得作为排他的入队门槛。
   */
  private enqueueCteSql(args: {
    type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    extraDueWhereSql: string;
  }) {
    const { type, extraDueWhereSql } = args;
    return `
      WITH tz AS (
        SELECT DISTINCT ON (m.user_id)
          m.user_id,
          m.value_text AS timezone
        FROM t_user_body_metric m
        WHERE m.type = 'TIMEZONE'
        ORDER BY m.user_id, m.created_at DESC
      ),
      schedule AS (
        SELECT
          u.id AS user_id,
          COALESCE(s.enabled, TRUE) AS enabled,
          COALESCE(s.send_at_local_time, '${DEFAULT_REVIEW_SEND_AT_LOCAL_TIME}') AS send_at_local_time
        FROM t_user u
        LEFT JOIN t_review_schedule s
          ON s.user_id = u.id
         AND s.type = '${type}'
      ),
      expanded AS (
        SELECT
          sch.user_id,
          sch.enabled,
          sch.send_at_local_time,
          COALESCE(tz.timezone, 'UTC') AS timezone
        FROM schedule sch
        LEFT JOIN tz ON tz.user_id = sch.user_id
      ),
      due AS (
        SELECT
          e.user_id,
          e.timezone,
          date_trunc('day', (NOW() AT TIME ZONE e.timezone)) AT TIME ZONE e.timezone AS period_end
        FROM expanded e
        WHERE e.enabled = TRUE
          AND split_part(e.send_at_local_time, ':', 1)::int = EXTRACT(HOUR FROM (NOW() AT TIME ZONE e.timezone))::int
          ${extraDueWhereSql}
      ),
      windows AS (
        SELECT
          d.user_id,
          (CASE
            WHEN '${type}' = 'DAILY' THEN d.period_end - INTERVAL '1 day'
            WHEN '${type}' = 'WEEKLY' THEN d.period_end - INTERVAL '7 days'
            ELSE d.period_end - INTERVAL '30 days'
          END) AS period_start,
          d.period_end AS period_end
        FROM due d
      )`;
  }

  private async enqueueByType(args: {
    type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    extraDueWhereSql: string;
    logLabel: string;
  }) {
    if (!this.enabled()) {
      this.logger.debug(
        `[复盘][入队] ${args.logLabel} 跳过（REVIEW_CRON_ENABLED!=true）`,
      );
      return;
    }

    const { type, logLabel } = args;
    const cte = this.enqueueCteSql(args);

    this.logger.debug(
      `[复盘][入队] ${logLabel} 开始扫描 type=${type} REVIEW_CRON_DEBUG=${this.debugEnabled()}`,
    );

    if (this.debugEnabled()) {
      const dbNow = await this.dbNowIso();
      this.logger.debug(`[复盘][入队] ${logLabel} DB NOW()=${dbNow}`);
      const funnel = await this.prisma.$queryRawUnsafe<
        {
          due_count: bigint;
          window_count: bigint;
          expanded_user_count: bigint;
        }[]
      >(
        `${cte}
        SELECT
          (SELECT count(*)::bigint FROM expanded) AS expanded_user_count,
          (SELECT count(*)::bigint FROM due) AS due_count,
          (SELECT count(*)::bigint FROM windows) AS window_count;`,
      );
      const row = funnel[0];
      this.logger.debug(
        `[复盘][入队] ${logLabel} 漏斗 expanded_users=${row?.expanded_user_count ?? 'n/a'} due=${row?.due_count ?? 'n/a'} windows=${row?.window_count ?? 'n/a'}（windows 为粗筛候选，功能权限数见完成日志）`,
      );
    }

    /**
     * - DB 一次性计算用户本地时间与窗口。
     * - 对候选用户做有界并发的功能权限解析；解析失败时 fail closed。
     * - 入队幂等由 ReviewJob 唯一约束和 skipDuplicates 保证。
     */
    const candidates = await this.prisma.$queryRawUnsafe<
      Array<{
        user_id: string;
        period_start: Date;
        period_end: Date;
        entitlement_at: Date;
      }>
    >(`${cte}
      SELECT
        w.user_id,
        w.period_start,
        w.period_end,
        transaction_timestamp() AS entitlement_at
      FROM windows w;
    `);
    const eligible: typeof candidates = [];
    const resolverConcurrency = 20;
    for (
      let offset = 0;
      offset < candidates.length;
      offset += resolverConcurrency
    ) {
      const batch = candidates.slice(offset, offset + resolverConcurrency);
      const decisions = await Promise.all(
        batch.map(async (candidate) => {
          try {
            const access = await this.featureAccess.evaluate(
              candidate.user_id,
              ['ai.periodReview'],
              candidate.entitlement_at,
            );
            return access.features['ai.periodReview'].allowed
              ? candidate
              : null;
          } catch (error) {
            this.logger.error(
              `[复盘][入队] 功能权限解析失败，fail closed userId=${candidate.user_id} error=${this.errorMessage(error)}`,
            );
            return null;
          }
        }),
      );
      eligible.push(...decisions.filter((row) => row !== null));
    }

    let inserted = 0;
    const insertBatchSize = 1_000;
    for (let offset = 0; offset < eligible.length; offset += insertBatchSize) {
      const batch = eligible.slice(offset, offset + insertBatchSize);
      inserted += (
        await this.prisma.reviewJob.createMany({
          data: batch.map((candidate) => ({
            userId: candidate.user_id,
            type,
            periodStart: candidate.period_start,
            periodEnd: candidate.period_end,
          })),
          skipDuplicates: true,
        })
      ).count;
    }

    this.logger.log(
      `[复盘][入队] ${logLabel} 扫描完成，候选=${candidates.length} 已授权=${eligible.length} 入队条数=${inserted}`,
    );
    this.logger.debug(
      `[复盘][入队] ${logLabel} 结束 inserted=${inserted} type=${type}`,
    );
  }

  /** 与 DB NOW() 对齐的参考时间（便于对照小时条件） */
  private async dbNowIso(): Promise<string> {
    const rows =
      await this.prisma.$queryRawUnsafe<{ n: Date }[]>(`SELECT NOW() AS n`);
    const d = rows[0]?.n;
    return d instanceof Date ? d.toISOString() : String(d ?? 'unknown');
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** 日复盘：每天到点触发（小时级扫描） */
  async tickDaily(): Promise<void> {
    this.logger.debug('[复盘][cron] tickDaily');
    await this.enqueueByType({
      type: 'DAILY',
      extraDueWhereSql: '',
      logLabel: '日复盘',
    });
  }

  /** 周复盘：仅在用户本地周一到点触发（ISO 周一=1） */
  async tickWeekly(): Promise<void> {
    this.logger.debug('[复盘][cron] tickWeekly');
    await this.enqueueByType({
      type: 'WEEKLY',
      extraDueWhereSql:
        'AND EXTRACT(ISODOW FROM (NOW() AT TIME ZONE e.timezone))::int = 1',
      logLabel: '周复盘',
    });
  }

  /** 月复盘：仅在用户本地每月 1 号到点触发 */
  async tickMonthly(): Promise<void> {
    this.logger.debug('[复盘][cron] tickMonthly');
    await this.enqueueByType({
      type: 'MONTHLY',
      extraDueWhereSql:
        'AND EXTRACT(DAY FROM (NOW() AT TIME ZONE e.timezone))::int = 1',
      logLabel: '月复盘',
    });
  }
}
