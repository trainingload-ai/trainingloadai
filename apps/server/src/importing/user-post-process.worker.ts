import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '@/prisma/prisma.service';
import { ImportingJobService } from './importing-job.service';
import { AnalyzeFitnessOrchestratorService } from '@/analyze/analyze-fitness-orchestrator.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitPmcInvalidate } from '@/training-load/events/pmc.events';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { ActivityService } from '@/api/activity/activity.service';
import { UserService } from '@/api/user/user.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { ThirdPartyAutoExportOrchestratorService } from '@/workers/third-party-auto-export-orchestrator.service';
import { WorkerDrainProgress } from '@/workers/worker-drain-progress';
import { SportType, type ImportPipelineStage } from '@prisma/client';
import dayjs = require('dayjs');
import { randomUUID } from 'node:crypto';
import type { MetricsTaskOutcome } from '@/api/activity/metrics/context';
import { forEachWithConcurrency } from '@/utils/async-concurrency.util';
import {
  FEATURE_ACCESS_POLICY,
  type FeatureAccessPolicy,
} from '@/access/feature-access-policy.port';
import { emitAthleteStateReassessRequested } from '@/athlete-state/athlete-state.events';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import {
  IMPORT_COMPLETION_PRESENTER,
  type ImportCompletionPresenter,
} from './import-completion-presenter.port';

const HEAVY_METRICS_CONCURRENCY = 2;
const AI_REVIEW_ENQUEUE_CONCURRENCY = 3;

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const SPORT_TYPE_VALUES = new Set<string>(Object.values(SportType));

function asSportTypes(value: unknown): SportType[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SportType =>
      typeof item === 'string' && SPORT_TYPE_VALUES.has(item),
  );
}

function backoffMs(attempts: number) {
  // 后处理失败通常是外部依赖或瞬时数据库问题，退避重试避免持续打满队列。
  const base = 60_000;
  const max = 60 * 60_000;
  const pow = Math.min(10, Math.max(0, attempts));
  return Math.min(max, base * Math.pow(2, pow));
}

/**
 * 导入批次成功后自动入队「活动 AI 复盘」的活动数上限；超过则整批不跑。
 * 默认 3；可用 USER_POST_PROCESS_AI_REVIEW_IMPORT_MAX_ACTIVITIES 覆盖（整数 ≥1）。
 */
