import { Injectable, Logger, Optional } from '@nestjs/common';
import { AiUsageKind, Prisma, SportType } from '@prisma/client';
import type { ReviewDigestType } from './review-types';
import { I18nService } from 'nestjs-i18n';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import {
  LoadReadoutService,
  type LoadSourceKey,
} from '@/api/activity/load-readout.service';
import { ReviewDigestRepository } from './persistence/review-digest.repository';
import {
  getCoachBaseUrlForLog,
  getCoachModel,
  getCoachUpstreamProvider,
} from '@/api/ai/core/coach-upstream.adapter';
import {
  REVIEW_DIGEST_PROMPT_VERSION,
  buildReviewDigestMessages,
  reviewReportAnalysisSchema,
  type ReviewDigestCoachingContext,
  type ReviewDigestHighlight,
  type ReviewReportAnalysis,
} from '@/api/ai/core/prompt-contracts/review-digest.contract';
import { ActivityAiReviewService } from '@/api/activity/activity-ai-review.service';
import { HealthDataQueryService } from '@/health-data/health-data-query.service';
import { healthLocalDateKey } from '@/health-data/health-local-day';
import { resolveActivityCalendarDayStr } from '@/api/plan/plan-link-calendar.util';
import { completedReviewWindow } from './review-date-window';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { ReviewDigestContextService } from './review-digest-context.service';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
import {
  ReviewModelCallGuard,
  isReviewModelDeferredError,
  isReviewConsentRequiredError,
} from './review-model-call-guard';
import { AiService } from '@/api/ai/ai.service';
import {
  buildReviewReportTraining,
  renderReviewReport,
  type ReviewReportActivity,
  type ReviewReportTraining,
} from './review-report';
import {
  reviewRecoveryWindow,
  summarizeReviewRecovery,
  type ReviewRecoveryRow,
} from './review-recovery';

type AggregatedActivity = {
  id: number;
  hashId: string;
  sportType: string | null;
  startTime: Date | null;
  timezone: string | null;
  timerTime: number | null;
  elapsedTime: number | null;
  distance: number | null;
  activityName: string | null;
  cogganBikeStress: number | null;
  actualLoad: number | null;
  actualLoadSource: LoadSourceKey | null;
};

type NormalizedSportType = 'RUN' | 'CYCLING' | 'SWIM' | 'UNKNOWN';

type TotalsBySport = Record<
  NormalizedSportType,
  { sessions: number; durationSec: number; distanceM: number; tss: number }
>;

type AggregatedTotals = {
  totalSessions: number;
  totalDurationSec: number;
  totalDistanceM: number;
  totalTss: number;
  totalLoad: number | null;
  loadSamples: number;
  bySport: TotalsBySport;
};

type HighlightItem = {
  activityId: number;
  sportType: NormalizedSportType;
  startTime: Date | null;
  durationSec: number | null;
  distanceM: number | null;
  tss: number | null;
  title: string | null;
  load?: number | null;
  loadSource?: LoadSourceKey | null;
  rank: number;
};

type AggregateWindowArgs = {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
};

type AggregateWindowResult = {
  activities: AggregatedActivity[];
  totals: AggregatedTotals;
  highlights: HighlightItem[];
};

type WriteSnapshotAndDetailsArgs = {
  digestId: string;
  timezone?: string | null;
  totals: AggregatedTotals;
  highlights: HighlightItem[];
};

type GenerateAiSummaryArgs = {
  userId: string;
  type: ReviewDigestType;
  lang: string;
  periodStart: Date;
  periodEnd: Date;
  timezone: string;
  totals: AggregatedTotals;
  highlights: Array<ReviewDigestHighlight & { activityId?: number }>;
  coachingContext?: ReviewDigestCoachingContext | null;
  training?: ReviewReportTraining;
  recovery?: ReviewRecoveryRow[];
};

type EnsureDigestForJobArgs = {
  jobId: string;
  userId: string;
  type: ReviewDigestType;
  periodStart: Date;
  periodEnd: Date;
  timezone?: string | null;
};

type FinalizeDigestContentArgs = {
  digestId: string;
  userId: string;
  type: ReviewDigestType;
  lang: string;
  periodStart: Date;
  periodEnd: Date;
  timezone?: string | null;
};

