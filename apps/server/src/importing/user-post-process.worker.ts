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
import { ChronologicalActivityReplayService } from '@/analyze/chronological-activity-replay.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { ActivityService } from '@/api/activity/activity.service';
import { UserService } from '@/api/user/user.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { ThirdPartyAutoExportOrchestratorService } from '@/workers/third-party-auto-export-orchestrator.service';
import { WorkerDrainProgress } from '@/workers/worker-drain-progress';
import { Prisma, SportType, type ImportPipelineStage } from '@prisma/client';
import { randomUUID } from 'node:crypto';
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

function replayCheckpointEffectiveFrom(value: unknown): Date | null {
  const raw = jsonRecord(value).nextEffectiveFrom;
  if (typeof raw !== 'string') return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function checkpointInstant(value: unknown, key: string): Date | null {
  const raw = jsonRecord(value)[key];
  if (typeof raw !== 'string') return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/** 本任务自己的分页或未冲掉的 PMC 窗口必须接着跑，不能当成已被兄弟任务覆盖。 */
function hasOwnReplayCursor(value: unknown) {
  const record = jsonRecord(value);
  return (
    typeof record.nextEffectiveFrom === 'string' ||
    typeof record.pendingPmcRecomputeFrom === 'string' ||
    typeof record.pendingPmcRecomputeTo === 'string'
  );
}

/**
 * 兄弟任务写入的水位：一次已完成的顺序重放覆盖了
 * [replaySatisfiedFrom, replaySatisfiedThrough]。
 */
function replayWindowCovered(args: {
  checkpoint: unknown;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}) {
  if (hasOwnReplayCursor(args.checkpoint)) return false;
  const from = checkpointInstant(args.checkpoint, 'replaySatisfiedFrom');
  const through = checkpointInstant(args.checkpoint, 'replaySatisfiedThrough');
  if (!from || !through || !args.effectiveFrom || !args.effectiveTo)
    return false;
  return (
    from.getTime() <= args.effectiveFrom.getTime() &&
    args.effectiveTo.getTime() <= through.getTime()
  );
}

function postProcessClaimableSql(alias: string) {
  return `(
    (${alias}.status IN ('PENDING','FAILED') AND ${alias}.available_at <= $1)
    OR (
      ${alias}.status = 'RUNNING'
      AND (${alias}.lease_expires_at IS NULL OR ${alias}.lease_expires_at <= $1)
    )
  )`;
}

function postProcessBatchReadySql(batchIdSql: string) {
  return `EXISTS (
    SELECT 1 FROM t_import_batch_job b
    WHERE b.id = ${batchIdSql}
      AND (SELECT COUNT(*) FROM t_import_item_job i WHERE i.batch_job_id = b.id) >= b.total_count
      AND NOT EXISTS (
        SELECT 1 FROM t_import_item_job i
        WHERE i.batch_job_id = b.id AND i.status NOT IN ('DONE','SKIPPED','DEAD')
      )
  )`;
}

const TERMINAL_IMPORT_ITEM_STATUSES = ['DONE', 'SKIPPED', 'DEAD'] as const;

type ReadySiblingPostProcessJob = {
  id: string;
  batchJobId: string;
  recomputeFrom: Date | null;
  recomputeTo: Date | null;
  replayCheckpoint: unknown;
  batchJob: {
    totalCount: number;
    _count: { items: number };
    items: Array<{ id: string }>;
  } | null;
};

type ThirdPartyExportOutcome = {
  failedProviders: string[];
  failedCount: number;
};

type ImportPostProcessPolicy = {
  suppressAutomaticAiReview: boolean;
  suppressAthleteStateReassessment: boolean;
  suppressThirdPartyExport: boolean;
};

/**
 * 维护/补数据批次仍需重算指标与 PMC，但不得再次触发面向用户的 AI 与外部回写。
 * 只有显式 true 才关闭副作用，普通导入保持既有行为。
 */
export function importPostProcessPolicy(
  requestContext: unknown,
): ImportPostProcessPolicy {
  const context = jsonRecord(requestContext);
  return {
    suppressAutomaticAiReview: context.suppressAutomaticAiReview === true,
    suppressAthleteStateReassessment:
      context.suppressAthleteStateReassessment === true,
    suppressThirdPartyExport: context.suppressThirdPartyExport === true,
  };
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
    private readonly chronologicalReplay: ChronologicalActivityReplayService,
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
    // 同一用户同时只领一条。已有未过期 RUNNING 时整户跳过；多条可领时只锁最早的一条。
    // 两个副本会抢这同一行，SKIP LOCKED 不会把该用户的另一条也标成 RUNNING。
    // 其它用户的最早一条仍可在同一批里并行领取。过期 RUNNING 仍可被原任务重新认领。
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
        SELECT j.id
        FROM t_user_post_process_job j
        WHERE ${postProcessClaimableSql('j')}
          AND ${postProcessBatchReadySql('j.batch_job_id')}
          AND NOT EXISTS (
            SELECT 1
            FROM t_user_post_process_job running
            WHERE running.user_id = j.user_id
              AND running.id <> j.id
              AND running.status = 'RUNNING'
              AND running.lease_expires_at IS NOT NULL
              AND running.lease_expires_at > $1
          )
          AND NOT EXISTS (
            SELECT 1
            FROM t_user_post_process_job earlier
            WHERE earlier.user_id = j.user_id
              AND earlier.id <> j.id
              AND ${postProcessClaimableSql('earlier')}
              AND ${postProcessBatchReadySql('earlier.batch_job_id')}
              AND (
                earlier.created_at < j.created_at
                OR (earlier.created_at = j.created_at AND earlier.id < j.id)
              )
          )
        ORDER BY j.created_at ASC, j.id ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE t_user_post_process_job j
      SET status='RUNNING',
          started_at=COALESCE(j.started_at, $1),
          lock_token=$3,
          lease_expires_at=$4,
          updated_at=$1
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
  }): Promise<number[]> {
    const doneItems = await this.importJobs.itemJobs().findMany({
      where: {
        batchJobId: args.batchJobId,
        userId: args.userId,
        status: 'DONE',
        activityId: { not: null },
        analysisRequired: true,
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
   * 顺序重放按用户时间轴读取全部活动，不按 affectedSportTypes 裁剪。
   * 同用户其它已就绪批次只把起点前移，并把它尚未 READY 的活动并进同一次重放。
   */
  private async expandReplayWithReadySiblings(args: {
    jobId: string;
    userId: string;
    effectiveFrom: Date;
    activityIds: number[];
  }) {
    const siblings = await this.listCoalescibleSiblingJobs(
      args.userId,
      args.jobId,
    );
    let effectiveFrom = args.effectiveFrom;
    const activityIds = new Set(args.activityIds);
    const covered: ReadySiblingPostProcessJob[] = [];
    for (const sibling of siblings) {
      const siblingFrom = sibling.recomputeFrom;
      if (!siblingFrom) continue;
      if (siblingFrom.getTime() < effectiveFrom.getTime()) {
        effectiveFrom = siblingFrom;
      }
      const siblingActivityIds = await this.getBatchAnalysisActivityIds({
        batchJobId: sibling.batchJobId,
        userId: args.userId,
      });
      for (const activityId of siblingActivityIds) activityIds.add(activityId);
      covered.push(sibling);
    }
    return {
      effectiveFrom,
      activityIds: Array.from(activityIds),
      siblings: covered.filter(
        (sibling) =>
          sibling.recomputeFrom != null &&
          sibling.recomputeFrom.getTime() >= effectiveFrom.getTime(),
      ),
    };
  }

  private async listCoalescibleSiblingJobs(userId: string, jobId: string) {
    const rows = (await this.importJobs.postProcessJobs().findMany({
      where: {
        userId,
        id: { not: jobId },
        status: { in: ['PENDING', 'FAILED'] },
        availableAt: { lte: new Date() },
      },
      select: {
        id: true,
        batchJobId: true,
        recomputeFrom: true,
        recomputeTo: true,
        replayCheckpoint: true,
        batchJob: {
          select: {
            totalCount: true,
            _count: { select: { items: true } },
            items: {
              where: {
                status: { notIn: [...TERMINAL_IMPORT_ITEM_STATUSES] },
              },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })) as ReadySiblingPostProcessJob[];
    return rows.filter((row) => {
      const batch = row.batchJob;
      if (!batch) return false;
      if (batch._count.items < batch.totalCount || batch.items.length > 0) {
        return false;
      }
      if (hasOwnReplayCursor(row.replayCheckpoint)) return false;
      if (
        replayWindowCovered({
          checkpoint: row.replayCheckpoint,
          effectiveFrom: row.recomputeFrom,
          effectiveTo: row.recomputeTo ?? row.recomputeFrom,
        })
      ) {
        return false;
      }
      return row.recomputeFrom != null;
    });
  }

  private async markSiblingReplaysSatisfied(args: {
    userId: string;
    sourceJobId: string;
    effectiveFrom: Date;
    satisfiedThrough: Date;
    siblings: ReadySiblingPostProcessJob[];
  }) {
    const satisfiedFrom = args.effectiveFrom.toISOString();
    const satisfiedThrough = args.satisfiedThrough.toISOString();
    for (const sibling of args.siblings) {
      const siblingFrom = sibling.recomputeFrom;
      const siblingTo = sibling.recomputeTo ?? siblingFrom;
      if (
        !siblingFrom ||
        !siblingTo ||
        siblingFrom.getTime() < args.effectiveFrom.getTime() ||
        siblingTo.getTime() > args.satisfiedThrough.getTime()
      ) {
        continue;
      }
      await this.importJobs.postProcessJobs().updateMany({
        where: {
          id: sibling.id,
          userId: args.userId,
          status: { in: ['PENDING', 'FAILED'] },
        },
        data: {
          replayCheckpoint: {
            ...jsonRecord(sibling.replayCheckpoint),
            replaySatisfiedFrom: satisfiedFrom,
            replaySatisfiedThrough: satisfiedThrough,
            replaySatisfiedBy: args.sourceJobId,
          } as Prisma.InputJsonValue,
        },
      });
    }
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
          replayCheckpoint: true,
        },
      });
      if (!row) return;

      const batch = await this.importJobs.batchJobs().findUnique({
        where: { id: job.batchJobId },
        select: { requestContext: true },
      });
      const postProcessPolicy = importPostProcessPolicy(batch?.requestContext);

      const sportTypes = asSportTypes(row.affectedSportTypes);
      const batchAnalysisActivityIds = await this.getBatchAnalysisActivityIds({
        batchJobId: job.batchJobId,
        userId: job.userId,
      });
      const batchActivityRange = batchAnalysisActivityIds.length
        ? await this.prisma.activity.aggregate({
            where: { id: { in: batchAnalysisActivityIds } },
            _min: { startTime: true },
            _max: { startTime: true },
          })
        : null;
      const ownReplayFrom =
        replayCheckpointEffectiveFrom(row.replayCheckpoint) ??
        row.recomputeFrom ??
        batchActivityRange?._min.startTime ??
        null;
      const ownReplayTo =
        row.recomputeTo ?? batchActivityRange?._max.startTime ?? ownReplayFrom;
      // 新导入的历史活动可能改变滚动指标，并继续影响批次之后已经存在的活动。
      // recomputeTo 只保留原批次审计范围，正确性重放必须检查完整后缀。
      const heavyActivityIds = batchAnalysisActivityIds;
      const replayCovered = replayWindowCovered({
        checkpoint: row.replayCheckpoint,
        effectiveFrom: ownReplayFrom,
        effectiveTo: ownReplayTo,
      });
      const continueOwnCursor = hasOwnReplayCursor(row.replayCheckpoint);
      let replayFrom = ownReplayFrom;
      let replayActivityIds = batchAnalysisActivityIds;
      let coalescedSiblings: ReadySiblingPostProcessJob[] = [];
      if (
        !replayCovered &&
        !continueOwnCursor &&
        ownReplayFrom &&
        batchAnalysisActivityIds.length > 0
      ) {
        const expanded = await this.expandReplayWithReadySiblings({
          jobId: job.id,
          userId: job.userId,
          effectiveFrom: ownReplayFrom,
          activityIds: batchAnalysisActivityIds,
        });
        replayFrom = expanded.effectiveFrom;
        replayActivityIds = expanded.activityIds;
        coalescedSiblings = expanded.siblings;
      }

      if (replayCovered) {
        this.logImportPipelineEvent({
          batchJobId: job.batchJobId,
          postProcessJobId: job.id,
          userId: job.userId,
          stage: 'POST_PROCESSING',
          message: '同用户顺序重放已覆盖本批次窗口，跳过重复重放',
          data: {
            sportTypes,
            recomputeFrom: row.recomputeFrom?.toISOString() ?? null,
            recomputeTo: row.recomputeTo?.toISOString() ?? null,
            replaySatisfiedFrom:
              checkpointInstant(
                row.replayCheckpoint,
                'replaySatisfiedFrom',
              )?.toISOString() ?? null,
            replaySatisfiedThrough:
              checkpointInstant(
                row.replayCheckpoint,
                'replaySatisfiedThrough',
              )?.toISOString() ?? null,
          },
        });
      } else if (replayFrom && batchAnalysisActivityIds.length > 0) {
        this.logImportPipelineEvent({
          batchJobId: job.batchJobId,
          postProcessJobId: job.id,
          userId: job.userId,
          stage: 'POST_PROCESSING',
          message: '按活动时间顺序重放用户指标与重度分析',
          data: {
            sportTypes,
            recomputeFrom: row.recomputeFrom?.toISOString() ?? null,
            recomputeTo: row.recomputeTo?.toISOString() ?? null,
            effectiveFrom: replayFrom.toISOString(),
            coalescedSiblingCount: coalescedSiblings.length,
          },
        });
      }
      if (!replayCovered && replayFrom && batchAnalysisActivityIds.length > 0) {
        const effectiveFrom = replayFrom;
        const replayTo = new Date();
        const replayResult = await this.chronologicalReplay.replay({
          userId: job.userId,
          sourceJobType: 'USER_POST_PROCESS',
          sourceJobId: job.id,
          effectiveFrom,
          effectiveTo: replayTo,
          includeActivityIds: replayActivityIds,
          maxActivities: 100,
          sourceLockToken: job.lockToken,
          suppressAthleteStateReassessment:
            postProcessPolicy.suppressAthleteStateReassessment,
        });
        if (!replayResult.completed) {
          const yielded = await this.importJobs.postProcessJobs().updateMany({
            where: {
              id: job.id,
              status: 'RUNNING',
              ...(job.lockToken ? { lockToken: job.lockToken } : {}),
            },
            data: {
              status: 'PENDING',
              availableAt: new Date(Date.now() + 1_000),
              lockToken: null,
              leaseExpiresAt: null,
              lastError: null,
            },
          });
          if (yielded.count !== 1) {
            throw new Error(`User post-process lease lost: ${job.id}`);
          }
          this.logImportPipelineEvent({
            batchJobId: job.batchJobId,
            postProcessJobId: job.id,
            userId: job.userId,
            stage: 'POST_PROCESSING',
            message: '顺序重放已保存分页 checkpoint，任务主动让出',
            data: {
              processedActivities: replayResult.processedActivities,
              nextCheckpoint: replayResult.nextCheckpoint,
            },
          });
          return;
        }
        await this.markSiblingReplaysSatisfied({
          userId: job.userId,
          sourceJobId: job.id,
          effectiveFrom,
          satisfiedThrough: replayTo,
          siblings: coalescedSiblings,
        });
        if (
          heavyActivityIds.length > 0 &&
          !postProcessPolicy.suppressAthleteStateReassessment
        ) {
          await emitAthleteStateReassessRequested(this.events, {
            userId: job.userId,
            triggerType: 'ACTIVITY_READY',
            triggerRef: job.id,
          });
        }
      }
      // 由实例功能策略与维护批次策略共同决定是否自动触发活动 AI 复盘。
      if (postProcessPolicy.suppressAutomaticAiReview) {
        this.logImportPipelineEvent({
          batchJobId: job.batchJobId,
          postProcessJobId: job.id,
          userId: job.userId,
          stage: 'NOTIFYING',
          message: '维护批次已关闭自动活动 AI 复盘',
        });
      } else {
        await this.runBatchAiReviewWhenAllowed({
          batchJobId: job.batchJobId,
          userId: job.userId,
          postProcessJobId: job.id,
          activityIds: heavyActivityIds,
        });
      }
      // 判断是否批量同步到第三方平台
      const exportOutcome = postProcessPolicy.suppressThirdPartyExport
        ? { failedProviders: [], failedCount: 0 }
        : await this.runBatchThirdPartyExports({
            batchJobId: job.batchJobId,
            userId: job.userId,
            postProcessJobId: job.id,
            activityIds: heavyActivityIds,
          });
      if (postProcessPolicy.suppressThirdPartyExport) {
        this.logImportPipelineEvent({
          batchJobId: job.batchJobId,
          postProcessJobId: job.id,
          userId: job.userId,
          stage: 'POST_PROCESSING',
          message: '维护批次已关闭第三方活动回写',
        });
      }
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
      if (msg === 'ACTIVITY_ANALYSIS_CAPACITY_UNAVAILABLE') {
        await this.importJobs.postProcessJobs().updateMany({
          where: {
            id: job.id,
            status: 'RUNNING',
            ...(job.lockToken ? { lockToken: job.lockToken } : {}),
          },
          data: {
            status: 'PENDING',
            availableAt: new Date(Date.now() + 5_000),
            lockToken: null,
            leaseExpiresAt: null,
            lastError: null,
          },
        });
        this.logger.log(
          `[用户后处理] 全局重放容量已满，任务让出且不计失败 job=${job.id}`,
        );
        return;
      }
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