function importBatchAutoAiReviewMaxActivities(): number {
  const raw =
    process.env.USER_POST_PROCESS_AI_REVIEW_IMPORT_MAX_ACTIVITIES?.trim();
  if (!raw) return 3;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

function countField(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

type ThirdPartyExportOutcome = {
  failedProviders: string[];
  failedCount: number;
};

type HeavyMetricsTaskSummary = {
  applied: number;
  ignored: number;
  skipped: number;
  failed: number;
  ignoredReasons: Record<string, number>;
  skippedReasons: Record<string, number>;
};

function addHeavyMetricsOutcome(
  summary: Record<string, HeavyMetricsTaskSummary>,
  outcome: MetricsTaskOutcome,
) {
  const row = (summary[outcome.key] ??= {
    applied: 0,
    ignored: 0,
    skipped: 0,
    failed: 0,
    ignoredReasons: {},
    skippedReasons: {},
  });
  if (outcome.status === 'APPLIED') {
    row.applied += 1;
    return;
  }
  if (outcome.status === 'FAILED') {
    row.failed += 1;
    return;
  }
  if (outcome.status === 'IGNORED') {
    row.ignored += 1;
    const reason = outcome.reason ?? 'unspecified';
    row.ignoredReasons[reason] = (row.ignoredReasons[reason] ?? 0) + 1;
    return;
  }
  row.skipped += 1;
  const reason = outcome.reason ?? 'unspecified';
  row.skippedReasons[reason] = (row.skippedReasons[reason] ?? 0) + 1;
}

function exportReasonText(reason: unknown) {
  switch (String(reason ?? '')) {
    case 'connection_not_connected':
      return '未绑定连接';
    case 'connection_not_active':
      return '连接不可用';
    case 'credential_missing':
      return '凭证缺失';
    case 'export_disabled':
      return '自动上传未开启';
    case 'not_exportable':
      return '活动不符合回写条件';
    case 'no_uploadable_file':
      return '未找到可上传文件';
    case 'no_uploadable_fit':
      return '未找到可上传的 FIT 文件';
    default:
      return String(reason ?? '未知原因');
  }
}

function exportStatusText(status: unknown) {
  switch (String(status ?? '')) {
    case 'EXPORTED':
      return '已上传';
    case 'SKIPPED':
      return '已跳过';
    case 'FAILED':
      return '失败';
    default:
      return String(status ?? '未知状态');
  }
}

function summarizeThirdPartyExport(displayName: string, result: unknown) {
  const data = jsonRecord(result);
  const exportedCount = countField(data.exportedCount);
  const failedCount = countField(data.failedCount);
  const skippedCount = countField(data.skippedCount);
  const pendingCount = countField(data.pendingCount);
  const rows = Array.isArray(data.results) ? data.results : [];
  const detailRows = rows.filter((row) => {
    const status = String(jsonRecord(row).status ?? '');
    return status === 'SKIPPED' || status === 'FAILED';
  });
  const details = detailRows.slice(0, 3).map((row) => {
    const item = jsonRecord(row);
    const activityText =
      item.activityId == null ? '活动未知' : `活动 ${item.activityId}`;
    return `${activityText}：${exportStatusText(item.status)}，原因：${exportReasonText(
      item.reason,
    )}`;
  });
  const moreCount = Math.max(0, detailRows.length - details.length);
  const suffix =
    details.length > 0
      ? `（${details.join('；')}${moreCount > 0 ? `；另有 ${moreCount} 条` : ''}）`
      : '';
  return `${displayName} 成功 ${exportedCount} 个、处理中 ${pendingCount} 个、失败 ${failedCount} 个、跳过 ${skippedCount} 个${suffix}`;
}

function thirdPartyExportFailureCount(result: unknown) {
  const data = jsonRecord(result);
  const declared = countField(data.failedCount);
  const rows = Array.isArray(data.results) ? data.results : [];
  const rowFailures = rows.filter(
    (row) => String(jsonRecord(row).status ?? '') === 'FAILED',
  ).length;
  return Math.max(declared, rowFailures);
}

@Injectable()
export class UserPostProcessWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(UserPostProcessWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private stopping = false;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly fitnessOrchestrator: AnalyzeFitnessOrchestratorService,
    private readonly events: EventEmitter2,
    private readonly notificationDomain: NotificationDomainService,
    private readonly activityService: ActivityService,
    private readonly thirdPartyAutoExports: ThirdPartyAutoExportOrchestratorService,
    private readonly i18n: I18nService,
    private readonly userService: UserService,
    private readonly importJobs: ImportingJobService,
    private readonly usersQuery: UserQueryService,
    @Optional()
    @Inject(FEATURE_ACCESS_POLICY)
    private readonly featureAccess?: FeatureAccessPolicy,
    private readonly capabilities?: RuntimeCapabilityService,
    @Optional()
    @Inject(IMPORT_COMPLETION_PRESENTER)
    private readonly importCompletionPresenter?: ImportCompletionPresenter,
  ) {}

  private async translateNotification(
    userId: string,
    key: string,
    fallback: string,
    args?: Record<string, string | number>,
  ) {
    const lang =
      (await this.userService?.getPreferredLocale(userId).catch(() => null)) ??
      'en';
    const translated = this.i18n?.t(key, { lang, args });
    return typeof translated === 'string' &&
      translated.trim() &&
      translated !== key
      ? translated
      : fallback.replace(/\{(\w+)\}/g, (_, name: string) =>
          args?.[name] == null ? `{${name}}` : String(args[name]),
        );
  }

  private enabled() {
    return (
      this.configService.get<boolean>('userPostProcessWorker.enabled') ?? true
    );
  }

  onModuleInit() {
    if (!this.enabled()) return;
    const pollMs =
      this.configService.get<number>('userPostProcessWorker.pollMs') ?? 1000;
    this.timer = setInterval(() => {
      void this.drain().catch((e) => {
        this.logger.error(
          `[用户后处理任务] 拉取队列失败：${
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

  private logImportPipelineEvent(args: {
    batchJobId?: string | null;
    postProcessJobId?: string | null;
    userId?: string | null;
    stage: ImportPipelineStage;
    message: string;
    data?: Record<string, unknown>;
    level?: 'INFO' | 'WARN' | 'ERROR';
  }) {
    const ctx = [
      `stage=${args.stage}`,
      args.batchJobId ? `batch=${args.batchJobId}` : null,
      args.postProcessJobId ? `postProcess=${args.postProcessJobId}` : null,
      args.userId ? `user=${args.userId}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    const dataSuffix =
      args.data != null && Object.keys(args.data).length > 0
        ? ` data=${JSON.stringify(args.data)}`
        : '';
    const line = `[用户后处理] ${ctx} ${args.message}${dataSuffix}`;
    switch (args.level ?? 'INFO') {
      case 'ERROR':
        this.logger.error(line);
        break;
      case 'WARN':
        this.logger.warn(line);
        break;
      default:
        this.logger.log(line);
    }
  }

  private async claimBatch(batchSize: number) {
    // SKIP LOCKED 让多个 worker 实例可以安全抢占不同 job，不会互相阻塞。
    const now = new Date();
    const lockToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + this.leaseMs());
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        user_id: string;
        batch_job_id: string;
        lock_token: string;
      }>
    >(
      `
      WITH picked AS (
        SELECT id
        FROM t_user_post_process_job
        WHERE (
          (status IN ('PENDING','FAILED') AND available_at <= $1)
          OR (
            status='RUNNING'
            AND (lease_expires_at IS NULL OR lease_expires_at <= $1)
          )
        )
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE t_user_post_process_job j
      SET status='RUNNING',
          started_at=COALESCE(j.started_at, NOW()),
          lock_token=$3,
          lease_expires_at=$4,
          updated_at=NOW()
      FROM picked
      WHERE j.id = picked.id
      RETURNING j.id, j.user_id, j.batch_job_id, j.lock_token;
      `,
      now,
      batchSize,
      lockToken,
      leaseExpiresAt,
    );

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      batchJobId: row.batch_job_id,
      lockToken: row.lock_token,
    }));
  }

  private leaseMs() {
    const configured =
      this.configService.get<number>('userPostProcessWorker.leaseMs') ??
      15 * 60_000;
    return Math.max(60_000, configured);
  }

  private async renewLease(job: { id: string; lockToken?: string }) {
    if (!job.lockToken) return;
    const result = await this.importJobs.postProcessJobs().updateMany({
      where: {
        id: job.id,
        status: 'RUNNING',
        lockToken: job.lockToken,
      },
      data: { leaseExpiresAt: new Date(Date.now() + this.leaseMs()) },
    });
    if (result.count !== 1) {
      this.logger.warn(`[用户后处理] 租约续期失败，job=${job.id}`);
    }
  }

  private async completeClaimedJob(
    job: { id: string; batchJobId: string; lockToken?: string },
    batchStatus: 'COMPLETED' | 'PARTIAL_FAILED' | 'FAILED',
  ) {
    const data = {
      status: 'COMPLETED' as const,
      completedAt: new Date(),
      lastError: null,
      lockToken: null,
      leaseExpiresAt: null,
    };
    await this.prisma.$transaction(async (tx) => {
      if (!job.lockToken) {
        await this.importJobs.postProcessJobs(tx).update({
          where: { id: job.id },
          data,
        });
      } else {
        const result = await this.importJobs.postProcessJobs(tx).updateMany({
          where: { id: job.id, status: 'RUNNING', lockToken: job.lockToken },
          data,
        });
        if (result.count !== 1) {
          throw new Error(`User post-process lease lost: ${job.id}`);
        }
      }
      await this.importJobs.batchJobs(tx).update({
        where: { id: job.batchJobId },
        data: { status: batchStatus },
      });
    });
  }

  private async failClaimedJob(
    job: { id: string; lockToken?: string },
    message: string,
  ): Promise<number | null> {
    if (!job.lockToken) {
      const row = await this.importJobs.postProcessJobs().update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          lastError: message,
        },
        select: { attempts: true },
      });
      return row.attempts ?? 0;
    }
    // 先放到未来，避免清理最终状态前被另一个 worker 立即重新 claim。
    const result = await this.importJobs.postProcessJobs().updateMany({
      where: { id: job.id, status: 'RUNNING', lockToken: job.lockToken },
      data: {
        status: 'FAILED',
        attempts: { increment: 1 },
        lastError: message,
        availableAt: new Date(Date.now() + 60 * 60_000),
        lockToken: null,
        leaseExpiresAt: null,
      },
    });
    if (result.count !== 1) return null;
    const row = await this.importJobs.postProcessJobs().findUnique({
      where: { id: job.id },
      select: { attempts: true },
    });
    return row?.attempts ?? null;
  }

  private async sendBatchNotification(args: {
    batchJobId: string;
    userId: string;
    exportOutcome?: ThirdPartyExportOutcome;
  }) {
    // 通知按 batch 去重；即使 worker 重试，也只会保留同一 dedupeKey 的最终通知。
    const batch = await this.importJobs.batchJobs().findUnique({
      where: { id: args.batchJobId },
      select: {
        status: true,
        totalCount: true,
        successCount: true,
        failedCount: true,
        skippedCount: true,
        requestContext: true,
      },
    });
    if (!batch) return;

    const requestContext = (batch.requestContext ?? {}) as Record<
      string,
      unknown
    >;
    if (requestContext.suppressCompletionNotification === true) {
      await this.importJobs.batchJobs().update({
        where: { id: args.batchJobId },
        data: { notificationSentAt: new Date() },
      });
      return;
    }
    const isIntervalsIcu = requestContext.source === 'intervals_icu';

    const hasExportFailures = (args.exportOutcome?.failedCount ?? 0) > 0;
    const kind =
      batch.status === 'PARTIAL_FAILED' ||
      batch.status === 'FAILED' ||
      hasExportFailures
        ? 'IMPORT_BATCH_PARTIAL_FAILED'
        : 'IMPORT_BATCH_COMPLETED';
    const completed = kind === 'IMPORT_BATCH_COMPLETED';
    const summaryArgs = {
      totalCount: batch.totalCount,
      successCount: batch.successCount,
      failedCount: batch.failedCount,
      skippedCount: batch.skippedCount,
    };

    let title: string;
    let bodyMarkdown: string;
    const deploymentMessage = this.importCompletionPresenter?.resolve({
      requestContext,
      completed,
    });
    if (deploymentMessage) {
      title = await this.translateNotification(
        args.userId,
        deploymentMessage.title.key,
        deploymentMessage.title.fallback,
      );
      bodyMarkdown = await this.translateNotification(
        args.userId,
        deploymentMessage.body.key,
        deploymentMessage.body.fallback,
        summaryArgs,
      );
    } else if (isIntervalsIcu) {
      title = await this.translateNotification(
        args.userId,
        completed
          ? 'common.notification.intervalsIcu.titleSyncCompleted'
          : 'common.notification.intervalsIcu.titleSyncCompletedWithFailures',
        completed
          ? 'Intervals.icu sync completed'
          : 'Intervals.icu sync completed with failures',
      );
      bodyMarkdown = await this.translateNotification(
        args.userId,
        'common.notification.intervalsIcu.bodyBatchSummary',
        'Processed {totalCount} Intervals.icu activities.\n\n- Success: {successCount}\n- Failed: {failedCount}\n- Skipped: {skippedCount}',
        summaryArgs,
      );
    } else {
      title = await this.translateNotification(
        args.userId,
        completed
          ? 'common.notification.importBatch.titleCompleted'
          : 'common.notification.importBatch.titleCompletedWithFailures',
        completed
          ? 'Import batch completed'
          : 'Import batch completed with failures',
      );
      bodyMarkdown = await this.translateNotification(
        args.userId,
        'common.notification.importBatch.bodyBatchSummary',
        'Processed {totalCount} source objects.\n\n- Success: {successCount}\n- Failed: {failedCount}\n- Skipped: {skippedCount}',
        summaryArgs,
      );
    }

    if (hasExportFailures) {
      const providers = args.exportOutcome!.failedProviders.join(', ');
      bodyMarkdown += await this.translateNotification(
        args.userId,
        'common.notification.importBatch.bodyThirdPartyExportFailures',
        '\n\nThird-party upload failed for {providers} ({failedCount} activities). Open connection settings or retry from the activity.',
        {
          providers,
          failedCount: args.exportOutcome!.failedCount,
        },
      );
    }

    await this.notificationDomain.ensureNotification({
      userId: args.userId,
      kind,
      dedupeKey: `import-batch:${args.batchJobId}`,
      title,
      bodyMarkdown,
      data: {
        batchJobId: args.batchJobId,
        totalCount: batch.totalCount,
        successCount: batch.successCount,
        failedCount: batch.failedCount,
        skippedCount: batch.skippedCount,
        thirdPartyExportFailedProviders:
          args.exportOutcome?.failedProviders ?? [],
        thirdPartyExportFailedCount: args.exportOutcome?.failedCount ?? 0,
      },
      digestId: undefined,
    });

    await this.importJobs.batchJobs().update({
      where: { id: args.batchJobId },
      data: { notificationSentAt: new Date() },
    });
  }

  /**
   * 跑第二段重度指标，依赖用户阈值与分区配置
   * @param args
   * @returns
   */
  private async getBatchAnalysisActivityIds(args: {
    batchJobId: string;
    userId: string;
    refreshFrom?: Date | null;
    refreshTo?: Date | null;
  }): Promise<number[]> {
    const doneItems = await this.importJobs.itemJobs().findMany({
      where: {
        batchJobId: args.batchJobId,
        userId: args.userId,
        status: 'DONE',
        activityId: { not: null },
        analysisRequired: true,
        ...(args.refreshFrom
          ? {
              activity: {
                startTime: {
                  gte: args.refreshFrom,
                  ...(args.refreshTo ? { lte: args.refreshTo } : {}),
                },
              },
            }
          : {}),
      },
      select: { activityId: true },
    });
    return Array.from(
      new Set(
        doneItems
          .map((item) => item.activityId)
          .filter((id: unknown): id is number => typeof id === 'number'),
      ),
    );
  }

  private async runBatchHeavyMetrics(args: {
    batchJobId: string;
    userId: string;
    postProcessJobId: string;
  }): Promise<number[]> {
    const activityIds = await this.getBatchAnalysisActivityIds(args);

    if (!activityIds.length) return [];

    this.logImportPipelineEvent({
      batchJobId: args.batchJobId,
      postProcessJobId: args.postProcessJobId,
      userId: args.userId,
      stage: 'ANALYZING',
      message: `开始执行导入后第二段重度分析，共 ${activityIds.length} 个活动`,
      data: { activityCount: activityIds.length },
    });

    const failures: Array<{ activityId: number; error: string }> = [];
    const taskSummary: Record<string, HeavyMetricsTaskSummary> = {};
    // 重度指标会同时占用 CPU 与数据库连接；固定为两个 runner，消除完全串行
    // 瀑布的同时避免大批量导入瞬间打满资源。
    await forEachWithConcurrency(
      activityIds,
      HEAVY_METRICS_CONCURRENCY,
      async (activityId) => {
        try {
          const outcomes = await this.activityService.runHeavyMetricsPipeline(
            activityId,
            args.userId,
          );
          for (const outcome of outcomes ?? []) {
            addHeavyMetricsOutcome(taskSummary, outcome);
          }
          const appliedTasks = (outcomes ?? [])
            .filter((outcome) => outcome.status === 'APPLIED')
            .map((outcome) => outcome.key);
          const skippedTasks = (outcomes ?? [])
            .filter((outcome) => outcome.status === 'SKIPPED')
            .map(
              (outcome) => `${outcome.key}:${outcome.reason ?? 'unspecified'}`,
            );
          const ignoredTasks = (outcomes ?? [])
            .filter((outcome) => outcome.status === 'IGNORED')
            .map(
              (outcome) => `${outcome.key}:${outcome.reason ?? 'unspecified'}`,
            );
          await this.prisma.activity.update({
            where: { id: activityId },
            data: {
              processingStatus: 'READY',
              processingUpdatedAt: new Date(),
              readyAt: new Date(),
            },
          });
          this.logImportPipelineEvent({
            batchJobId: args.batchJobId,
            postProcessJobId: args.postProcessJobId,
            userId: args.userId,
            stage: 'ANALYZING',
            message: `活动 ${activityId} 重度指标完成，生成 ${appliedTasks.length} 项，忽略 ${ignoredTasks.length} 项，跳过 ${skippedTasks.length} 项`,
            data: { activityId, appliedTasks, ignoredTasks, skippedTasks },
          });
        } catch (e) {
          failures.push({
            activityId,
            error: e instanceof Error ? e.message : String(e),
          });
          this.logImportPipelineEvent({
            batchJobId: args.batchJobId,
            postProcessJobId: args.postProcessJobId,
            userId: args.userId,
            stage: 'ANALYZING',
            message: `活动 ${activityId} 重度指标失败`,
            data: {
              activityId,
              error: e instanceof Error ? e.message : String(e),
            },
            level: 'ERROR',
          });
        }
      },
    );

    if (failures.length > 0) {
      await this.prisma.activity.updateMany({
        where: { id: { in: failures.map((failure) => failure.activityId) } },
        data: {
          processingStatus: 'PARTIAL_FAILED',
          processingUpdatedAt: new Date(),
          readyAt: null,
        },
      });
      const preview = failures.slice(0, 3).map((f) => f.activityId);
      throw new Error(
        `Heavy metrics failed for ${failures.length}/${activityIds.length} activities, sample activityIds=${preview.join(',')}`,
      );
    }

    this.logImportPipelineEvent({
      batchJobId: args.batchJobId,
      postProcessJobId: args.postProcessJobId,
      userId: args.userId,
      stage: 'ANALYZING',
      message: `导入后第二段重度分析完成，共 ${activityIds.length} 个活动`,
      data: { activityCount: activityIds.length, taskSummary },
    });
    await emitAthleteStateReassessRequested(this.events, {
      userId: args.userId,
      triggerType: 'ACTIVITY_READY',
      triggerRef: args.postProcessJobId,
    });
    return activityIds;
  }

  private async hasActivityReviewAccess(userId: string): Promise<boolean> {
    const access = await this.featureAccess?.evaluate(userId, [
      'ai.activityReview',
    ]);
    return access?.features['ai.activityReview'].allowed ?? false;
  }

  private async runBatchAiReviewWhenAllowed(args: {
    batchJobId: string;
    userId: string;
    postProcessJobId: string;
    activityIds: number[];
  }) {
    if (
      !args.activityIds.length ||
      this.capabilities?.isEnabled('ai') === false
    )
      return;

    const maxAuto = importBatchAutoAiReviewMaxActivities();
    if (args.activityIds.length > maxAuto) {
      this.logImportPipelineEvent({
        batchJobId: args.batchJobId,
        postProcessJobId: args.postProcessJobId,
        userId: args.userId,
        stage: 'NOTIFYING',
        message: `本批次成功活动 ${args.activityIds.length} 超过自动 AI 复盘上限 ${maxAuto}，跳过（多为历史批量导入）`,
        data: {
          activityCount: args.activityIds.length,
          maxAutoAiReviewActivities: maxAuto,
        },
      });
      return;
    }

    const hasAccess = await this.hasActivityReviewAccess(args.userId);
    if (!hasAccess) {
      this.logImportPipelineEvent({
        batchJobId: args.batchJobId,
        postProcessJobId: args.postProcessJobId,
        userId: args.userId,
        stage: 'NOTIFYING',
        message: '当前实例策略未开放活动 AI 复盘，跳过自动处理',
      });
      return;
    }

    this.logImportPipelineEvent({
      batchJobId: args.batchJobId,
      postProcessJobId: args.postProcessJobId,
      userId: args.userId,
      stage: 'NOTIFYING',
      message: `开始自动触发活动 AI 复盘，共 ${args.activityIds.length} 个活动`,
      data: { activityCount: args.activityIds.length },
    });

    const failures: Array<{ activityId: number; error: string }> = [];
    await forEachWithConcurrency(
      args.activityIds,
      AI_REVIEW_ENQUEUE_CONCURRENCY,
      async (activityId) => {
        try {
          await this.activityService.enqueueActivityAiReviewForImport(
            activityId,
            args.userId,
            'import-post-process-auto-review',
          );
        } catch (e) {
          failures.push({
            activityId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },
    );

    if (failures.length > 0) {
      const successCount = args.activityIds.length - failures.length;
      this.logImportPipelineEvent({
        batchJobId: args.batchJobId,
        postProcessJobId: args.postProcessJobId,
        userId: args.userId,
        stage: 'NOTIFYING',
        message: `活动 AI 复盘入队部分失败，成功 ${successCount} 个、失败 ${failures.length} 个；后处理继续执行`,
        data: {
          activityCount: args.activityIds.length,
          successCount,
          failureCount: failures.length,
          failures,
        },
        level: 'WARN',
      });
      return;
    }

    this.logImportPipelineEvent({
      batchJobId: args.batchJobId,
      postProcessJobId: args.postProcessJobId,
      userId: args.userId,
      stage: 'NOTIFYING',
      message: `活动 AI 复盘已自动触发，共 ${args.activityIds.length} 个活动`,
      data: { activityCount: args.activityIds.length },
    });
  }
  /**
   * 判断是否批量同步到第三方平台
   * @param args
   * @returns
   */
  private async runBatchThirdPartyExports(args: {
    batchJobId: string;
    userId: string;
    postProcessJobId: string;
    activityIds: number[];
  }): Promise<ThirdPartyExportOutcome> {
    if (!args.activityIds.length) {
      return { failedProviders: [], failedCount: 0 };
    }

    this.logImportPipelineEvent({
      batchJobId: args.batchJobId,
      postProcessJobId: args.postProcessJobId,
      userId: args.userId,
      stage: 'POST_PROCESSING',
      message: `开始判断本批次活动是否需要回写第三方，共 ${args.activityIds.length} 个活动`,
      data: { activityCount: args.activityIds.length },
    });

    const {
      results,
      providerLabels = {},
      failures,
    } = await this.thirdPartyAutoExports.run({
      userId: args.userId,
      activityIds: args.activityIds,
    });

    const summary = Object.entries(results).map(([key, result]) =>
      summarizeThirdPartyExport(providerLabels[key] ?? key, result),
    );
    const failureSummary = failures.map(
      (failure) =>
        `${failure.displayName ?? providerLabels[failure.provider] ?? failure.provider} 执行失败：${failure.error}`,
    );
    const fullSummary = [...summary, ...failureSummary];
    const messageSummary = fullSummary.join('；');

    this.logImportPipelineEvent({
      batchJobId: args.batchJobId,
      postProcessJobId: args.postProcessJobId,
      userId: args.userId,
      stage: 'POST_PROCESSING',
      message:
        failures.length > 0
          ? `第三方回写判断完成，${failures.length} 个平台失败：${messageSummary}`
          : `第三方回写判断完成：${messageSummary}`,
      level: failures.length > 0 ? 'WARN' : 'INFO',
      data: {
        summary: fullSummary,
        ...results,
        ...(failures.length ? { failures } : {}),
      },
    });
    const resultFailures = Object.entries(results)
      .map(([provider, result]) => ({
        provider,
        count: thirdPartyExportFailureCount(result),
      }))
      .filter((item) => item.count > 0);
    return {
      failedProviders: Array.from(
        new Set([
          ...resultFailures.map(
            (item) => providerLabels[item.provider] ?? item.provider,
          ),
          ...failures.map(
            (item) =>
              item.displayName ??
              providerLabels[item.provider] ??
              item.provider,
          ),
        ]),
      ),
      failedCount:
        resultFailures.reduce((sum, item) => sum + item.count, 0) +
        failures.length,
    };
  }
  /**
   * 用户后处理任务
   * @param job
   * @returns
   */
  private async processJob(job: {
    id: string;
    userId: string;
    batchJobId: string;
    lockToken?: string;
  }) {
    // 批次 item 全部结束后：用户前置刷新 -> 用户全局 VO2Max 聚合 -> 第二段重度分析 -> PMC -> 发送完成通知。
    const heartbeat = setInterval(
      () => void this.renewLease(job).catch(() => undefined),
      Math.max(30_000, Math.floor(this.leaseMs() / 3)),
    );
    heartbeat.unref?.();
    try {
      const row = await this.importJobs.postProcessJobs().findUnique({
        where: { id: job.id },
        select: {
          recomputeFrom: true,
          recomputeTo: true,
          affectedSportTypes: true,
        },
      });
      if (!row) return;

      const sportTypes = asSportTypes(row.affectedSportTypes);
      const batchAnalysisActivityIds =
        sportTypes.length > 0
          ? await this.getBatchAnalysisActivityIds({
              batchJobId: job.batchJobId,
              userId: job.userId,
              refreshFrom: row.recomputeFrom,
              refreshTo: row.recomputeTo,
            })
          : [];
      // 历史合并/删除等维护任务没有 import item，但仍需刷新最近 60 天内
      // 已 READY 的用户全局指标。空数组不能作为 include scope，否则等价于
      // “一个活动也不读”。普通导入仍用 item IDs 纳入尚未 READY 的本批活动。
      const fitnessScope = batchAnalysisActivityIds.length
        ? { includeActivityIds: batchAnalysisActivityIds }
        : {};

      this.logImportPipelineEvent({
        batchJobId: job.batchJobId,
        postProcessJobId: job.id,
        userId: job.userId,
        stage: 'POST_PROCESSING',
        message: '批次完成后刷新用户前置阈值指标',
        data: {
          sportTypes,
          recomputeFrom: row.recomputeFrom?.toISOString() ?? null,
          recomputeTo: row.recomputeTo?.toISOString() ?? null,
        },
      });
      // 前置刷新，
      if (sportTypes.length > 0) {
        await this.fitnessOrchestrator.refreshUserFitnessProfilePre(
          job.userId,
          sportTypes,
          fitnessScope,
        );
      }

      // 轻度分析已写入各活动 VO2Max；批次聚合用户全局 VO2Max，供重度配速区间（Daniels 等）使用。
      this.logImportPipelineEvent({
        batchJobId: job.batchJobId,
        postProcessJobId: job.id,
        userId: job.userId,
        stage: 'POST_PROCESSING',
        message: '聚合用户全局 VO2Max（供重度配速区间）',
      });
      if (sportTypes.length > 0) {
        await this.fitnessOrchestrator.refreshUserFitnessProfilePost(
          job.userId,
          fitnessScope,
        );
      }

      // 跑第二段重度指标，依赖用户阈值与分区配置
      const heavyActivityIds = await this.runBatchHeavyMetrics({
        batchJobId: job.batchJobId,
        userId: job.userId,
        postProcessJobId: job.id,
      });

      // LIGHT 阶段已经生成 Peak Pace，但同一用户的多个导入批次可能并发
      // 进入 ANALYZING。前置刷新只允许读取 READY 活动和当前批次，因此每个
      // 批次都可能只看到自己的峰值，无法凑齐跨活动的 CS 拟合样本。当前批次
      // HEAVY 完成并标记 READY 后再做一次全 READY 范围收敛；最后完成的批次
      // 会看到此前已完成的批次，并把 TP/CS 和全局 VO2Max 正确落库。
      if (heavyActivityIds.length > 0 && sportTypes.length > 0) {
        this.logImportPipelineEvent({
          batchJobId: job.batchJobId,
          postProcessJobId: job.id,
          userId: job.userId,
          stage: 'POST_PROCESSING',
          message: '活动就绪后收敛刷新用户阈值与全局能力指标',
          data: { sportTypes, activityCount: heavyActivityIds.length },
        });
        await this.fitnessOrchestrator.refreshUserFitnessProfilePre(
          job.userId,
          sportTypes,
        );
        await this.fitnessOrchestrator.refreshUserFitnessProfilePost(
          job.userId,
        );
      }

      this.logImportPipelineEvent({
        batchJobId: job.batchJobId,
        postProcessJobId: job.id,
        userId: job.userId,
        stage: 'POST_PROCESSING',
        message: '开始刷新 PMC',
        data: {
          recomputeFrom: row.recomputeFrom?.toISOString() ?? null,
          recomputeTo: row.recomputeTo?.toISOString() ?? null,
        },
      });

      // 判断是否更新 PMC
      if (row.recomputeFrom) {
        const importRangeEnd = row.recomputeTo ?? new Date();
        const currentPMCEnd = dayjs().add(1, 'day').endOf('day').toDate();
        const pmcEndDate = dayjs(importRangeEnd).isAfter(currentPMCEnd)
          ? importRangeEnd
          : currentPMCEnd;

        await emitPmcInvalidate(this.events, job.userId, {
          startDate: row.recomputeFrom,
          endDate: pmcEndDate,
        });
      }
      // 由实例功能策略决定是否自动触发活动 AI 复盘。
      await this.runBatchAiReviewWhenAllowed({
        batchJobId: job.batchJobId,
        userId: job.userId,
        postProcessJobId: job.id,
        activityIds: heavyActivityIds,
      });
      // 判断是否批量同步到第三方平台
      const exportOutcome = await this.runBatchThirdPartyExports({
        batchJobId: job.batchJobId,
        userId: job.userId,
        postProcessJobId: job.id,
        activityIds: heavyActivityIds,
      });
      // 发送批次完成通知
      await this.sendBatchNotification({
        batchJobId: job.batchJobId,
        userId: job.userId,
        exportOutcome,
      });
      // 原子写入 post-process 与 batch 最终状态；租约已转移时整个事务回滚。
      await this.completeClaimedJob(
        job,
        await this.resolveFinalBatchStatus(job.batchJobId),
      );

      this.logImportPipelineEvent({
        batchJobId: job.batchJobId,
        postProcessJobId: job.id,
        userId: job.userId,
        stage: 'NOTIFYING',
        message: '后处理已完成并已发送批次通知',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const attempts = await this.failClaimedJob(job, msg);
      if (attempts == null) {
        this.logger.warn(
          `[用户后处理] 失败结果未写入：租约已转移，job=${job.id}`,
        );
        return;
      }
      const maxAttempts =
        this.configService.get<number>('userPostProcessWorker.maxAttempts') ??
        6;

      this.logImportPipelineEvent({
        batchJobId: job.batchJobId,
        postProcessJobId: job.id,
        userId: job.userId,
        stage: 'FAILED',
        message: msg,
        level: 'ERROR',
      });

      if (attempts >= maxAttempts) {
        await this.importJobs.postProcessJobs().update({
          where: { id: job.id },
          data: {
            status: 'DEAD',
            completedAt: new Date(),
            lockToken: null,
            leaseExpiresAt: null,
          },
        });
        const batch = await this.importJobs.batchJobs().findUnique({
          where: { id: job.batchJobId },
          select: { successCount: true },
        });
        if (batch) {
          await this.importJobs.batchJobs().update({
            where: { id: job.batchJobId },
            data: {
              status: batch.successCount > 0 ? 'PARTIAL_FAILED' : 'FAILED',
              completedAt: new Date(),
            },
          });
        }
        const failedActivityItems = await this.importJobs.itemJobs().findMany({
          where: {
            batchJobId: job.batchJobId,
            userId: job.userId,
            status: 'DONE',
            activityId: { not: null },
            analysisRequired: true,
          },
          select: { activityId: true },
        });
        const failedActivityIds = Array.from(
          new Set(
            failedActivityItems
              .map((item) => item.activityId)
              .filter((id: unknown): id is number => typeof id === 'number'),
          ),
        ) as number[];
        if (failedActivityIds.length > 0) {
          await this.prisma.activity.updateMany({
            where: {
              id: { in: failedActivityIds },
              processingStatus: { not: 'READY' },
            },
            data: {
              processingStatus: 'FAILED',
              processingUpdatedAt: new Date(),
              readyAt: null,
            },
          });
        }
      } else {
        await this.importJobs.postProcessJobs().update({
          where: { id: job.id },
          data: { availableAt: new Date(Date.now() + backoffMs(attempts)) },
        });
      }
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async resolveFinalBatchStatus(batchJobId: string) {
    // 后处理完成后再根据 item 计数写最终批次状态，保证前端整体完成判断稳定。
    const batch = await this.importJobs.batchJobs().findUnique({
      where: { id: batchJobId },
      select: { failedCount: true, successCount: true },
    });
    if (!batch) return 'FAILED' as const;
    if (batch.failedCount > 0 && batch.successCount > 0)
      return 'PARTIAL_FAILED' as const;
    if (batch.failedCount > 0 && batch.successCount === 0)
      return 'FAILED' as const;
    return 'COMPLETED' as const;
  }

  private async drain() {
    // 单实例内用 draining 防重入；并发只在当前抢到的一批 job 内发生。
    if (this.stopping || this.draining) return;
    this.draining = true;
    const batchSize =
      this.configService.get<number>('userPostProcessWorker.batchSize') ?? 5;
    const concurrency =
      this.configService.get<number>('userPostProcessWorker.concurrency') ?? 1;
    const progress = new WorkerDrainProgress(
      this.logger,
      '用户后处理队列',
      async () => ({
        remaining: await this.importJobs.postProcessJobs().count({
          where: {
            status: { in: ['PENDING', 'FAILED', 'RUNNING'] },
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
              const current = batch[idx]!;
              const batchPosition = idx + 1;
              idx += 1;
              await progress.run({
                batchPosition,
                batchTotal: batch.length,
                details: `批次ID=${current.batchJobId} 后处理ID=${current.id} 用户ID=${current.userId}`,
                task: () => this.processJob(current),
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