@Injectable()
export class ReviewDigestService {
  private readonly logger = new Logger(ReviewDigestService.name);
  constructor(
    private readonly notificationDomain: NotificationDomainService,
    private readonly i18n: I18nService,
    private readonly activities: ActivityReadService,
    private readonly digests: ReviewDigestRepository,
    private readonly modelGuard: ReviewModelCallGuard,
    private readonly loadReadout: LoadReadoutService,
    @Optional() private readonly digestContext?: ReviewDigestContextService,
    @Optional() private readonly aiDataConsent?: AiDataConsentService,
    @Optional() private readonly ai?: AiService,
    @Optional() private readonly health?: HealthDataQueryService,
    @Optional() private readonly activityReviews?: ActivityAiReviewService,
  ) {}

  findManyByIdsForUser(userId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.digests.digests().findMany({
      where: { userId, id: { in: ids } },
      select: { id: true, periodStart: true, periodEnd: true },
    });
  }

  findUniqueAiSummary(id: string) {
    return this.digests.digests().findUnique({
      where: { id },
      select: { aiSummaryMarkdown: true, title: true },
    });
  }

  countCreatedBetween(start: Date, end: Date) {
    return this.digests.digests().count({
      where: { createdAt: { gte: start, lt: end } },
    });
  }

  private digestText(
    lang: string,
    key: string,
    args?: Record<string, string | number>,
  ) {
    const value = this.i18n.t(`common.notification.reviewDigest.${key}`, {
      lang,
      args,
    });
    return typeof value === 'string' ? value : key;
  }

  private digestSportLabel(lang: string, sportType: string) {
    if (sportType === 'UNKNOWN')
      return this.digestText(lang, 'report.otherSport');
    const key = `common.aiCoach.mutation.userFitnessMetric.sports.${sportType}`;
    const value = this.i18n.t(key, { lang });
    return typeof value === 'string' && value !== key ? value : sportType;
  }

  /**
   * 统一运动类型枚举口径。
   * - DB 里可能出现不同大小写/空值/未知值
   * - 这里先收敛为 4 类，避免下游统计字段爆炸
   */
  private normalizeSportType(s: string | null | undefined) {
    const v = String(s ?? '').toUpperCase();
    if (v === 'RUN') return 'RUN';
    if (v === 'CYCLING') return 'CYCLING';
    if (v === 'SWIM') return 'SWIM';
    return 'UNKNOWN';
  }

  /**
   * 解析活动时长（秒）。
   * 优先 timerTime（更接近“有效运动时间”）；若缺失则用 elapsedTime（包含暂停）。
   */
  private resolveDurationSec(
    a: Pick<AggregatedActivity, 'timerTime' | 'elapsedTime'>,
  ) {
    if (typeof a.timerTime === 'number' && Number.isFinite(a.timerTime))
      return a.timerTime;
    if (typeof a.elapsedTime === 'number' && Number.isFinite(a.elapsedTime))
      return a.elapsedTime;
    return null;
  }

  /**
   * 解析 TSS（目前仅自行车的 Coggan bikeStress）。
   * 注：跑步/游泳的负荷体系不同，因此 TSS 只作为可选指标。
   */
  private resolveTss(a: Pick<AggregatedActivity, 'cogganBikeStress'>) {
    if (
      typeof a.cogganBikeStress === 'number' &&
      Number.isFinite(a.cogganBikeStress)
    ) {
      return a.cogganBikeStress;
    }
    return null;
  }

