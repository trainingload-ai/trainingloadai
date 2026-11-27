import { LoadReadoutService } from './load-readout.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { AiUsageService, type ParsedAiUsage } from '@/api/ai/ai-usage.service';
import { parseAiReviewModeFeatures } from '@/api/ai/review-mode-features.util';
import { UserService } from '@/api/user/user.service';
import { PMCService } from '@/training-load/pmc.service';
import { SensorDataService } from '@/sensor/sensor-data.service';
import {
  buildUnifiedActivityAnalysisInput,
  type ActivityForCoachUnifiedInput,
} from '@/api/ai/activity-coach-unified-input';
import { hashActivityCoachDedupe } from '@/api/ai/activity-coach-evidence-hash';
import {
  activityReviewHasExpectedScript,
  firstLineVerdict,
  markdownPlainSummary,
  readStoredCoachMarkdown,
  validateActivityReviewMarkdown,
} from '@/api/ai/activity-coach-envelope';
import {
  ACTIVITY_AI_REVIEW_PROMPT_VERSION,
  ACTIVITY_COACH_MARKDOWN_FORMAT,
  ACTIVITY_COACH_EVIDENCE_VERSION,
} from '@/api/ai/activity-coach.constants';
import type { UnifiedActivityAnalysisInput } from '@/api/ai/dto/ai.type';
import type { AiModelPurpose } from '@shared/ai-model';
import { readyActivityWhere } from '@/utils/activity-ready-where';
import { resolveSupportedLocale } from '@/utils/locale.util';
import { AiDataConsentService } from '@/ai-data-consent/ai-data-consent.service';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import {
  FEATURE_ACCESS_POLICY,
  type FeatureAccessPolicy,
} from '@/access/feature-access-policy.port';
import { featureAllowed } from '@/access/feature-access.types';

type GenerationGate =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type PreparedActivityAiReview = {
  outcome: 'READY';
  review: {
    id: string;
    activityId: number;
    userId: string;
    trigger: $Enums.ActivityAiReviewTrigger;
  };
  lang: ReturnType<typeof resolveSupportedLocale>;
  unifiedInput: UnifiedActivityAnalysisInput;
  evidenceSnapshot: {
    version: string;
    unifiedInput: UnifiedActivityAnalysisInput;
    lang: ReturnType<typeof resolveSupportedLocale>;
  };
  evidenceHash: string;
};

export type SkippedActivityAiReview = {
  outcome: 'SKIPPED';
  activityId: number;
  code: string;
};

