import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { ActivityRecomputeExecutorService } from '@/analyze/activity-recompute-executor.service';
import type { SportType } from '@prisma/client';
import { WorkerDrainProgress } from '../worker-drain-progress';

type RecomputeMetricType =
  | 'LTHR'
  | 'MHR'
  | 'RHR'
  | 'FTP'
  | 'CP'
  | 'CS'
  | 'ZONE_HEART_RATE'
  | 'ZONE_POWER'
  | 'ZONE_PACE';

function backoffMs(attempts: number) {
  const base = 60_000;
  const max = 60 * 60_000;
  const pow = Math.min(10, Math.max(0, attempts));
  return Math.min(max, base * Math.pow(2, pow));
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
      }>
    >`
      WITH picked AS (
        SELECT id
        FROM t_activity_recompute_job
        WHERE status IN ('SCHEDULED','FAILED')
          AND available_at <= ${now}
        ORDER BY available_at ASC, created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE t_activity_recompute_job j
      SET status='RUNNING',
          started_at=COALESCE(j.started_at, NOW()),
          completed_at=NULL,
          updated_at=NOW()
      FROM picked
      WHERE j.id = picked.id
      RETURNING
        j.id,
        j.user_id,
        j.metric_type,
        j.sport_type,
        j.recompute_from,
        j.recompute_to,
        j.lookback_days;
      `;

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      metricType: r.metric_type as RecomputeMetricType,
      sportType: r.sport_type ?? undefined,
      recomputeFrom: r.recompute_from,
      recomputeTo: r.recompute_to,
      lookbackDays: r.lookback_days,
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
  }) {
    const startedAt = Date.now();
    try {
      this.logger.log(
        `[活动复算][消费] 开始 任务ID=${job.id} 用户ID=${job.userId} 类型=${job.metricType} 运动类型=${job.sportType ?? 'ALL'} 回溯天数=${job.lookbackDays}`,
      );
      await this.recomputeExecutor.executeMetricChangeRecompute({
        userId: job.userId,
        metricType: job.metricType,
        sportType: job.sportType,
        effectiveFrom: job.recomputeFrom,
        effectiveTo: job.recomputeTo,
        lookbackDays: job.lookbackDays,
      });
      await this.prisma.activityRecomputeJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          lastError: null,
        },
      });
      this.logger.log(
        `[活动复算][消费] 完成 任务ID=${job.id} 耗时=${Date.now() - startedAt}ms`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const row = await this.prisma.activityRecomputeJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          lastError: msg,
        },
        select: { attempts: true, maxAttempts: true },
      });
      const attempts = row.attempts ?? 0;
      const maxAttempts =
        row.maxAttempts ??
        this.configService.get<number>('activityRecomputeWorker.maxAttempts') ??
        3;
      if (attempts >= maxAttempts) {
        await this.prisma.activityRecomputeJob.update({
          where: { id: job.id },
          data: {
            status: 'DEAD',
            completedAt: new Date(),
          },
        });
        this.logger.error(
          `[活动复算][消费] 任务进入 DEAD 任务ID=${job.id} 错误=${msg}`,
        );
        return;
      }
      const delay = backoffMs(attempts);
      await this.prisma.activityRecomputeJob.update({
        where: { id: job.id },
        data: { availableAt: new Date(Date.now() + delay) },
      });
      this.logger.warn(
        `[活动复算][消费] 任务失败待重试 任务ID=${job.id} 重试次数=${attempts} 重试延迟毫秒=${delay} 错误=${msg}`,
      );
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