  /** Read the full period in bounded pages and share the activity load readout. */
  async aggregateWindow(
    args: AggregateWindowArgs,
  ): Promise<AggregateWindowResult> {
    const where = readyActivityWhere({
      userId: args.userId,
      startTime: { gte: args.periodStart, lt: args.periodEnd },
    });
    const activities: AggregatedActivity[] = [];
    const pageSize = 500;
    let cursor: number | undefined;
    for (;;) {
      const rows = await this.activities.findMany({
        where,
        orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
        take: pageSize,
        ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          hashId: true,
          sportType: true,
          startTime: true,
          timezone: true,
          timerTime: true,
          elapsedTime: true,
          distance: true,
          activityName: true,
          coggan: { select: { bikeStress: true } },
        },
      });
      if (!rows.length) break;
      const loads = await this.loadReadout.batchGetActualLoad(
        rows.map(({ id }) => id),
      );
      for (const row of rows) {
        const load = loads.get(row.id);
        activities.push({
          id: row.id,
          hashId: row.hashId,
          sportType: row.sportType ?? null,
          startTime: row.startTime ?? null,
          timezone: row.timezone ?? null,
          timerTime: row.timerTime ?? null,
          elapsedTime: row.elapsedTime ?? null,
          distance: Number.isFinite(row.distance) ? row.distance : null,
          activityName: row.activityName ?? null,
          cogganBikeStress: row.coggan?.bikeStress ?? null,
          actualLoad: load?.actualLoad ?? null,
          actualLoadSource: load?.actualLoadSource ?? null,
        });
      }
      if (rows.length < pageSize) break;
      cursor = rows[rows.length - 1].id;
    }

    const bySport: TotalsBySport = {
      RUN: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
      CYCLING: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
      SWIM: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
      UNKNOWN: { sessions: 0, durationSec: 0, distanceM: 0, tss: 0 },
    };

    let totalSessions = 0;
    let totalDurationSec = 0;
    let totalDistanceM = 0;
    let totalTss = 0;
    let totalLoad = 0;
    let loadSamples = 0;

    for (const a of activities) {
      const sport = this.normalizeSportType(
        a.sportType,
      ) as keyof typeof bySport;
      bySport[sport].sessions += 1;
      totalSessions += 1;

      const dur = this.resolveDurationSec(a);
      if (dur != null) {
        bySport[sport].durationSec += dur;
        totalDurationSec += dur;
      }

      if (a.distance != null) {
        bySport[sport].distanceM += a.distance;
        totalDistanceM += a.distance;
      }

      const tss = this.resolveTss(a);
      if (tss != null) {
        bySport[sport].tss += tss;
        totalTss += tss;
      }

      if (a.actualLoad != null) {
        totalLoad += a.actualLoad;
        loadSamples += 1;
      }
    }

    const highlights = activities
      .map((a) => ({
        activityId: a.id,
        sportType: this.normalizeSportType(a.sportType) as
          | 'RUN'
          | 'CYCLING'
          | 'SWIM'
          | 'UNKNOWN',
        startTime: a.startTime,
        durationSec: this.resolveDurationSec(a),
        distanceM: a.distance,
        tss: this.resolveTss(a),
        load: a.actualLoad,
        loadSource: a.actualLoadSource,
        title: a.activityName,
        score:
          a.actualLoad ??
          this.resolveTss(a) ??
          (this.resolveDurationSec(a) ?? 0) / 60,
      }))
      .sort((x, y) => (y.score ?? 0) - (x.score ?? 0))
      .slice(0, 5)
      .map((x, idx) => ({ ...x, rank: idx + 1 }))
      .map(({ score: _score, ...rest }) => rest);

