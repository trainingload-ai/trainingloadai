import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { $Enums } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/api/ai/ai.service';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { RuntimeJobSupervisor } from '@/runtime-capabilities/runtime-job-supervisor.service';

function backoffMs(attempts: number) {
  const base = 60_000;
  const max = 60 * 60_000;
  const pow = Math.min(10, Math.max(0, attempts));
  return Math.min(max, base * Math.pow(2, pow));
}

@Injectable()
export class ActivityAiReviewWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ActivityAiReviewWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private unregister: (() => void) | null = null;
  private stopping = false;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly ai: AiService,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
    private readonly jobSupervisor?: RuntimeJobSupervisor,
  ) {}

  private enabled() {
    return (
      ((this.capabilities?.isEnabled('ai') ?? true) &&
        this.configService.get<boolean>('activityAiReviewWorker.enabled')) ??
      true
    );
  }

  onModuleInit() {
    this.unregister =
      this.jobSupervisor?.register({
        id: 'ai.activity-review',
        enabled: () => this.enabled(),
        start: () => this.start(),
        stop: () => this.stop(),
      }) ?? null;
    if (!this.jobSupervisor && this.enabled()) this.start();
  }

  private start() {
    if (this.timer) return;
    const pollMs =
      this.configService.get<number>('activityAiReviewWorker.pollMs') ?? 1000;
    this.timer = setInterval(() => {
      void this.drain().catch((e) => {
        this.logger.error(
          `[活动AI复盘队列][编排] 拉取队列失败：${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      });
    }, pollMs);
    void this.drain();
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  onModuleDestroy() {
    this.stopping = true;
    this.unregister?.();
    this.unregister = null;
    this.stop();
  }

  private async claimBatch(batchSize: number) {
    const now = new Date();
    const lockTimeoutMs =
      this.configService.get<number>('activityAiReviewWorker.lockTimeoutMs') ??
      15 * 60_000;
    const staleBefore = new Date(now.getTime() - lockTimeoutMs);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        activity_id: number;
        user_id: string;
      }>
    >`
      WITH picked AS (
        SELECT id
        FROM t_activity_ai_review
        WHERE (
            status IN ('PENDING','FAILED')
            OR (
              status = 'RUNNING'
              AND locked_at IS NOT NULL
              AND locked_at <= ${staleBefore}
            )
          )
          AND available_at <= ${now}
        ORDER BY available_at ASC, created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE t_activity_ai_review r
      SET status='RUNNING',
          locked_at=NOW(),
          started_at=COALESCE(r.started_at, NOW()),
          finished_at=NULL,
          failed_at=NULL,
          updated_at=NOW()
      FROM picked
      WHERE r.id = picked.id
      RETURNING r.id, r.activity_id, r.user_id;
    `;

    return rows.map((r) => ({
      id: r.id,
      activityId: r.activity_id,
      userId: r.user_id,
    }));
  }

  private async readQueueSnapshot() {
    try {
      const [waiting, running] = await Promise.all([
        this.prisma.activityAiReview.count({
          where: {
            status: {
              in: [
                $Enums.ActivityAiReviewStatus.PENDING,
                $Enums.ActivityAiReviewStatus.FAILED,
              ],
            },
          },
        }),
        this.prisma.activityAiReview.count({
          where: {
            status: $Enums.ActivityAiReviewStatus.RUNNING,
          },
        }),
      ]);
      return {
        waiting,
        running,
        remaining: waiting + running,
      };
    } catch (e) {
      this.logger.warn(
        `[活动AI复盘队列][编排] 读取进度失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return null;
    }
  }

  private formatQueueSnapshot(
    snapshot: Awaited<ReturnType<typeof this.readQueueSnapshot>>,
    includesCurrent: boolean,
  ) {
    if (!snapshot) return ' 队列剩余=未知';
    return ` 队列剩余=${snapshot.remaining}（等待=${snapshot.waiting}，处理中=${snapshot.running}${
      includesCurrent ? '，含当前任务' : ''
    }）`;
  }

  private async executeJob(job: {
    id: string;
    activityId: number;
    userId: string;
  }) {
    try {
      const reviewResult = await this.ai.processQueuedActivityAiReview(job.id);
      return {
        outcome: 'COMPLETED' as const,
        reviewResult,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const row = await this.prisma.activityAiReview.update({
        where: { id: job.id },
        data: {
          status: $Enums.ActivityAiReviewStatus.FAILED,
          attempts: { increment: 1 },
          failedAt: new Date(),
          finishedAt: new Date(),
          lockedAt: null,
          errorCode: 'GENERATION_FAILED',
          errorMessage: msg.slice(0, 4000),
        },
        select: { attempts: true, maxAttempts: true },
      });
      const attempts = row.attempts ?? 0;
      const maxAttempts =
        row.maxAttempts ??
        this.configService.get<number>('activityAiReviewWorker.maxAttempts') ??
        3;

      if (attempts >= maxAttempts) {
        await this.prisma.activityAiReview.update({
          where: { id: job.id },
          data: {
            status: $Enums.ActivityAiReviewStatus.DEAD,
            finishedAt: new Date(),
          },
        });
        return {
          outcome: 'DEAD' as const,
          error: msg,
        };
      }

      const delay = backoffMs(attempts);
      await this.prisma.activityAiReview.update({
        where: { id: job.id },
        data: {
          availableAt: new Date(Date.now() + delay),
          lockedAt: null,
        },
      });
      return {
        outcome: 'RETRY' as const,
        attempts,
        delay,
        error: msg,
      };
    }
  }

  private async orchestrateClaimedJob(
    job: {
      id: string;
      activityId: number;
      userId: string;
    },
    progress: {
      sequence: number;
      batchPosition: number;
      batchTotal: number;
    },
  ) {
    const queueAtStart = await this.readQueueSnapshot();
    const startedAt = Date.now();
    this.logger.log(
      `[活动AI复盘队列][编排] 开始 本轮第=${progress.sequence} 当前批次=${progress.batchPosition}/${progress.batchTotal}${this.formatQueueSnapshot(queueAtStart, true)} 复盘ID=${job.id} 活动ID=${job.activityId} 用户ID=${job.userId}`,
    );

    const result = await this.executeJob(job);
    const elapsedMs = Date.now() - startedAt;
    const queueAfterExecution = await this.readQueueSnapshot();
    const progressText = `本轮第=${progress.sequence} 当前批次=${progress.batchPosition}/${progress.batchTotal}${this.formatQueueSnapshot(queueAfterExecution, false)}`;

    switch (result.outcome) {
      case 'DEAD':
        this.logger.error(
          `[活动AI复盘队列][编排] 任务进入 DEAD ${progressText} 复盘ID=${job.id} 耗时=${elapsedMs}ms 错误=${result.error}`,
        );
        return;
      case 'RETRY':
        this.logger.warn(
          `[活动AI复盘队列][编排] 任务失败待重试 ${progressText} 复盘ID=${job.id} 耗时=${elapsedMs}ms 重试次数=${result.attempts} 重试延迟毫秒=${result.delay} 错误=${result.error}`,
        );
        return;
      default:
        const resultText =
          result.reviewResult?.outcome === 'SUCCEEDED'
            ? ` 结果=SUCCEEDED 加权令牌=${result.reviewResult.weightedTokens}`
            : result.reviewResult?.outcome === 'SKIPPED'
              ? ` 结果=SKIPPED 跳过代码=${result.reviewResult.code}`
              : '';
        this.logger.log(
          `[活动AI复盘队列][编排] 完成 ${progressText} 复盘ID=${job.id} 活动ID=${job.activityId} 耗时=${elapsedMs}ms${resultText}`,
        );
    }
  }

  private async drain() {
    if (this.stopping || this.draining) return;
    this.draining = true;
    const batchSize =
      this.configService.get<number>('activityAiReviewWorker.batchSize') ?? 5;
    const concurrency =
      this.configService.get<number>('activityAiReviewWorker.concurrency') ?? 1;
    let sequence = 0;

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
              sequence += 1;
              await this.orchestrateClaimedJob(job, {
                sequence,
                batchPosition,
                batchTotal: batch.length,
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
