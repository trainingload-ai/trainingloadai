import { Injectable, Logger, Optional } from '@nestjs/common';
import { AiUsageKind, Prisma, SportType } from '@prisma/client';
import type { ReviewDigestType } from './review-types';
import { I18nService } from 'nestjs-i18n';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { ReviewDigestRepository } from './persistence/review-digest.repository';
import {
  getCoachBaseUrlForLog,
  getCoachModel,
  getCoachUpstreamProvider,
} from '@/api/ai/core/coach-upstream.adapter';
import {
  REVIEW_DIGEST_PROMPT_VERSION,
  buildReviewDigestMessages,
  type ReviewDigestCoachingContext,
} from '@/api/ai/core/prompt-contracts/review-digest.contract';
import { resolveEffectiveActivityVo2Max } from '@/analyze/vo2max/vo2max-source';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { ReviewDigestContextService } from './review-digest-context.service';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
import { AiUsageService } from '@/api/ai/ai-usage.service';
import {
  ReviewModelCallGuard,
  isReviewModelDeferredError,
} from './review-model-call-guard';
import { AiService } from '@/api/ai/ai.service';

type AggregatedActivity = {
  id: number;
  sportType: string | null;
  startTime: Date | null;
  timerTime: number | null;
  elapsedTime: number | null;
  distance: number | null;
  activityName: string | null;
  avgHeartRate: number | null;
  avgPower: number | null;
  cogganBikeStress: number | null;
  govss: number | null;
  swimScore: number | null;
  trimp100: number | null;
  vo2maxVdotByRace: number | null;
  vo2maxVdotByHr: number | null;
  vo2maxVdotByFactor: number | null;
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
  totalLoad: number;
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

type MarkdownSummaryArgs = {
  type: ReviewDigestType;
  lang: string;
  totals: Pick<
    AggregatedTotals,
    'totalSessions' | 'totalDurationSec' | 'totalDistanceM' | 'totalTss'
  > & { totalLoad?: number };
  highlights: Array<{
    rank: number;
    sportType: string;
    durationSec: number | null;
    distanceM: number | null;
    tss: number | null;
    title: string | null;
    startTime: Date | null;
  }>;
};

type GenerateAiSummaryArgs = {
  userId: string;
  type: ReviewDigestType;
  lang: string;
  periodStart: Date;
  periodEnd: Date;
  timezone: string;
  totals: AggregatedTotals;
  highlights: Array<{
    rank: number;
    sportType: string;
    durationSec: number | null;
    distanceM: number | null;
    tss: number | null;
    title: string | null;
    startTime: Date | null;
  }>;
  coachingContext?: ReviewDigestCoachingContext | null;
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
    @Optional() private readonly digestContext?: ReviewDigestContextService,
    @Optional() private readonly aiDataConsent?: AiDataConsentService,
    @Optional() private readonly aiUsage?: AiUsageService,
    @Optional() private readonly ai?: AiService,
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

  /**
   * 解析“综合负荷”（用于跨运动类型对齐 Top/highlights 与总体压力估计）。
   * 规则：
   * - 骑行：优先 bikeStress
   * - 跑步：优先 GOVSS
   * - 游泳：优先 SwimScore
   * - 兜底：TRIMP100（心率负荷）
   *
   * 注意：该指标用于“相对排序/汇总”，不强行等价于 TSS。
   */
  private resolveLoad(
    a: Pick<
      AggregatedActivity,
      'sportType' | 'cogganBikeStress' | 'govss' | 'swimScore' | 'trimp100'
    >,
  ) {
    const sport = this.normalizeSportType(a.sportType);
    // 优先使用运动专属负荷
    if (sport === 'CYCLING' && typeof a.cogganBikeStress === 'number')
      return a.cogganBikeStress;
    if (sport === 'RUN' && typeof a.govss === 'number') return a.govss;
    if (sport === 'SWIM' && typeof a.swimScore === 'number') return a.swimScore;
    // 兜底：trimp100（心率负荷）
    if (typeof a.trimp100 === 'number') return a.trimp100;
    return null;
  }

  /**
   * 解析 VO2max/VDOT（来自不同估算来源的一个可用值）。
   * 目前仅用于未来扩展（趋势/提示），不参与核心汇总。
   */
  private resolveVo2max(
    a: Pick<
      AggregatedActivity,
      'vo2maxVdotByRace' | 'vo2maxVdotByHr' | 'vo2maxVdotByFactor'
    >,
  ) {
    return resolveEffectiveActivityVo2Max(a)?.value ?? null;
  }

  /**
   * 聚合一个时间窗口内的活动数据，产出：
   * - 宽表所需的汇总指标（次数/时长/距离/TSS/综合负荷）
   * - 运动类型分组统计（用于明细表）
   * - Top highlights（用于“本周期重点训练”）
   *
   * 约束：
   * - `take: 500` 是保护阈值，避免极端用户拉取过多记录导致 worker 抖动
   * - highlights 的 score 优先使用综合负荷，其次 TSS，再次时长（分钟）
   */
  async aggregateWindow(
    args: AggregateWindowArgs,
  ): Promise<AggregateWindowResult> {
    const rows = await this.activities.findMany({
      where: readyActivityWhere({
        userId: args.userId,
        startTime: {
          gte: args.periodStart,
          lt: args.periodEnd,
        },
      }),
      orderBy: { startTime: 'desc' },
      take: 500,
      select: {
        id: true,
        sportType: true,
        startTime: true,
        timerTime: true,
        elapsedTime: true,
        distance: true,
        activityName: true,
        avgHeartRate: true,
        avgPower: true,
        coggan: { select: { bikeStress: true } },
        govss: { select: { govss: true } },
        swimScore: { select: { swimScore: true } },
        trimp: { select: { trimp100: true } },
        vo2max: {
          select: {
            vo2maxVdotByRace: true,
            vo2maxVdotByHr: true,
            vo2maxVdotByFactor: true,
          },
        },
      },
    });

    const activities: AggregatedActivity[] = rows.map((r) => ({
      id: r.id,
      sportType: r.sportType ?? null,
      startTime: r.startTime ?? null,
      timerTime: (r.timerTime as number | null) ?? null,
      elapsedTime: (r.elapsedTime as number | null) ?? null,
      distance: (r.distance as number | null) ?? null,
      activityName: (r.activityName as string | null) ?? null,
      avgHeartRate: (r.avgHeartRate as number | null) ?? null,
      avgPower: (r.avgPower as number | null) ?? null,
      cogganBikeStress: (r.coggan?.bikeStress as number | null) ?? null,
      govss: (r.govss?.govss as number | null) ?? null,
      swimScore: (r.swimScore?.swimScore as number | null) ?? null,
      trimp100: (r.trimp?.trimp100 as number | null) ?? null,
      vo2maxVdotByRace: (r.vo2max?.vo2maxVdotByRace as number | null) ?? null,
      vo2maxVdotByHr: (r.vo2max?.vo2maxVdotByHr as number | null) ?? null,
      vo2maxVdotByFactor:
        (r.vo2max?.vo2maxVdotByFactor as number | null) ?? null,
    }));

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

      const dist =
        typeof a.distance === 'number' && Number.isFinite(a.distance)
          ? a.distance
          : null;
      if (dist != null) {
        bySport[sport].distanceM += dist;
        totalDistanceM += dist;
      }

      const tss = this.resolveTss(a);
      if (tss != null) {
        bySport[sport].tss += tss;
        totalTss += tss;
      }

      const load = this.resolveLoad(a);
      if (load != null) {
        // 复用 bySport.tss 作为“综合负荷”不合适，因此这里单独累加到 totalLoad，并在写快照时写入 totalLoad 字段
        totalLoad += load;
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
        distanceM:
          typeof a.distance === 'number' && Number.isFinite(a.distance)
            ? a.distance
            : null,
        tss: this.resolveTss(a),
        title: a.activityName,
        score:
          this.resolveLoad(a) ??
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
        totalLoad,
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
   * 规则版（非 AI）Markdown 摘要：当 AI 关闭/不可用/失败时使用。
   * 只输出最基本的概览 + Top highlights，避免编造推断。
   * 文案走 nestjs-i18n，与通知同一套 `common.notification.reviewDigest.*`。
   */
  async buildMarkdownSummary(args: MarkdownSummaryArgs) {
    const { type, lang, totals, highlights } = args;
    const hours = Math.round((totals.totalDurationSec / 3600) * 10) / 10;
    const km = Math.round((totals.totalDistanceM / 1000) * 10) / 10;
    const tss = Math.round(totals.totalTss);
    const load = totals.totalLoad != null ? Math.round(totals.totalLoad) : null;
    const overviewKey =
      type === 'DAILY'
        ? 'fallbackOverviewDaily'
        : type === 'WEEKLY'
          ? 'fallbackOverviewWeekly'
          : 'fallbackOverviewMonthly';

    const lines: string[] = [
      this.digestText(lang, overviewKey),
      this.digestText(lang, 'fallbackSessions', {
        count: totals.totalSessions,
      }),
      this.digestText(lang, 'fallbackDurationHours', { hours }),
      this.digestText(lang, 'fallbackDistanceKm', { km }),
    ];
    if (load != null && load > 0) {
      lines.push(this.digestText(lang, 'fallbackLoad', { load }));
    } else if (totals.totalTss > 0) {
      lines.push(this.digestText(lang, 'fallbackTss', { tss }));
    }
    if (highlights.length) {
      lines.push('');
      lines.push(this.digestText(lang, 'fallbackHighlightsHeading'));
      for (const h of highlights) {
        const durMin =
          h.durationSec != null ? Math.round(h.durationSec / 60) : null;
        const distKm =
          h.distanceM != null
            ? Math.round((h.distanceM / 1000) * 10) / 10
            : null;
        const title = h.title?.trim();
        const parts = [
          title ? title : this.digestSportLabel(lang, h.sportType),
          durMin != null
            ? this.digestText(lang, 'fallbackHighlightDuration', {
                minutes: durMin,
              })
            : null,
          distKm != null
            ? this.digestText(lang, 'fallbackHighlightDistance', { km: distKm })
            : null,
          h.tss != null
            ? this.digestText(lang, 'fallbackHighlightTss', {
                tss: Math.round(h.tss),
              })
            : null,
        ].filter((part): part is string => Boolean(part));
        lines.push(
          this.digestText(lang, 'fallbackHighlightItem', {
            rank: h.rank,
            summary: parts.join(' · '),
          }),
        );
      }
    }
    return lines.join('\n');
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

  /**
   * 调用 LLM 生成复盘 Markdown。
   * - 若未开启 AI / 未配置 key：直接返回 null（上游走规则版）
   * - 若调用失败：记录 warning 并返回 null（上游走规则版）
   * - 若本轮已连续 3 次模型失败：抛出 ReviewModelDeferredError，由 worker 顺延任务
   */
  async generateAiSummaryMarkdown(args: GenerateAiSummaryArgs): Promise<{
    markdown: string;
    model: string;
    promptVersion: string;
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
      const messages = buildReviewDigestMessages({
        type: args.type,
        lang: args.lang,
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
        timezone: args.timezone,
        totals: args.totals,
        highlights: args.highlights,
        coachingContext: args.coachingContext,
        delivery: 'agent-tool',
      });
      const task = await this.modelGuard.run(
        `digest:${args.type}`,
        (signal) =>
          this.ai!.runBackgroundCoachTask<{ markdown: string }>({
            userId: args.userId,
            lang: args.lang,
            taskType: `REVIEW_DIGEST_${args.type}`,
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
            validateResult: (raw) => {
              const obj =
                raw && typeof raw === 'object' && !Array.isArray(raw)
                  ? (raw as Record<string, unknown>)
                  : null;
              const markdown = String(obj?.markdown ?? '').trim();
              if (!markdown) throw new Error('Review markdown is required.');
              return { markdown: markdown.slice(0, 24_000) };
            },
          }),
        {
          failureReason: (result) =>
            !result.usage.reported
              ? 'usage_missing'
              : result.result.markdown.trim()
                ? null
                : 'empty_response',
        },
      );
      if (this.aiUsage && !task.replayed) {
        try {
          await this.aiUsage.recordUsageEvent({
            userId: args.userId,
            operationId: task.operationId,
            callKey: `${task.operationId}:background-aggregate`,
            kind:
              args.type === 'DAILY'
                ? AiUsageKind.REVIEW_DAILY
                : args.type === 'WEEKLY'
                  ? AiUsageKind.REVIEW_WEEKLY
                  : AiUsageKind.REVIEW_MONTHLY,
            provider: task.provider,
            model: task.model,
            usage: task.usage,
          });
        } catch (usageError) {
          // Digest delivery has a rule-based fallback and must not be coupled to
          // internal accounting availability. Keep the missing record observable.
          this.logger.error(
            `[复盘][AI] 用量记录失败：provider=${task.provider ?? provider} model=${task.model} userId=${args.userId} error=${String(usageError)}`,
          );
        }
      }
      const md = task.result.markdown.trim();
      if (!md) return null;
      return {
        markdown: md,
        model: task.model,
        promptVersion: REVIEW_DIGEST_PROMPT_VERSION,
      };
    } catch (e) {
      if (isReviewModelDeferredError(e)) throw e;
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
    const coachingContext = await this.buildCoachingContext(args);
    const ai = await this.generateAiSummaryMarkdown({
      userId: args.userId,
      type: args.type,
      lang: args.lang,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      timezone: args.timezone ?? 'UTC',
      totals: agg.totals,
      highlights: agg.highlights,
      coachingContext,
    });
    const md =
      ai?.markdown ??
      (await this.buildMarkdownSummary({
        type: args.type,
        lang: args.lang,
        totals: agg.totals,
        highlights: agg.highlights,
      }));
    await this.digests.digests().update({
      where: { id: args.digestId },
      data: {
        aiSummaryMarkdown: md,
        model: ai?.model ?? 'rule_based_v0',
        promptVersion: ai?.promptVersion ?? 'v0',
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