    return {
      activities,
      totals: {
        totalSessions,
        totalDurationSec,
        totalDistanceM,
        totalTss,
        bySport,
        totalLoad: loadSamples > 0 ? totalLoad : null,
        loadSamples,
      },
      highlights,
    };
  }

  /**
   * 将聚合结果写入“宽表 + 明细表”：
   * - `ReviewDigestSnapshot`：主要标量指标（upsert，幂等）
   * - `ReviewDigestTotalsBySport` / `ReviewDigestHighlightActivity`：列表型数据（deleteMany + createMany）
   *
   * 选择 delete+create 是为了让明细表与本次聚合结果严格一致，避免增量更新的差错。
   */
  async writeSnapshotAndDetails(args: WriteSnapshotAndDetailsArgs) {
    const { digestId, totals, highlights, timezone } = args;
    const snapshotOperation = this.digests.snapshots().upsert({
      where: { digestId },
      // prisma 类型在部分环境下可能滞后（schema 进化新增列后），这里用 any 避免被卡住；
      // 以运行时 schema 为准，TS 侧类型会在 prisma generate 后自动追上。
      create: {
        digestId,
        schemaVersion: 1,
        timezone: timezone ?? undefined,
        totalSessions: totals.totalSessions,
        totalDurationSec: totals.totalDurationSec,
        totalDistanceM: totals.totalDistanceM,
        totalTss: totals.totalTss,
        totalLoad: totals.totalLoad,
        runTotalSessions: totals.bySport.RUN.sessions,
        runTotalDurationSec: totals.bySport.RUN.durationSec,
        runTotalDistanceM: totals.bySport.RUN.distanceM,
        runTotalTss: totals.bySport.RUN.tss,
        cyclingTotalSessions: totals.bySport.CYCLING.sessions,
        cyclingTotalDurationSec: totals.bySport.CYCLING.durationSec,
        cyclingTotalDistanceM: totals.bySport.CYCLING.distanceM,
        cyclingTotalTss: totals.bySport.CYCLING.tss,
        swimTotalSessions: totals.bySport.SWIM.sessions,
        swimTotalDurationSec: totals.bySport.SWIM.durationSec,
        swimTotalDistanceM: totals.bySport.SWIM.distanceM,
        swimTotalTss: totals.bySport.SWIM.tss,
      } satisfies Prisma.ReviewDigestSnapshotUncheckedCreateInput,
      update: {
        timezone: timezone ?? undefined,
        totalSessions: totals.totalSessions,
        totalDurationSec: totals.totalDurationSec,
        totalDistanceM: totals.totalDistanceM,
        totalTss: totals.totalTss,
        totalLoad: totals.totalLoad,
        runTotalSessions: totals.bySport.RUN.sessions,
        runTotalDurationSec: totals.bySport.RUN.durationSec,
        runTotalDistanceM: totals.bySport.RUN.distanceM,
        runTotalTss: totals.bySport.RUN.tss,
        cyclingTotalSessions: totals.bySport.CYCLING.sessions,
        cyclingTotalDurationSec: totals.bySport.CYCLING.durationSec,
        cyclingTotalDistanceM: totals.bySport.CYCLING.distanceM,
        cyclingTotalTss: totals.bySport.CYCLING.tss,
        swimTotalSessions: totals.bySport.SWIM.sessions,
        swimTotalDurationSec: totals.bySport.SWIM.durationSec,
        swimTotalDistanceM: totals.bySport.SWIM.distanceM,
        swimTotalTss: totals.bySport.SWIM.tss,
      } satisfies Prisma.ReviewDigestSnapshotUncheckedUpdateInput,
      select: { id: true },
    });

    // totals by sport
    const sportRows = [
      { sportType: 'RUN' as const, v: totals.bySport.RUN },
      { sportType: 'CYCLING' as const, v: totals.bySport.CYCLING },
      { sportType: 'SWIM' as const, v: totals.bySport.SWIM },
      { sportType: 'UNKNOWN' as const, v: totals.bySport.UNKNOWN },
    ].filter((x) => x.v.sessions > 0);

    const replacementOperations = [
      snapshotOperation,
      this.digests.totalsBySport().deleteMany({
        where: { digestId },
      }),
    ];
    if (sportRows.length) {
      replacementOperations.push(
        this.digests.totalsBySport().createMany({
          data: sportRows.map((r) => ({
            digestId,
            sportType: r.sportType as SportType,
            sessions: r.v.sessions,
            durationSec: r.v.durationSec,
            distanceM: r.v.distanceM,
            tss: r.v.tss,
          })),
        }),
      );
    }

    replacementOperations.push(
      this.digests.highlightActivities().deleteMany({
        where: { digestId },
      }),
    );
    if (highlights.length) {
      replacementOperations.push(
        this.digests.highlightActivities().createMany({
          data: highlights.map((h) => ({
            digestId,
            rank: h.rank,
            activityId: h.activityId,
            sportType: h.sportType as SportType,
            startTime: h.startTime ?? undefined,
            durationSec: h.durationSec ?? undefined,
            distanceM: h.distanceM ?? undefined,
            tss: h.tss ?? undefined,
            title: h.title ?? undefined,
          })),
        }),
      );
    }
    await this.digests.transaction(replacementOperations);
  }

  /**
   * AI 开关：用于整体开启/关闭复盘 AI（失败时会自动降级为规则版）。
   */
  private isAiEnabled() {
    return (process.env.REVIEW_AI_ENABLED ?? 'true') === 'true';
  }

  /** Preserve the existing review-specific model override on the unified Agent runtime. */
  private getReviewModel() {
    return String(process.env.REVIEW_AI_MODEL ?? '').trim() || getCoachModel();
  }

  /** Generate optional coach findings without delegating the report tables. */
  async generateAiAnalysis(args: GenerateAiSummaryArgs): Promise<{
    analysis: ReviewReportAnalysis;
    model: string;
    promptVersion: string;
    activityExcerpts: Map<number, string>;
  } | null> {
    if (!this.isAiEnabled()) return null;
    if (!this.ai) return null;
    if (
      !this.aiDataConsent ||
      !(await this.aiDataConsent.isGranted(args.userId))
    ) {
      this.logger.debug('[复盘][AI][跳过] reason=AI_DATA_CONSENT_REQUIRED');
      return null;
    }
    const provider = getCoachUpstreamProvider();
    if (!provider) return null;
    const model = this.getReviewModel();
    if (!model) return null;

    try {
      const analysisExcerpts = await this.loadActivityReviewExcerpts(args);
      const messages = buildReviewDigestMessages({
        type: args.type,
        lang: args.lang,
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
        timezone: args.timezone,
        totals: args.totals,
        highlights: args.highlights.map((highlight) => ({
          ...highlight,
          analysisExcerpt: analysisExcerpts.get(highlight.activityId ?? 0),
        })),
        coachingContext: args.coachingContext,
        training: args.training,
        recovery: args.recovery,
        delivery: 'agent-tool',
      });
      const task = await this.modelGuard.run(
        `digest:${args.type}`,
        (signal) =>
          this.ai!.runBackgroundCoachTask<ReviewReportAnalysis>({
            userId: args.userId,
            lang: args.lang,
            taskType: `REVIEW_DIGEST_${args.type}`,
            funding: 'PLATFORM',
            activeSkillName: 'period-review',
            triggerType: 'REVIEW_DIGEST',
            triggerRef: `${args.periodStart.toISOString()}:${args.periodEnd.toISOString()}`,
            model,
            signal,
            usageKind:
              args.type === 'DAILY'
                ? AiUsageKind.REVIEW_DAILY
                : args.type === 'WEEKLY'
                  ? AiUsageKind.REVIEW_WEEKLY
                  : AiUsageKind.REVIEW_MONTHLY,
            instructions: messages
              .map(
                (message) =>
                  `${message.role.toUpperCase()}_TASK_DATA_BEGIN\n${message.content}\n${message.role.toUpperCase()}_TASK_DATA_END`,
              )
              .join('\n\n'),
            validateResult: (raw) => reviewReportAnalysisSchema.parse(raw),
          }),
        {
          failureReason: (result) =>
            !result.usage.reported
              ? 'usage_missing'
              : result.result.headline.trim()
                ? null
                : 'empty_response',
        },
      );

      if (!task.result.headline.trim()) return null;
      return {
        analysis: task.result,
        activityExcerpts: analysisExcerpts,
        model: task.model,
        promptVersion: REVIEW_DIGEST_PROMPT_VERSION,
      };
    } catch (e) {
      if (isReviewModelDeferredError(e)) throw e;
      if (isReviewConsentRequiredError(e)) {
        this.logger.debug(
          '[review-digest] skipped code=AI_DATA_CONSENT_REQUIRED',
        );
        return null;
      }
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `[复盘][AI] 生成摘要失败，将降级为规则版：provider=${provider} baseURL=${getCoachBaseUrlForLog(provider)} error=${msg}`,
      );
      return null;
    }
  }

  /**
   * 保障某个 job 对应的 digest 存在（幂等 upsert）。
   * 说明：
   * - digest 以 (userId,type,periodStart,periodEnd) 做唯一口径
   * - snapshot 在 create 时一起建；update 时仅在传入 timezone 时同步更新
   */
  async ensureDigestForJob(
    args: EnsureDigestForJobArgs,
  ): Promise<{ digestId: string }> {
    const { jobId, userId, type, periodStart, periodEnd, timezone } = args;

    const digest = await this.digests.digests().upsert({
      where: {
        userId_type_periodStart_periodEnd: {
          userId,
          type,
          periodStart,
          periodEnd,
        },
      },
      create: {
        userId,
        type,
        periodStart,
        periodEnd,
        jobId,
        inputSchemaVersion: 1,
        title:
          type === 'DAILY'
            ? 'Daily review'
            : type === 'WEEKLY'
              ? 'Weekly review'
              : 'Monthly review',
        snapshot: {
          create: {
            schemaVersion: 1,
            timezone: timezone ?? undefined,
          },
        },
      },
      update: {
        jobId,
        snapshot: timezone
          ? {
              upsert: {
                create: { schemaVersion: 1, timezone },
                update: { timezone },
              },
            }
          : undefined,
      },
      select: { id: true },
    });

    return { digestId: digest.id };
  }

  /**
   * 生成并落库 digest 内容（聚合 -> 写快照/明细 -> AI/规则摘要 -> 更新通知正文）。
   * 该方法不负责创建通知（由 worker 决定是否创建/何时创建）。
   */
  async finalizeDigestContent(args: FinalizeDigestContentArgs) {
    const agg = await this.aggregateWindow({
      userId: args.userId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
    });
    await this.writeSnapshotAndDetails({
      digestId: args.digestId,
      timezone: args.timezone ?? null,
      totals: agg.totals,
      highlights: agg.highlights,
    });
    const timezone = args.timezone ?? 'UTC';
    const activities = agg.activities.map(
      (activity): ReviewReportActivity => ({
        id: activity.id,
        hashId: activity.hashId,
        title: activity.activityName,
        sportType: activity.sportType,
        date: healthLocalDateKey(
          activity.startTime ?? args.periodStart,
          timezone,
        ),
        durationSec: this.resolveDurationSec(activity),
        distanceM: activity.distance,
        load: args.type === 'WEEKLY' ? activity.actualLoad : undefined,
      }),
    );
    const training = buildReviewReportTraining({
      ...args,
      timezone,
      activities,
    });
    const byId = new Map(activities.map((activity) => [activity.id, activity]));
    const included = new Set(
      agg.highlights.map(({ activityId }) => activityId),
    );
    const candidates = [
      ...agg.highlights,
      ...agg.activities
        .filter(({ id }) => !included.has(id))
        .slice(0, 12 - agg.highlights.length)
        .map((activity, index) => ({
          activityId: activity.id,
          rank: agg.highlights.length + index + 1,
          sportType: activity.sportType ?? 'UNKNOWN',
          title: activity.activityName,
          startTime: activity.startTime,
          durationSec: this.resolveDurationSec(activity),
          distanceM: activity.distance,
          tss: null,
          load: activity.actualLoad,
          loadSource: activity.actualLoadSource,
        })),
    ];
    const activityDates = new Map(
      agg.activities.flatMap((activity) => {
        const date = activity.startTime
          ? resolveActivityCalendarDayStr(
              activity.startTime,
              activity.timezone,
              null,
              timezone,
            )
          : null;
        return date ? [[activity.id, date] as const] : [];
      }),
    );
    const references = candidates.flatMap(({ activityId, rank }) => {
      const activity = byId.get(activityId);
      return activity
        ? [
            {
              rank,
              activity: {
                ...activity,
                date: activityDates.get(activityId) ?? activity.date,
              },
            },
          ]
        : [];
    });
    const [coachingContext, recovery, previousPeriod] =
      await Promise.all([
        this.buildCoachingContext(args),
        this.buildRecovery({ ...args, timezone }),
        args.type !== 'DAILY'
          ? this.getPreviousTrainingPeriod({ ...args, timezone })
          : undefined,
      ]);
    training.previousPeriod = previousPeriod;
    const ai = await this.generateAiAnalysis({
      userId: args.userId,
      type: args.type,
      lang: args.lang,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      timezone,
      totals: agg.totals,
      highlights: candidates.map((candidate) => ({
        ...candidate,
        activityDate: activityDates.get(candidate.activityId),
      })),
      coachingContext,
      training,
      recovery,
    });
    const md = renderReviewReport({
      type: args.type,
      lang: args.lang,
      training,
      activities,
      references: references.map((reference) => ({
        ...reference,
        excerpt: ai?.activityExcerpts.get(reference.activity.id),
      })),
      recovery,
      analysis: ai?.analysis,
      translate: (key, values) => this.digestText(args.lang, key, values),
      sportLabel: (sport) => this.digestSportLabel(args.lang, sport),
    });
    await this.digests.digests().update({
      where: { id: args.digestId },
      data: {
        aiSummaryMarkdown: md,
        model: ai?.model ?? 'rule_based_v1',
        promptVersion: ai?.promptVersion ?? 'report_v1',
      },
    });

    // 同步更新通知正文（强幂等 key + 兼容老数据以 digestId 更新）
    await this.notificationDomain.updateBodyMarkdownByKey({
      userId: args.userId,
      kind: 'REVIEW_DIGEST',
      dedupeKey: `review:${args.digestId}`,
      bodyMarkdown: md,
    });
    await this.notificationDomain.updateBodyMarkdownByDigestId(
      args.digestId,
      md,
    );
    return md;
  }

  private async getPreviousTrainingPeriod(
    args: FinalizeDigestContentArgs & { timezone: string },
  ) {
    const current = completedReviewWindow(
      args.type,
      args.periodEnd,
      args.timezone,
    );
    if (
      current.periodStart.getTime() !== args.periodStart.getTime() ||
      current.periodEnd.getTime() !== args.periodEnd.getTime()
    ) {
      return undefined;
    }
    const previous = completedReviewWindow(
      args.type,
      args.periodStart,
      args.timezone,
    );
    try {
      const rows = await this.activities.findMany({
        where: readyActivityWhere({
          userId: args.userId,
          startTime: { gte: previous.periodStart, lt: previous.periodEnd },
        }),
        select: { timerTime: true, elapsedTime: true },
      });
      const durations = rows.map((row) => this.resolveDurationSec(row));
      return {
        sessions: rows.length,
        durationSec: durations.every((value) => value !== null)
          ? durations.reduce((sum, value) => sum + value, 0)
          : null,
      };
    } catch {
      this.logger.warn('Could not load the previous training period');
    }
    return undefined;
  }

  private async loadActivityReviewExcerpts(args: GenerateAiSummaryArgs) {
    if (!this.activityReviews) return new Map<number, string>();
    try {
      const ids = args.highlights.flatMap(({ activityId }) =>
        activityId === undefined ? [] : [activityId],
      );
      return await this.activityReviews.findReviewExcerpts(
        args.userId,
        ids,
        args.lang,
      );
    } catch {
      this.logger.warn(
        `Could not load activity review excerpts for ${args.type} review`,
      );
      return new Map<number, string>();
    }
  }

  private async buildRecovery(
    args: FinalizeDigestContentArgs & { timezone: string },
  ): Promise<ReviewRecoveryRow[]> {
    if (!this.health) return [];
    try {
      const window = reviewRecoveryWindow(args);
      const { observations } = await this.health.getCoachingFacts(
        args.userId,
        window.through,
        new Date(),
        window.queryDays,
      );
      return summarizeReviewRecovery(args.type, window, observations);
    } catch {
      this.logger.warn(`Could not load recovery data for ${args.type} review`);
      return [];
    }
  }

  /** 计划上下文失败不应阻断活动 Digest；保留纯活动复盘作为可靠降级路径。 */
  private async buildCoachingContext(
    args: FinalizeDigestContentArgs,
  ): Promise<ReviewDigestCoachingContext | null> {
    if (!this.digestContext) return null;
    try {
      return await this.digestContext.build({
        userId: args.userId,
        type: args.type,
        lang: args.lang,
        timezone: args.timezone ?? 'UTC',
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[复盘][上下文] 计划事实构建失败，降级活动复盘：userId=${args.userId} type=${args.type} error=${message}`,
      );
      return null;
    }
  }
}