@Injectable()
export class ActivityAiReviewService {
  private readonly logger = new Logger(ActivityAiReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiUsage: AiUsageService,
    private readonly userService: UserService,
    private readonly pmcService: PMCService,
    private readonly users: UserQueryService,
    private readonly aiDataConsent: AiDataConsentService,
    private readonly loadReadout: LoadReadoutService,
    @Inject(FEATURE_ACCESS_POLICY)
    private readonly featureAccess: FeatureAccessPolicy,
    private readonly sensors: SensorDataService,
    private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  /** Resolve the deployment-neutral activity review access gate. */
  private async getGenerationGate(args: {
    userId: string;
    trigger: $Enums.ActivityAiReviewTrigger;
    allowWithoutConsent?: boolean;
  }): Promise<GenerationGate> {
    if (
      !args.allowWithoutConsent &&
      !(await this.aiDataConsent.isGranted(args.userId))
    ) {
      return {
        ok: false,
        code: 'AI_DATA_CONSENT_REQUIRED',
        message: 'Explicit AI data sharing consent is required',
      };
    }
    const access = await this.featureAccess.evaluate(args.userId, [
      'ai.activityReview',
    ]);
    if (!featureAllowed(access, 'ai.activityReview')) {
      return {
        ok: false,
        code: 'AI_FEATURE_ACCESS_REQUIRED',
        message: 'Activity AI review is not enabled for this account',
      };
    }
    // Explicit requests use the access checks above. This setting governs automatic reviews.
    if (args.trigger === $Enums.ActivityAiReviewTrigger.MANUAL) {
      return { ok: true };
    }

    if (!(await this.isAutomaticReviewEnabled(args.userId))) {
      return {
        ok: false,
        code: 'ACTIVITY_REVIEW_DISABLED',
        message: 'Activity AI review is disabled',
      };
    }

    return { ok: true };
  }

  private async isAutomaticReviewEnabled(userId: string): Promise<boolean> {
    const reviewSetting = await this.users.settings().findUnique({
      where: {
        userId_category: {
          userId,
          category: $Enums.SettingCategory.AI_REVIEW_MODE,
        },
      },
      select: { value: true },
    });
    return parseAiReviewModeFeatures(reviewSetting?.value).activityReview;
  }
  /**
   * 标记活动 AI 分析复盘为跳过。
   * @param args
   */
  private async markSkipped(args: {
    reviewId: string;
    code: string;
    message: string;
  }) {
    const now = new Date();
    await this.prisma.activityAiReview.update({
      where: { id: args.reviewId },
      data: {
        status: $Enums.ActivityAiReviewStatus.SKIPPED,
        finishedAt: now,
        failedAt: null,
        lockedAt: null,
        errorCode: args.code,
        errorMessage: args.message,
      },
    });
  }

  /**
   * 加载活动教练分析输入，获取活动的相关数据来构建教练证据包
   * @param activityId
   * @param userId
   * @returns
   */
  async loadActivityForCoachAnalysis(
    activityId: number,
    userId: string,
  ): Promise<ActivityForCoachUnifiedInput> {
    const activity = await this.prisma.activity.findFirst({
      where: readyActivityWhere({ id: activityId, userId }),
      include: {
        laps: true,
        activityZones: true,
        trimp: true,
        epoc: true,
        vo2max: true,
        coggan: true,
        bikeScore: true,
        fitnessMetricsSnapshot: true,
        strengthExercises: {
          orderBy: { orderIndex: 'asc' },
          include: { sets: { orderBy: { setIndex: 'asc' } } },
        },
      },
    });
    if (!activity) {
      throw new Error(`Activity not found for AI coach: ${activityId}`);
    }
    return {
      ...activity,
      ...(await this.loadReadout.getActualLoadForActivity(activity.id)),
    };
  }
  /**
   * 构建教练证据包
   * @param args
   * @returns
   */
  async buildCoachEvidenceBundle(args: {
    activityId: number;
    userId: string;
    lang: ReturnType<typeof resolveSupportedLocale>;
  }): Promise<{
    activity: ActivityForCoachUnifiedInput;
    unifiedInput: UnifiedActivityAnalysisInput;
    evidenceHash: string;
    evidenceSnapshot: {
      version: string;
      unifiedInput: UnifiedActivityAnalysisInput;
      lang: ReturnType<typeof resolveSupportedLocale>;
    };
  }> {
    // 先取 活动
    const activity = await this.loadActivityForCoachAnalysis(
      args.activityId,
      args.userId,
    );
    // 再取 用户配置
    const profile = await this.userService.getComposedUserProfile(
      args.userId,
      activity.sportType,
    );
    // 最后构建教练证据包
    const unifiedInput = await buildUnifiedActivityAnalysisInput(
      activity,
      args.userId,
      profile,
      this.pmcService,
      () => this.sensors.getRecordSeriesStats(activity.id, 'cadence'),
    );
    // 计算教练证据包哈希
    const evidenceHash = await hashActivityCoachDedupe({
      unifiedInput,
      lang: args.lang,
    });
    return {
      activity,
      unifiedInput,
      evidenceHash,
      evidenceSnapshot: {
        version: ACTIVITY_COACH_EVIDENCE_VERSION,
        unifiedInput,
        lang: args.lang,
      },
    };
  }

  private async findLatestAiReviewForActivity(args: {
    activityId: number;
    userId: string;
    language?: string;
  }) {
    return await this.prisma.activityAiReview.findFirst({
      where: {
        activityId: args.activityId,
        userId: args.userId,
        ...(args.language
          ? { language: resolveSupportedLocale(args.language) }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findReviewExcerpts(
    userId: string,
    activityIds: number[],
    lang: string,
  ) {
    if (!activityIds.length) return new Map<number, string>();
    const reviews = await this.prisma.activityAiReview.findMany({
      where: {
        userId,
        activityId: { in: activityIds },
        language: resolveSupportedLocale(lang),
        status: $Enums.ActivityAiReviewStatus.SUCCEEDED,
        promptVersion: ACTIVITY_AI_REVIEW_PROMPT_VERSION,
        evidenceVersion: ACTIVITY_COACH_EVIDENCE_VERSION,
      },
      orderBy: [{ activityId: 'asc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      distinct: ['activityId'],
      select: { activityId: true, summary: true, verdict: true },
    });
    const excerpts = new Map<number, string>();
    for (const row of reviews) {
      const excerpt = (row.summary?.trim() || row.verdict?.trim())?.slice(
        0,
        480,
      );
      if (excerpt && activityReviewHasExpectedScript(excerpt, lang))
        excerpts.set(row.activityId, excerpt);
    }
    return excerpts;
  }

  async enqueueForActivity(args: {
    activityId: number;
    userId: string;
    trigger: $Enums.ActivityAiReviewTrigger;
    language?: string;
    metadata?: Record<string, unknown>;
    /** Inline execution already owns admission; do not expose it to the worker. */
    runInline?: boolean;
  }) {
    this.capabilities?.require('ai');
    const language = resolveSupportedLocale(args.language ?? 'zh');
    const existing = await this.findLatestAiReviewForActivity({
      activityId: args.activityId,
      userId: args.userId,
      language,
    });

    const { evidenceSnapshot, evidenceHash } =
      await this.buildCoachEvidenceBundle({
        activityId: args.activityId,
        userId: args.userId,
        lang: language,
      });

    if (
      existing?.evidenceHash === evidenceHash &&
      existing.promptVersion === ACTIVITY_AI_REVIEW_PROMPT_VERSION &&
      existing.evidenceVersion === ACTIVITY_COACH_EVIDENCE_VERSION &&
      (existing.status === $Enums.ActivityAiReviewStatus.RUNNING ||
        (args.trigger !== $Enums.ActivityAiReviewTrigger.MANUAL &&
          existing.status !== $Enums.ActivityAiReviewStatus.SKIPPED &&
          (existing.status !== $Enums.ActivityAiReviewStatus.SUCCEEDED ||
            readStoredCoachMarkdown(existing.content, language))))
    ) {
      return {
        id: existing.id,
        status: existing.status,
        priorSucceeded: undefined,
      };
    }

    const resetPending = {
      status: args.runInline
        ? $Enums.ActivityAiReviewStatus.RUNNING
        : $Enums.ActivityAiReviewStatus.PENDING,
      attempts: 0,
      lockedAt: args.runInline ? new Date() : null,
      startedAt: args.runInline ? new Date() : null,
      finishedAt: null,
      failedAt: null,
    };

    const priorSucceeded =
      args.runInline &&
      existing &&
      existing.status === $Enums.ActivityAiReviewStatus.SUCCEEDED &&
      readStoredCoachMarkdown(existing.content, language)
        ? {
            trigger: existing.trigger,
            finishedAt: existing.finishedAt,
          }
        : undefined;

    if (existing) {
      const updated = await this.prisma.activityAiReview.update({
        where: { id: existing.id },
        data: {
          trigger: args.trigger,
          language,
          promptVersion: ACTIVITY_AI_REVIEW_PROMPT_VERSION,
          evidenceVersion: ACTIVITY_COACH_EVIDENCE_VERSION,
          evidenceHash,
          evidence: evidenceSnapshot as unknown as Prisma.InputJsonValue,
          metadata: args.metadata as unknown as Prisma.InputJsonValue,
          availableAt: new Date(),
          errorCode: null,
          errorMessage: null,
          ...resetPending,
        },
        select: { id: true, status: true },
      });
      return { ...updated, priorSucceeded };
    }

    try {
      const created = await this.prisma.activityAiReview.create({
        data: {
          activityId: args.activityId,
          userId: args.userId,
          ...resetPending,
          trigger: args.trigger,
          availableAt: new Date(),
          language,
          promptVersion: ACTIVITY_AI_REVIEW_PROMPT_VERSION,
          evidenceVersion: ACTIVITY_COACH_EVIDENCE_VERSION,
          evidenceHash,
          evidence: evidenceSnapshot as unknown as Prisma.InputJsonValue,
          metadata: args.metadata as unknown as Prisma.InputJsonValue,
        },
        select: { id: true, status: true },
      });
      return { ...created, priorSucceeded: undefined };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.findLatestAiReviewForActivity({
          activityId: args.activityId,
          userId: args.userId,
          language,
        });
        if (raced) {
          return {
            id: raced.id,
            status: raced.status,
            priorSucceeded: undefined,
          };
        }
      }
      throw error;
    }
  }

  /**
   * Recover an inline manual review row after generation fails so we neither
   * erase a previously succeeded review nor leave a stale RUNNING row for the
   * background worker to claim later.
   */
  async recoverInlineRunFailure(args: {
    reviewId: string;
    priorSucceeded?: {
      trigger: $Enums.ActivityAiReviewTrigger;
      finishedAt: Date | null;
    };
    error: unknown;
  }): Promise<void> {
    if (args.priorSucceeded) {
      await this.prisma.activityAiReview.updateMany({
        where: {
          id: args.reviewId,
          status: $Enums.ActivityAiReviewStatus.RUNNING,
        },
        data: {
          status: $Enums.ActivityAiReviewStatus.SUCCEEDED,
          trigger: args.priorSucceeded.trigger,
          finishedAt: args.priorSucceeded.finishedAt,
          lockedAt: null,
          failedAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });
      return;
    }
    const message =
      args.error instanceof Error
        ? args.error.message
        : String(args.error ?? 'Unknown error');
    await this.prisma.activityAiReview.updateMany({
      where: {
        id: args.reviewId,
        status: $Enums.ActivityAiReviewStatus.RUNNING,
      },
      data: {
        status: $Enums.ActivityAiReviewStatus.DEAD,
        lockedAt: null,
        failedAt: new Date(),
        errorCode: 'INLINE_RUN_FAILED',
        errorMessage: message.slice(0, 500),
      },
    });
  }

  /**
   * Resolve access and build the authoritative evidence for a queued review.
   * Model execution deliberately lives in AiService so Activity remains the
   * owner of activity facts without depending on the AI orchestration module.
   */
  async prepareGeneration(
    reviewId: string,
    options?: { allowWithoutConsent?: boolean },
  ): Promise<PreparedActivityAiReview | SkippedActivityAiReview> {
    this.capabilities?.require('ai');
    const review = await this.prisma.activityAiReview.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        activityId: true,
        userId: true,
        trigger: true,
        language: true,
      },
    });
    if (!review) throw new Error(`Activity AI review not found: ${reviewId}`);
    const gate = await this.getGenerationGate({
      userId: review.userId,
      trigger: review.trigger,
      allowWithoutConsent: options?.allowWithoutConsent,
    });

    if (gate.ok === false) {
      await this.markSkipped({
        reviewId: review.id,
        code: gate.code,
        message: gate.message,
      });
      return {
        outcome: 'SKIPPED' as const,
        activityId: review.activityId,
        code: gate.code,
      };
    }

    const lang = resolveSupportedLocale(review.language);
    const { unifiedInput, evidenceSnapshot, evidenceHash } =
      await this.buildCoachEvidenceBundle({
        activityId: review.activityId,
        userId: review.userId,
        lang,
      });

    return {
      outcome: 'READY',
      review: {
        id: review.id,
        activityId: review.activityId,
        userId: review.userId,
        trigger: review.trigger,
      },
      lang,
      unifiedInput,
      evidenceSnapshot,
      evidenceHash,
    };
  }

  /** Persist an Agent-produced queued review and its aggregate usage atomically. */
  async persistGeneratedReview(args: {
    prepared: PreparedActivityAiReview;
    markdown: string;
    provider: string | null;
    model: string;
    operationId: string;
    usage: ParsedAiUsage;
  }) {
    const markdown = validateActivityReviewMarkdown(
      args.markdown,
      args.prepared.lang,
    );
    const {
      inputTokens,
      outputTokens,
      cachedInputTokens,
      uncachedInputTokens: billableInputTokens,
      weightedTokens,
    } = this.aiUsage.computeUsageMetrics(args.usage);
    const costMicroYuan = null;
    const now = new Date();

    const summary = markdownPlainSummary(markdown);
    const verdict = firstLineVerdict(markdown);
    const evidence = args.prepared
      .evidenceSnapshot as unknown as Prisma.InputJsonValue;

    await this.prisma.$transaction(async (tx) => {
      await tx.activityAiReview.update({
        where: { id: args.prepared.review.id },
        data: {
          status: $Enums.ActivityAiReviewStatus.SUCCEEDED,
          evidence,
          evidenceHash: args.prepared.evidenceHash,
          content: markdown,
          verdict,
          summary,
          provider: args.provider,
          model: args.model,
          inputTokens,
          outputTokens,
          cachedInputTokens,
          billableInputTokens,
          weightedTokens,
          costMicroYuan,
          finishedAt: now,
          generatedAt: now,
          failedAt: null,
          lockedAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });
    });

    return {
      outcome: 'SUCCEEDED' as const,
      activityId: args.prepared.review.activityId,
      reviewId: args.prepared.review.id,
      markdown,
      weightedTokens,
    };
  }

  /** Persist the recoverable result, then record its single upstream usage event. */
  async persistCoachMarkdownFromAnalysis(args: {
    activityId: number;
    userId: string;
    operationId: string;
    lang: string;
    markdown: string;
    provider: string;
    model: string;
    purpose: AiModelPurpose;
    unifiedInput: UnifiedActivityAnalysisInput;
    evidenceHash: string;
    usage: ParsedAiUsage;
  }) {
    if (!args.markdown?.trim()) return;
    const trimmed = validateActivityReviewMarkdown(args.markdown, args.lang);

    const {
      inputTokens,
      outputTokens,
      cachedInputTokens,
      uncachedInputTokens: billableInputTokens,
      weightedTokens,
    } = this.aiUsage.computeUsageMetrics(args.usage);
    const costMicroYuan = null;
    const now = new Date();
    const evidenceSnapshot = {
      version: ACTIVITY_COACH_EVIDENCE_VERSION,
      unifiedInput: args.unifiedInput,
      lang: args.lang,
    };
    const summary = markdownPlainSummary(trimmed);
    const verdict = firstLineVerdict(trimmed);

    const existing = await this.findLatestAiReviewForActivity({
      activityId: args.activityId,
      userId: args.userId,
      language: args.lang,
    });

    const rowData = {
      status: $Enums.ActivityAiReviewStatus.SUCCEEDED,
      language: args.lang,
      promptVersion: ACTIVITY_AI_REVIEW_PROMPT_VERSION,
      evidenceVersion: ACTIVITY_COACH_EVIDENCE_VERSION,
      evidenceHash: args.evidenceHash,
      evidence: evidenceSnapshot as unknown as Prisma.InputJsonValue,
      content: trimmed,
      verdict,
      summary,
      provider: args.provider,
      model: args.model,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      billableInputTokens,
      weightedTokens,
      costMicroYuan,
      finishedAt: now,
      generatedAt: now,
      failedAt: null,
      errorCode: null,
      errorMessage: null,
      trigger: $Enums.ActivityAiReviewTrigger.MANUAL,
    };

    const persisted = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        return await tx.activityAiReview.update({
          where: { id: existing.id },
          data: rowData,
          select: { id: true },
        });
      }
      return await tx.activityAiReview.create({
        data: {
          activityId: args.activityId,
          userId: args.userId,
          ...rowData,
        },
        select: { id: true },
      });
    });
    try {
      await this.aiUsage.recordUsageEvent({
        userId: args.userId,
        operationId: args.operationId,
        callKey: `${args.operationId}:activity-analysis:0`,
        kind: $Enums.AiUsageKind.ACTIVITY_ANALYSIS,
        provider: args.provider,
        model: args.model,
        purpose: args.purpose,
        usage: args.usage,
        entityId: String(args.activityId),
        now,
      });
    } catch (error) {
      this.logger.error(
        `[Activity AI] usage 落库失败 operationId=${args.operationId} reviewId=${persisted.id}: ${String(error)}`,
      );
    }
    return persisted;
  }
  /**
   * 获取活动AI分析复盘
   * @param args
   * @returns
   */
  async getAiReviewForActivityHash(args: {
    userId: string;
    activityHashId: string;
    language?: string;
  }) {
    const activity = await this.prisma.activity.findFirst({
      where: readyActivityWhere({
        hashId: args.activityHashId,
        userId: args.userId,
      }),
      select: { id: true },
    });
    if (!activity) {
      return { found: false as const, reason: 'ACTIVITY_NOT_FOUND' as const };
    }

    const language = resolveSupportedLocale(args.language);
    const row = await this.findLatestAiReviewForActivity({
      activityId: activity.id,
      userId: args.userId,
      language,
    });

    const currentContract =
      row?.promptVersion === ACTIVITY_AI_REVIEW_PROMPT_VERSION &&
      row.evidenceVersion === ACTIVITY_COACH_EVIDENCE_VERSION;
    const succeeded = row?.status === $Enums.ActivityAiReviewStatus.SUCCEEDED;
    const markdown =
      currentContract && succeeded
        ? readStoredCoachMarkdown(row.content, language)
        : null;
    const usable = currentContract && (!succeeded || Boolean(markdown));
    const needsLanguageRepair = currentContract && succeeded && !markdown;
    const status = usable
      ? row.status
      : (await this.isAutomaticReviewEnabled(args.userId))
        ? null
        : $Enums.ActivityAiReviewStatus.SKIPPED;

    return {
      found: true as const,
      activityId: activity.id,
      reviewId: row?.id ?? null,
      status,
      needsLanguageRepair,
      markdown,
      summary: usable ? row.summary : null,
      verdict: usable ? row.verdict : null,
      evidenceHash: usable || needsLanguageRepair ? row.evidenceHash : null,
      updatedAt: usable ? row.updatedAt.toISOString() : null,
    };
  }

  /** Replace the dedicated Demo account's pre-reviewed, non-model snapshots. */
  async replacePublicDemoReviews(args: {
    userId: string;
  }): Promise<{ reviewCount: number; liveAnalysisHashId: string | null }> {
    const activities = await this.prisma.activity.findMany({
      where: readyActivityWhere({ userId: args.userId }),
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        hashId: true,
        activityName: true,
        sportType: true,
        startTime: true,
        timerTime: true,
        elapsedTime: true,
        distance: true,
        avgHeartRate: true,
        maxHeartRate: true,
        avgPower: true,
      },
    });
    const loadByActivity = await this.loadReadout.batchGetActualLoad(
      activities.map((activity) => activity.id),
    );
    const sportNames: Record<string, { zh: string; en: string }> = {
      RUN: { zh: '跑步', en: 'run' },
      SWIM: { zh: '游泳', en: 'swim' },
      CYCLING: { zh: '骑行', en: 'ride' },
      STRETCHING: { zh: '拉伸', en: 'mobility session' },
      UNKNOWN: { zh: '训练', en: 'workout' },
    };
    // Keep the newest activity uncached so the Demo proves the real passive
    // analysis path on first visit. Once generated, the normal review cache
    // persists it and subsequent visitors do not repeat the same model work.
    const liveAnalysisActivity = activities.at(-1) ?? null;
    const rows = activities.slice(0, -1).flatMap((activity) => {
      const load = loadByActivity.get(activity.id);
      const durationSeconds =
        Number(activity.timerTime) || Number(activity.elapsedTime) || 0;
      const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
      const distanceKm = Number(activity.distance)
        ? (Number(activity.distance) / 1_000).toFixed(2)
        : null;
      const sport =
        sportNames[String(activity.sportType ?? 'UNKNOWN')] ??
        sportNames.UNKNOWN;
      const actualLoad = Number(load?.actualLoad ?? 0).toFixed(1);
      const loadSource = load?.actualLoadSource ?? 'HEART_RATE';
      const zh = [
        '### 训练结论',
        `这次${sport.zh}完成记录完整，实际负荷为 **${actualLoad}**（${loadSource}）。`,
        '',
        `- 时长：${durationMinutes} 分钟${distanceKm ? `；距离：${distanceKm} 公里` : ''}`,
        `- 心率：平均 ${Math.round(Number(activity.avgHeartRate) || 0)} bpm，最高 ${Math.round(Number(activity.maxHeartRate) || 0)} bpm`,
        ...(Number(activity.avgPower)
          ? [`- 平均功率：${Math.round(Number(activity.avgPower))} W`]
          : []),
        '',
        '这次训练已经计入当前周期负荷。按原计划安排恢复即可，不需要为了补数字额外加练。',
      ].join('\n');
      const en = [
        '### Training verdict',
        `This ${sport.en} has a complete activity record and produced an actual load of **${actualLoad}** (${loadSource}).`,
        '',
        `- Duration: ${durationMinutes} min${distanceKm ? `; distance: ${distanceKm} km` : ''}`,
        `- Heart rate: ${Math.round(Number(activity.avgHeartRate) || 0)} bpm average, ${Math.round(Number(activity.maxHeartRate) || 0)} bpm maximum`,
        ...(Number(activity.avgPower)
          ? [`- Average power: ${Math.round(Number(activity.avgPower))} W`]
          : []),
        '',
        'The session is already included in the current cycle load. Follow the planned recovery and do not add work merely to increase the numbers.',
      ].join('\n');
      const generatedAt = new Date(
        (activity.startTime?.getTime() ?? Date.now()) +
          Math.max(durationSeconds, 60) * 1_000,
      );
      const content = {
        format: ACTIVITY_COACH_MARKDOWN_FORMAT,
        byLang: { zh, en },
      } as Prisma.InputJsonValue;
      return (['zh', 'en'] as const).map((language) => ({
        activityId: activity.id,
        userId: args.userId,
        status: $Enums.ActivityAiReviewStatus.SUCCEEDED,
        trigger: $Enums.ActivityAiReviewTrigger.IMPORT,
        language,
        promptVersion: ACTIVITY_AI_REVIEW_PROMPT_VERSION,
        evidenceVersion: ACTIVITY_COACH_EVIDENCE_VERSION,
        evidenceHash: `public-demo:${activity.hashId}:${language}:v1`,
        evidence: {
          version: ACTIVITY_COACH_EVIDENCE_VERSION,
          curated: true,
          actualLoad: load?.actualLoad ?? null,
          actualLoadSource: load?.actualLoadSource ?? null,
        } as Prisma.InputJsonValue,
        content,
        verdict: language === 'zh' ? '按计划恢复' : 'Recover as planned',
        summary:
          language === 'zh'
            ? `实际负荷 ${actualLoad}，已计入当前训练周期。`
            : `Actual load ${actualLoad}, included in the current training cycle.`,
        provider: 'public-demo',
        model: 'curated-v1',
        attempts: 1,
        availableAt: generatedAt,
        startedAt: generatedAt,
        finishedAt: generatedAt,
        generatedAt,
        metadata: {
          publicDemo: true,
          activityTitle: activity.activityName,
        } as Prisma.InputJsonValue,
      }));
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.activityAiReview.deleteMany({ where: { userId: args.userId } });
      if (rows.length > 0) {
        await tx.activityAiReview.createMany({ data: rows });
      }
    });
    return {
      reviewCount: rows.length,
      liveAnalysisHashId: liveAnalysisActivity?.hashId ?? null,
    };
  }
}
