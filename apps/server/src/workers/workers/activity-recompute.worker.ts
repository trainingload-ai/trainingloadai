import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { ActivityRecomputeExecutorService } from '@/analyze/activity-recompute-executor.service';
import { Prisma, type SportType } from '@prisma/client';
import { WorkerDrainProgress } from '../worker-drain-progress';
import { randomUUID } from 'node:crypto';

type RecomputeMetricType =
  | 'LTHR'
  | 'MHR'
  | 'RHR'
  | 'FTP'
  | 'CP'
  | 'CS'
  | 'ZONE_HEART_RATE'
  | 'ZONE_POWER'
  | 'ZONE_PACE'
  | 'PROFILE'
  | 'ACTIVITY_INPUT'
  | 'DATA_REPAIR';

function backoffMs(attempts: number) {
  const base = 60_000;
  const max = 60 * 60_000;
  const pow = Math.min(10, Math.max(0, attempts));
  return Math.min(max, base * Math.pow(2, pow));
}

function checkpointEffectiveFrom(value: unknown): Date | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>).nextEffectiveFrom;
  if (typeof raw !== 'string') return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function includeActivityIds(value: unknown): number[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const raw = (value as Record<string, unknown>).includeActivityIds;
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(raw.filter((id): id is number => Number.isSafeInteger(id))),
  );
}

function stableReplayErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(message)
    ? message
    : 'ACTIVITY_RECOMPUTE_EXECUTION_FAILED';
}

function checkpointStats(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { hasCheckpoint: false, hasPendingPmc: false };
  }
  const checkpoint = value as Record<string, unknown>;
  return {
    hasCheckpoint: true,
    hasPendingPmc:
      typeof checkpoint.pendingPmcRecomputeFrom === 'string' &&
      checkpoint.pendingPmcRecomputeFrom.length > 0,
    nextEffectiveFrom:
      typeof checkpoint.nextEffectiveFrom === 'string'
        ? checkpoint.nextEffectiveFrom
        : null,
  };
}

/**
 * DB 驱动的活动复算 worker。
 * 设计上让 t_activity_recompute_job 成为唯一调度事实源，避免再出现进程内队列丢任务/多实例不可见的问题。
 */
