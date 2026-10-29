import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { ReviewDigestService } from '@/review/review-digest.service';
import { CoachDailyReviewRuntimeService } from '@/review/coach-daily-review-runtime.service';
import { CoachPeriodReviewRuntimeService } from '@/review/coach-period-review-runtime.service';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { I18nService } from 'nestjs-i18n';
import { UserService } from '@/api/user/user.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { AiService } from '@/api/ai/ai.service';
import { $Enums } from '@prisma/client';
import { parseAiReviewModeFeatures } from '@/api/ai/review-mode-features.util';
import { WorkerDrainProgress } from '../worker-drain-progress';
import {
  ReviewModelCallGuard,
  isReviewModelDeferredError,
} from '@/review/review-model-call-guard';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { RuntimeJobSupervisor } from '@/runtime-capabilities/runtime-job-supervisor.service';
import {
  FEATURE_ACCESS_POLICY,
  type FeatureAccessPolicy,
} from '@/access/feature-access-policy.port';

function backoffMs(attempts: number) {
  const base = 60_000; // 1 min
  const max = 60 * 60_000; // 60 min
  const pow = Math.min(10, Math.max(0, attempts));
  return Math.min(max, base * Math.pow(2, pow));
}

@Injectable()
export class ReviewWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private unregister: (() => void) | null = null;
  private stopping = false;
  /**
   * 进程内互斥：避免 setInterval 触发多次 drain 并发执行。
   * 注意：即使没有该锁，DB 侧也会通过 `FOR UPDATE SKIP LOCKED` + 状态流转避免重复处理同一条 job；
   * 这里主要是为了控制单进程资源峰值与避免“同进程多套 drain 循环”。
   */
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly digestService: ReviewDigestService,
    private readonly dailyReviewRuntime: CoachDailyReviewRuntimeService,
    private readonly periodReviewRuntime: CoachPeriodReviewRuntimeService,
    private readonly configService: ConfigService,
    private readonly notificationDomain: NotificationDomainService,
    private readonly i18n: I18nService,
    private readonly userService: UserService,
    private readonly ai: AiService,
    private readonly users: UserQueryService,
    @Inject(FEATURE_ACCESS_POLICY)
    private readonly featureAccess: FeatureAccessPolicy,
    private readonly modelGuard: ReviewModelCallGuard,
    @Optional() private readonly capabilities?: RuntimeCapabilityService,
    private readonly jobSupervisor?: RuntimeJobSupervisor,
  ) {}

  private enabled() {
    return (
      this.capabilities?.isEnabled('ai') !== false &&
      (this.configService.get<boolean>('reviewWorker.enabled') ?? true)
    );
  }

  onModuleInit() {
    this.unregister =
      this.jobSupervisor?.register({
        id: 'ai.review',
        enabled: () => this.enabled(),
        start: () => this.start(),
        stop: () => this.stop(),
      }) ?? null;
    if (!this.jobSupervisor && this.enabled()) this.start();
  }

  private start() {
    if (this.timer) return;
    const pollMs =
      this.configService.get<number>('reviewWorker.pollMs') ?? 1000;
    // 轮询唤醒：定期尝试 drain；drain 内部会一次性把队列“批量消耗到空”。
    this.timer = setInterval(() => {
      void this.drain().catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`[复盘][消费] 拉取队列失败：${msg}`);
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
    /**
     * 从 DB 队列“领取一批任务”，并原子地把它们标记为 RUNNING。
     *
     * 关键点：
     * - `FOR UPDATE SKIP LOCKED`：多进程/多实例并发时，其他 worker 会跳过已被锁定的行，不会重复领到同一条 job。
     * - 同一 SQL 内先 pick 再 update：避免“选出来但未标记 RUNNING 就被别人抢走”的竞态。
     */
    const rows = (await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        user_id: string;
        type: string;
        period_start: Date;
        period_end: Date;
      }>
    >(
      `
      WITH picked AS (
        SELECT id
        FROM t_review_job
        WHERE status IN ('PENDING','FAILED')
          AND available_at <= $1
        ORDER BY available_at ASC, created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE t_review_job j
      SET status='RUNNING', updated_at=NOW()
      FROM picked
      WHERE j.id = picked.id
      RETURNING j.id, j.user_id, j.type, j.period_start, j.period_end;
      `,
      now,
      batchSize,
    )) as Array<{
      id: string;
      user_id: string;
      type: string;
      period_start: Date;
      period_end: Date;
    }>;

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      type: r.type as 'DAILY' | 'WEEKLY' | 'MONTHLY',
      periodStart: r.period_start,
      periodEnd: r.period_end,
    }));
  }

  private async processJob(job: {
    id: string;
    userId: string;
    type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    periodStart: Date;
    periodEnd: Date;
  }) {
    const startedAt = Date.now();
    // 本轮已因连续模型失败停止：不产生任何副作用，直接顺延到下一个整点。
    const pausedUntil = this.modelGuard.pausedUntilAt();
    if (pausedUntil) {
      await this.deferJob(job, pausedUntil, 'review model calls paused');
      return;
    }
    try {
      // Jobs may outlive the feature decision that selected them. Revalidate
      // authoritative access before creating a digest or performing
      // any notification, content, runtime, or session side effect. Resolver
      // failures fall through to the normal retry path.
      const hasFeatureAccess = await this.hasFeatureAccess(job.userId);
      if (!hasFeatureAccess) {
        await this.prisma.reviewJob.update({
          where: { id: job.id },
          data: { status: 'DONE', lastError: null },
        });
        this.logger.log(
          `[复盘][消费] 跳过未授权任务 id=${job.id} 用户ID=${job.userId} 类型=${job.type}`,
        );
        return;
      }

      const timezone =
        (await this.userService.getPreferredTimezone(job.userId)) ?? 'UTC';
      // 1) 幂等确保 digest 存在（unique(userId,type,periodStart,periodEnd)）
      const { digestId } = await this.digestService.ensureDigestForJob({
        jobId: job.id,
        userId: job.userId,
        type: job.type,
        periodStart: job.periodStart,
        periodEnd: job.periodEnd,
        timezone,
      });

      const lang = await this.userService.getPreferredLocale(job.userId);
      const notifyDigest = await this.wantsDigestNotification(
        job.userId,
        job.type,
      );

      // Digest 通知走 AI_REVIEW_MODE；Coach Runtime 由功能权限控制，不受通知开关影响。
      if (notifyDigest) {
        await this.notificationDomain.ensureNotification({
          userId: job.userId,
          kind: 'REVIEW_DIGEST',
          dedupeKey: `review:${digestId}`,
          title: this.i18n.t(
            job.type === 'DAILY'
              ? 'common.notification.reviewDigest.titleDailyReady'
              : job.type === 'WEEKLY'
                ? 'common.notification.reviewDigest.titleWeeklyReady'
                : 'common.notification.reviewDigest.titleMonthlyReady',
            { lang },
          ),
          bodyMarkdown: this.i18n.t(
            'common.notification.reviewDigest.bodyGenerating',
            { lang },
          ),
          digestId,
          data: {
            type: job.type,
            periodStart: job.periodStart.toISOString(),
            periodEnd: job.periodEnd.toISOString(),
            timezone,
          },
        });

        await this.digestService.finalizeDigestContent({
          digestId,
          userId: job.userId,
          type: job.type,
          lang,
          periodStart: job.periodStart,
          periodEnd: job.periodEnd,
          timezone,
        });
      }
      if (job.type === 'DAILY') {
        try {
          // Digest 写完后再想计划执行。失败只 warn，digest 仍标记 DONE。
          await this.dailyReviewRuntime.runForDailyJob({
            userId: job.userId,
            digestId,
            periodStart: job.periodStart,
            periodEnd: job.periodEnd,
          });
        } catch (error) {
          if (isReviewModelDeferredError(error)) throw error;
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `[复盘][日执行思考] 失败但不阻断 digest jobId=${job.id}: ${msg}`,
          );
        }
      }
      if (job.type === 'WEEKLY' || job.type === 'MONTHLY') {
        try {
          // 周/月同构：窗口执行思考，必要时推迟下一练。
          await this.periodReviewRuntime.runForJob({
            type: job.type,
            userId: job.userId,
            digestId,
            periodStart: job.periodStart,
            periodEnd: job.periodEnd,
          });
        } catch (error) {
          if (isReviewModelDeferredError(error)) throw error;
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `[复盘][周期执行思考] 失败但不阻断 digest jobId=${job.id}: ${msg}`,
          );
        }
      }
      if (notifyDigest) {
        await this.syncDigestToCoachReviewSession({
          userId: job.userId,
          digestId,
          type: job.type,
          lang,
        });
      }

      // 4) 标记 job 完成
      await this.prisma.reviewJob.update({
        where: { id: job.id },
        data: { status: 'DONE', lastError: null },
      });
      this.logger.log(
        `[复盘][消费] 任务完成 id=${job.id} 用户ID=${job.userId} 类型=${job.type} 耗时=${Date.now() - startedAt}ms`,
      );
    } catch (e) {
      if (isReviewModelDeferredError(e)) {
        await this.deferJob(job, e.resumeAt, e.message);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      // 失败：记录 attempts，并用 availableAt 做指数退避；超过上限则标记 DEAD。
      const row = await this.prisma.reviewJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          lastError: msg,
        },
        select: { attempts: true },
      });
      const attempts = row.attempts ?? 0;
      const maxAttempts =
        this.configService.get<number>('reviewWorker.maxAttempts') ?? 6;
      if (attempts >= maxAttempts) {
        await this.prisma.reviewJob.update({
          where: { id: job.id },
          data: { status: 'DEAD' },
        });
        this.logger.error(
          `[复盘][消费] 任务进入死信状态 id=${job.id} 错误=${msg}`,
        );
        return;
      }
      const delay = backoffMs(attempts);
      await this.prisma.reviewJob.update({
        where: { id: job.id },
        data: { availableAt: new Date(Date.now() + delay) },
      });
      this.logger.warn(
        `[复盘][消费] 任务失败待重试 id=${job.id} 重试次数=${attempts} 重试延迟毫秒=${delay} 错误=${msg}`,
      );
    }
  }

  /**
   * 顺延（不是失败）：回到 PENDING，available_at 设为下一个整点，不消耗 attempts。
   * 任务仍在 t_review_job 中，worker 按 available_at 认领，与 cron 是否再次命中
   * 用户的发送小时无关，因此下一小时一定会被重新处理，不会被跳过一天。
   */
  private async deferJob(
    job: { id: string; userId: string; type: string },
    resumeAt: Date,
    reason: string,
  ) {
    await this.prisma.reviewJob.update({
      where: { id: job.id },
      data: {
        status: 'PENDING',
        availableAt: resumeAt,
        lastError: `deferred: ${reason}`,
      },
    });
    this.logger.warn(
      `[复盘][消费] 模型连续失败，任务顺延 id=${job.id} 用户ID=${job.userId} 类型=${job.type} 顺延至=${resumeAt.toISOString()}`,
    );
  }

  /** Digest 通知 / 活动摘要会话才看 AI_REVIEW_MODE；Runtime 不走这里。 */
  private async wantsDigestNotification(
    userId: string,
    type: 'DAILY' | 'WEEKLY' | 'MONTHLY',
  ) {
    const reviewSetting = await this.users.settings().findUnique({
      where: {
        userId_category: {
          userId,
          category: $Enums.SettingCategory.AI_REVIEW_MODE,
        },
      },
      select: { value: true },
    });
    const features = parseAiReviewModeFeatures(reviewSetting?.value);
    if (type === 'DAILY') return features.dailyReview;
    if (type === 'WEEKLY') return features.weeklyReview;
    return features.monthlyReview;
  }

  /**
   * Coach Runtime 的最终功能权限门槛。Cron 只计算时间窗口；worker 在执行前
   * 再次查询策略，避免策略变化后继续处理已经领取的任务。
   */
  private async hasFeatureAccess(userId: string) {
    const access = await this.featureAccess.evaluate(userId, [
      'ai.periodReview',
    ]);
    return access.features['ai.periodReview'].allowed;
  }

  private async syncDigestToCoachReviewSession(args: {
    userId: string;
    digestId: string;
    type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    lang: string;
  }) {
    if (!this.ai) return;
    const digest = await this.digestService.findUniqueAiSummary(args.digestId);
    const markdown = String(digest?.aiSummaryMarkdown ?? '').trim();
    if (!markdown) return;

    const fallbackTitle =
      args.type === 'DAILY'
        ? 'Daily review'
        : args.type === 'WEEKLY'
          ? 'Weekly review'
          : 'Monthly review';
    const title = String(digest?.title ?? '').trim() || fallbackTitle;

    await this.ai.replaceReviewDigestSession({
      userId: args.userId,
      digestId: args.digestId,
      type: args.type,
      lang: args.lang,
      title,
      markdown,
    });
  }

  /**
   * “异步递归/循环消费”：每批取 N 个，处理完继续取，直到为空。
   */
  private async drain() {
    if (this.stopping || this.draining) return;

    this.draining = true;
    const batchSize =
      this.configService.get<number>('reviewWorker.batchSize') ?? 10;
    const concurrency =
      this.configService.get<number>('reviewWorker.concurrency') ?? 1;
    const progress = new WorkerDrainProgress(
      this.logger,
      '复盘队列',
      async () => ({
        remaining: await this.prisma.reviewJob.count({
          where: {
            status: { in: ['PENDING', 'FAILED', 'RUNNING'] },
          },
        }),
      }),
    );

    try {
      /**
       * “批量消费到空”循环：
       * - 每轮 claim 一批（最多 batchSize）
       * - 批内用一个简单的并发池（concurrency 个 runner 共享 idx）
       * - 一批全部完成后再去 claim 下一批
       */
      while (!this.stopping) {
        // 本轮已停止：不再认领新任务，等下一个整点恢复。
        if (this.modelGuard.pausedUntilAt()) return;
        const batch = await this.claimBatch(batchSize);
        if (batch.length === 0) return;

        // 简单并发池
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
                details: `任务ID=${job.id} 用户ID=${job.userId} 类型=${job.type}`,
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