@Injectable()
export class ActivityRecomputeWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ActivityRecomputeWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private stopping = false;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly recomputeExecutor: ActivityRecomputeExecutorService,
  ) {}

  private enabled() {
    return (
      this.configService.get<boolean>('activityRecomputeWorker.enabled') ?? true
    );
  }

  onModuleInit() {
    if (!this.enabled()) return;
    const pollMs =
      this.configService.get<number>('activityRecomputeWorker.pollMs') ?? 1000;
    this.timer = setInterval(() => {
      void this.drain().catch((e) => {
        this.logger.error(
          `[活动复算][消费] 拉取队列 失败：${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      });
    }, pollMs);
    void this.drain();
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async claimBatch(batchSize: number) {
    const now = new Date();
    const lockToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + 5 * 60_000);
    // 多实例 worker 可以并发部署；SKIP LOCKED 保证同一条 job 只会被一个实例领取。
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        metric_type: string;
        sport_type: SportType | null;
        recompute_from: Date;
        recompute_to: Date;
        lookback_days: number;
        priority: number;
        replay_checkpoint: unknown;
        trigger_payload: unknown;
        lock_token: string;
      }>
    >`
      WITH picked AS (
        SELECT id
        FROM t_activity_recompute_job
        WHERE (
          (status IN ('SCHEDULED','FAILED') AND available_at <= ${now})
          OR (
            status = 'RUNNING'
            AND (lease_expires_at IS NULL OR lease_expires_at <= ${now})
            AND NOT EXISTS (
              SELECT 1
              FROM t_activity_analysis_lease lease
              WHERE lease.source_job_type = 'ACTIVITY_RECOMPUTE'
                AND lease.source_job_id = t_activity_recompute_job.id
                AND lease.lease_expires_at > ${now}
            )
          )
        )
        ORDER BY priority DESC, available_at ASC, created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE t_activity_recompute_job j
      SET status='RUNNING',
          started_at=COALESCE(j.started_at, ${now}),
          completed_at=NULL,
          lock_token=${lockToken},
          lease_expires_at=${leaseExpiresAt},
          updated_at=${now}
      FROM picked
      WHERE j.id = picked.id
      RETURNING
        j.id,
        j.user_id,
        j.metric_type,
        j.sport_type,
        j.recompute_from,
        j.recompute_to,
        j.lookback_days,
        j.priority,
        j.replay_checkpoint,
        j.trigger_payload,
        j.lock_token;
      `;

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      metricType: r.metric_type as RecomputeMetricType,
      sportType: r.sport_type ?? undefined,
      recomputeFrom: r.recompute_from,
      recomputeTo: r.recompute_to,
      lookbackDays: r.lookback_days,
      priority: r.priority,
      replayCheckpoint: r.replay_checkpoint,
      includeActivityIds: includeActivityIds(r.trigger_payload),
      lockToken: r.lock_token,
    }));
  }

  private async processJob(job: {
    id: string;
    userId: string;
    metricType: RecomputeMetricType;
    sportType?: SportType;
    recomputeFrom: Date;
    recomputeTo: Date;
    lookbackDays: number;
    priority: number;
    replayCheckpoint: unknown;
    includeActivityIds: number[];
    lockToken: string;
  }) {
    const startedAt = Date.now();
    const heartbeat = setInterval(() => {
      void this.prisma.activityRecomputeJob.updateMany({
        where: {
          id: job.id,
          status: 'RUNNING',
          lockToken: job.lockToken,
        },
        data: { leaseExpiresAt: new Date(Date.now() + 5 * 60_000) },
      });
    }, 60_000);
    heartbeat.unref?.();
    try {
      this.logger.log(
        `[活动复算][消费] 开始 任务ID=${job.id} 用户ID=${job.userId} 类型=${job.metricType} 运动类型=${job.sportType ?? 'ALL'} 回溯天数=${job.lookbackDays}`,
      );
      const replayResult =
        await this.recomputeExecutor.executeMetricChangeRecompute({
          sourceJobId: job.id,
          userId: job.userId,
          metricType: job.metricType,
          sportType: job.sportType,
          effectiveFrom:
            checkpointEffectiveFrom(job.replayCheckpoint) ?? job.recomputeFrom,
          effectiveTo: job.recomputeTo,
          lookbackDays: job.lookbackDays,
          priority: job.priority,
          dataRepair: job.metricType === 'DATA_REPAIR',
          maxActivities: 100,
          includeActivityIds: job.includeActivityIds,
          sourceLockToken: job.lockToken,
        });
      if (!replayResult.completed && replayResult.nextCheckpoint) {
        const yielded = await this.prisma.activityRecomputeJob.updateMany({
          where: {
            id: job.id,
            status: 'RUNNING',
            lockToken: job.lockToken,
          },
          data: {
            status: 'SCHEDULED',
            availableAt: new Date(Date.now() + 1_000),
            lastError: null,
            lastErrorCode: null,
            failureStats: Prisma.DbNull,
            lockToken: null,
            leaseExpiresAt: null,
          },
        });
        if (yielded.count !== 1) {
          throw new Error('ACTIVITY_RECOMPUTE_JOB_FENCED');
        }
        this.logger.log(
          `[活动复算][消费] 已保存重放 checkpoint 并让出执行权 任务ID=${job.id} 已处理=${replayResult.processedActivities}`,
        );
        return;
      }
      const completed = await this.prisma.activityRecomputeJob.updateMany({
        where: {
          id: job.id,
          status: 'RUNNING',
          lockToken: job.lockToken,
        },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          lastError: null,
          lastErrorCode: null,
          failureStats: Prisma.DbNull,
          lockToken: null,
          leaseExpiresAt: null,
        },
      });
      if (completed.count !== 1) {
        throw new Error('ACTIVITY_RECOMPUTE_JOB_FENCED');
      }
      this.logger.log(
        `[活动复算][消费] 完成 任务ID=${job.id} 耗时=${Date.now() - startedAt}ms`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg === 'ACTIVITY_RECOMPUTE_JOB_FENCED' ||
        msg === 'ACTIVITY_REPLAY_SOURCE_JOB_FENCED'
      ) {
        this.logger.warn(
          `[活动复算][消费] 任务所有权已转移，丢弃旧 worker 结果 任务ID=${job.id}`,
        );
        return;
      }
      if (msg === 'ACTIVITY_ANALYSIS_CAPACITY_UNAVAILABLE') {
        await this.prisma.activityRecomputeJob.updateMany({
          where: {
            id: job.id,
            status: 'RUNNING',
            lockToken: job.lockToken,
          },
          data: {
            status: 'SCHEDULED',
            availableAt: new Date(Date.now() + 5_000),
            lastError: null,
            lastErrorCode: null,
            failureStats: Prisma.DbNull,
            lockToken: null,
            leaseExpiresAt: null,
          },
        });
        this.logger.log(
          `[活动复算][消费] 全局重放容量已满，任务让出且不计失败 任务ID=${job.id}`,
        );
        return;
      }
      const errorCode = stableReplayErrorCode(e);
      const failure = await this.prisma.$transaction(async (tx) => {
        const owned = await tx.activityRecomputeJob.findFirst({
          where: {
            id: job.id,
            status: 'RUNNING',
            lockToken: job.lockToken,
          },
          select: {
            attempts: true,
            maxAttempts: true,
            replayCheckpoint: true,
          },
        });
        if (!owned) return null;
        const attempts = owned.attempts + 1;
        const maxAttempts =
          owned.maxAttempts ??
          this.configService.get<number>(
            'activityRecomputeWorker.maxAttempts',
          ) ??
          3;
        const dead = attempts >= maxAttempts;
        const delay = backoffMs(attempts);
        const failureStats = {
          schemaVersion: 1,
          stage: 'CHRONOLOGICAL_REPLAY',
          errorCode,
          attempts,
          maxAttempts,
          metricType: job.metricType,
          durationMs: Date.now() - startedAt,
          includeActivityCount: job.includeActivityIds.length,
          ...checkpointStats(owned.replayCheckpoint),
        } satisfies Prisma.InputJsonObject;
        const updated = await tx.activityRecomputeJob.updateMany({
          where: {
            id: job.id,
            status: 'RUNNING',
            lockToken: job.lockToken,
          },
          data: {
            status: dead ? 'DEAD' : 'FAILED',
            attempts,
            lastError: msg,
            lastErrorCode: errorCode,
            failureStats,
            availableAt: new Date(Date.now() + delay),
            completedAt: dead ? new Date() : null,
            lockToken: null,
            leaseExpiresAt: null,
          },
        });
        return updated.count === 1
          ? { dead, attempts, maxAttempts, delay, failureStats }
          : null;
      });
      if (!failure) {
        this.logger.warn(
          `[活动复算][消费] 失败结果未写入：任务所有权已转移 任务ID=${job.id}`,
        );
        return;
      }
      if (failure.dead) {
        const alert = {
          event: 'ACTIVITY_RECOMPUTE_JOB_DEAD',
          severity: 'ERROR',
          jobId: job.id,
          userId: job.userId,
          errorCode,
          stats: failure.failureStats,
        };
        this.logger.error(`[活动复算][运营告警] ${JSON.stringify(alert)}`);
        return;
      }
      this.logger.warn(
        `[活动复算][消费] 任务失败待重试 任务ID=${job.id} 错误码=${errorCode} 重试次数=${failure.attempts} 重试延迟毫秒=${failure.delay} 错误=${msg}`,
      );
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async drain() {
    if (this.stopping || this.draining) return;
    this.draining = true;
    const batchSize =
      this.configService.get<number>('activityRecomputeWorker.batchSize') ?? 5;
    const concurrency =
      this.configService.get<number>('activityRecomputeWorker.concurrency') ??
      1;
    const progress = new WorkerDrainProgress(
      this.logger,
      '活动复算队列',
      async () => ({
        remaining: await this.prisma.activityRecomputeJob.count({
          where: {
            status: { in: ['SCHEDULED', 'FAILED', 'RUNNING'] },
          },
        }),
      }),
    );

    try {
      while (!this.stopping) {
        const batch = await this.claimBatch(batchSize);
        if (!batch.length) return;

        let idx = 0;
        const runners = Array.from(
          { length: Math.min(concurrency, batch.length) },
          async () => {
            while (idx < batch.length && !this.stopping) {
              const job = batch[idx]!;
              const batchPosition = idx + 1;
              idx += 1;
              await progress.run({
                batchPosition,
                batchTotal: batch.length,
                details: `任务ID=${job.id} 用户ID=${job.userId} 类型=${job.metricType}`,
                task: () => this.processJob(job),
              });
            }
          },
        );
        await Promise.all(runners);
      }
    } finally {
      this.draining = false;
    }
  }
}
