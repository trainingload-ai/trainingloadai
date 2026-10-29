import { Inject, Injectable, Logger } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService, type AiTrainingAdviceContext } from './ai.service';
import { AiUsageService } from './ai-usage.service';
import {
  PlanExecutionContextService,
  type PlanExecutionContext,
  type PlanExecutionSurface,
} from '../plan/plan-execution-context.service';
import {
  normalizeStringArray,
  safeLogJson,
  sha256Hex,
  stableJson,
} from './core/ai-common.util';
import type { SupportedAppLocale } from '@/utils/locale.util';
import {
  FEATURE_ACCESS_POLICY,
  type FeatureAccessPolicy,
} from '@/access/feature-access-policy.port';
import { featureAllowed } from '@/access/feature-access.types';
import {
  shouldUseDeterministicPlanAdvice,
  validatePlanExecutionAdviceGrounding,
  type PlanExecutionAdviceGrounding,
} from './plan-execution-advice-grounding';
import { aiFallbackText } from './core/ai-fallback-copy';

export { validatePlanExecutionAdviceGrounding } from './plan-execution-advice-grounding';

export type PlanExecutionAdviceBody = {
  surface?: PlanExecutionSurface;
  anchorDate?: string;
  planId?: string;
  planWorkoutId?: string;
  activityId?: string | number;
  sourceNode?: unknown;
  fallbackSummary?: string;
  fallbackTags?: string[];
  locale?: string;
  timezone?: string;
};

export type PlanExecutionAdviceResult = {
  summary: string;
  tags: string[];
  source: 'generated' | 'fallback' | 'cache';
  shouldRefresh: boolean;
  generatedAt: Date | string | null;
  factHash: string;
};

type PlanExecutionAdviceCacheRow = {
  summary: string;
  tags: unknown;
  source: string;
  signature_hash: string;
  generated_at: Date;
};

@Injectable()
export class AiPlanExecutionAdviceService {
  private readonly logger = new Logger(AiPlanExecutionAdviceService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly aiUsage: AiUsageService,
    private readonly prisma: PrismaService,
    private readonly planExecutionContext: PlanExecutionContextService,
    private readonly i18n: I18nService,
    @Inject(FEATURE_ACCESS_POLICY)
    private readonly featureAccess: FeatureAccessPolicy,
  ) {}

  async generatePlanExecutionAdvice(params: {
    userId: string;
    locale: SupportedAppLocale;
    body?: PlanExecutionAdviceBody;
    /** Whether cached/generated AI output and upstream calls are permitted. */
    allowAi?: boolean;
    /** Verified public Demo requests use the dataset's display authorization. */
    allowWithoutConsent?: boolean;
  }): Promise<PlanExecutionAdviceResult> {
    const { userId, locale } = params;
    const body = params.body ?? {};
    const surface = body.surface || 'PLAN_SIDEBAR';
    const executionContext = await this.planExecutionContext.buildContext({
      userId,
      surface,
      timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
      anchorDate:
        typeof body.anchorDate === 'string' ? body.anchorDate : undefined,
      planId: typeof body.planId === 'string' ? body.planId : undefined,
      planWorkoutId:
        typeof body.planWorkoutId === 'string' ? body.planWorkoutId : undefined,
      activityId:
        typeof body.activityId === 'string' ||
        typeof body.activityId === 'number'
          ? body.activityId
          : undefined,
      sourceNode: body.sourceNode,
    });
    const fallback = this.buildPlanExecutionAdviceFallback({
      locale,
      context: executionContext,
      fallbackSummary: body.fallbackSummary,
      fallbackTags: body.fallbackTags,
    });
    if (params.allowAi === false) {
      return {
        ...fallback,
        source: 'fallback',
        shouldRefresh: false,
        generatedAt: null,
        factHash: executionContext.factHash,
      };
    }
    const grounding = this.buildGrounding(executionContext);
    const cacheAnchor = {
      promptVersion: 'plan_execution_v6_coach_voice',
      surface,
      anchorDate: executionContext.anchor.anchorDate,
      planId: executionContext.anchor.planId,
      planWorkoutId: executionContext.anchor.planWorkoutId,
      activityId: executionContext.anchor.activityId,
    };
    const cacheKey = sha256Hex(stableJson(cacheAnchor));

    // The plans overview has no plan-specific advice to generate until a plan is
    // active. Keeping this deterministic also prevents an empty competition
    // context from being mistaken for evidence that the athlete is racing.
    if (shouldUseDeterministicPlanAdvice(surface, grounding)) {
      return this.cacheAndReturnFallback({
        userId,
        locale,
        cacheKey,
        surface,
        executionContext,
        cacheAnchor,
        fallback,
      });
    }

    const cached = await this.readPlanExecutionAdviceCache({
      userId,
      locale,
      cacheKey,
    });
    const cachedGrounding = cached
      ? validatePlanExecutionAdviceGrounding({
          summary: cached.summary,
          tags: normalizeStringArray(cached.tags),
          grounding,
        })
      : null;
    if (
      cached?.signature_hash === executionContext.factHash &&
      cachedGrounding?.valid
    ) {
      return {
        summary: cached.summary,
        tags: normalizeStringArray(cached.tags),
        source: cached.source === 'generated' ? 'cache' : 'fallback',
        shouldRefresh: false,
        generatedAt: cached.generated_at,
        factHash: executionContext.factHash,
      };
    }

    const access = await this.featureAccess.evaluate(userId, ['ai.planAdvice']);
    if (!featureAllowed(access, 'ai.planAdvice')) {
      return this.cacheAndReturnFallback({
        userId,
        locale,
        cacheKey,
        surface,
        executionContext,
        cacheAnchor,
        fallback,
      });
    }

    const promptContext = this.buildPlanExecutionAdvicePromptContext({
      locale,
      context: executionContext,
    });
    const contextText = safeLogJson(promptContext);
    if (contextText.length > 10_000) {
      return this.cacheAndReturnFallback({
        userId,
        locale,
        cacheKey,
        surface,
        executionContext,
        cacheAnchor,
        fallback,
      });
    }

    const abort = new AbortController();
    const timeoutMsRaw = Number(
      process.env.AI_PLAN_EXECUTION_ADVICE_TIMEOUT_MS ||
        process.env.AI_TODAY_SUGGESTION_TIMEOUT_MS ||
        35_000,
    );
    const timeoutMs =
      Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 35_000;
    const timer = setTimeout(
      () => abort.abort('plan_execution_advice_timeout'),
      Math.max(1, timeoutMs),
    );

    try {
      const result = await this.aiService.generateTrainingAdviceSnippet({
        userId,
        lang: locale,
        context: promptContext as AiTrainingAdviceContext,
        taskType: 'PLAN_EXECUTION_ADVICE',
        usageKind: $Enums.AiUsageKind.OTHER,
        triggerType: 'PLAN_EXECUTION_ADVICE',
        triggerRef: surface,
        signal: abort.signal,
        allowWithoutConsent: params.allowWithoutConsent,
      });
      if (!result.replayed) {
        await this.aiUsage.recordUsageEvent({
          userId,
          operationId: result.operationId,
          callKey: `${result.operationId}:background-aggregate`,
          kind: $Enums.AiUsageKind.OTHER,
          provider: result.provider,
          model: result.model,
          usage: result.usage,
          sid: `plan-execution-advice:${surface.toLowerCase()}`,
        });
      }
      const generatedGrounding = validatePlanExecutionAdviceGrounding({
        summary: result.summary,
        tags: result.tags,
        grounding,
      });
      if (!generatedGrounding.valid) {
        this.logger.warn(
          `[AI][plan-execution-advice] rejected ungrounded output userId=${userId} surface=${surface} reason=${generatedGrounding.reason}`,
        );
        return this.cacheAndReturnFallback({
          userId,
          locale,
          cacheKey,
          surface,
          executionContext,
          cacheAnchor,
          fallback,
        });
      }
      await this.writePlanExecutionAdviceCache({
        userId,
        locale,
        cacheKey,
        surface,
        anchorDate: executionContext.anchor.anchorDate,
        planId: executionContext.anchor.planId,
        planWorkoutId: executionContext.anchor.planWorkoutId,
        activityId: executionContext.anchor.activityId,
        signatureHash: executionContext.factHash,
        keyContext: cacheAnchor,
        summary: result.summary,
        tags: result.tags,
        source: 'generated',
        provider: result.provider,
        model: result.model,
      });
      return {
        summary: result.summary,
        tags: result.tags,
        source: 'generated',
        shouldRefresh: false,
        generatedAt: new Date().toISOString(),
        factHash: executionContext.factHash,
      };
    } catch (error) {
      this.logger.warn(
        `[AI][plan-execution-advice] fallback userId=${userId} surface=${surface} reason=${String(
          error instanceof Error ? error.message : error,
        ).slice(0, 160)}`,
      );
      return this.cacheAndReturnFallback({
        userId,
        locale,
        cacheKey,
        surface,
        executionContext,
        cacheAnchor,
        fallback,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async cacheAndReturnFallback(params: {
    userId: string;
    locale: SupportedAppLocale;
    cacheKey: string;
    surface: PlanExecutionSurface;
    executionContext: PlanExecutionContext;
    cacheAnchor: Record<string, unknown>;
    fallback: { summary: string; tags: string[] };
  }): Promise<PlanExecutionAdviceResult> {
    await this.writePlanExecutionAdviceCache({
      userId: params.userId,
      locale: params.locale,
      cacheKey: params.cacheKey,
      surface: params.surface,
      anchorDate: params.executionContext.anchor.anchorDate,
      planId: params.executionContext.anchor.planId,
      planWorkoutId: params.executionContext.anchor.planWorkoutId,
      activityId: params.executionContext.anchor.activityId,
      signatureHash: params.executionContext.factHash,
      keyContext: params.cacheAnchor,
      summary: params.fallback.summary,
      tags: params.fallback.tags,
      source: 'fallback',
    });
    return {
      ...params.fallback,
      source: 'fallback',
      shouldRefresh: false,
      generatedAt: null,
      factHash: params.executionContext.factHash,
    };
  }

  private buildPlanExecutionAdviceFallback(params: {
    locale: SupportedAppLocale;
    context: PlanExecutionContext;
    fallbackSummary?: string;
    fallbackTags?: string[];
  }) {
    const fallbackSummary = String(params.fallbackSummary ?? '').trim();
    const fallbackTags = normalizeStringArray(params.fallbackTags).slice(0, 5);
    if (fallbackSummary) {
      return {
        summary: fallbackSummary.slice(0, 500),
        tags: fallbackTags,
      };
    }

    const text = (key: string, args?: Record<string, string | number>) =>
      aiFallbackText(this.i18n, params.locale, `planExecution.${key}`, args);
    const state = params.context.day.completionState;
    const todayCount = params.context.day.plannedWorkouts.length;
    const tomorrowCount = params.context.tomorrow.plannedWorkouts.length;
    const linkedCount = params.context.day.linkedActivities.length;
    const unlinkedCount = params.context.day.unlinkedActivities.length;

    if (state === 'COMPLETED') {
      return {
        summary:
          tomorrowCount > 0
            ? text(
                tomorrowCount === 1
                  ? 'completedWithTomorrowOne'
                  : 'completedWithTomorrowMany',
                { count: tomorrowCount },
              )
            : text('completed'),
        tags: [text('tags.completed'), text('tags.recoveryPriority')],
      };
    }
    if (state === 'PARTIAL') {
      return {
        summary: text('partial', { count: linkedCount }),
        tags: [text('tags.partial'), text('tags.adjustByFeel')],
      };
    }
    if (state === 'PLANNED') {
      return {
        summary:
          todayCount > 0
            ? text(todayCount === 1 ? 'plannedOne' : 'plannedMany', {
                count: todayCount,
              })
            : text('plannedNone'),
        tags: [text('tags.planned'), text('tags.controlIntensity')],
      };
    }
    if (state === 'EXTRA_ACTIVITY') {
      return {
        summary: text(unlinkedCount === 1 ? 'extraOne' : 'extraMany', {
          count: unlinkedCount,
        }),
        tags: [text('tags.extraActivity'), text('tags.checkLink')],
      };
    }
    if (state === 'REST_DAY') {
      return {
        summary:
          tomorrowCount > 0
            ? text(
                tomorrowCount === 1
                  ? 'restWithTomorrowOne'
                  : 'restWithTomorrowMany',
                { count: tomorrowCount },
              )
            : text('rest'),
        tags: [text('tags.restDay'), text('tags.recovery')],
      };
    }
    return {
      summary: text('noPlan'),
      tags: [text('tags.noPlan'), text('tags.setGoal')],
    };
  }

  private buildPlanExecutionAdvicePromptContext(params: {
    locale: SupportedAppLocale;
    context: PlanExecutionContext;
  }) {
    const executionContext = params.context;
    const localeTag = params.locale;
    const date = executionContext.anchor.anchorDate;
    const timezone = executionContext.anchor.timezone;
    const grounding = this.buildGrounding(executionContext);
    const weekday = new Intl.DateTimeFormat(localeTag, {
      weekday: 'short',
      timeZone: timezone || 'UTC',
    }).format(new Date(`${date}T12:00:00.000Z`));
    const toSuggestionWorkout = (
      workout: (typeof executionContext.day.plannedWorkouts)[number],
    ) => ({
      workoutId: workout.id,
      title:
        String(workout.name ?? '').trim() ||
        String(workout.notes ?? '').trim() ||
        String(workout.text ?? '').trim() ||
        aiFallbackText(this.i18n, params.locale, 'today.fact.defaultWorkout'),
      sport:
        String(workout.sportType ?? '')
          .trim()
          .toUpperCase() || null,
      duration: null,
      status: String(workout.status ?? '').trim(),
      focus: String(workout.notes ?? '').trim() || null,
      expectedLoad: workout.expectedLoad,
      linkedActivityCount: workout.linkedActivities.length,
    });
    const dayActivities = [
      ...executionContext.day.linkedActivities,
      ...executionContext.day.unlinkedActivities,
    ].sort((a, b) =>
      String(b.startTime ?? '').localeCompare(String(a.startTime ?? '')),
    );
    const recentActivity = dayActivities[0] ?? null;

    return {
      locale: params.locale,
      date,
      weekday,
      timezone,
      surface: executionContext.anchor.surface,
      groundingRules: {
        ...grounding,
        currentPlanWeekRule:
          grounding.currentPlanWeekIndex == null
            ? 'The current plan week is unknown. Do not invent a numbered plan week.'
            : `currentPlanWeekIndex is 1-based and already human-readable: ${grounding.currentPlanWeekIndex} means the athlete is currently in plan week ${grounding.currentPlanWeekIndex} of ${executionContext.plan?.periodWeeks ?? 'unknown'}. Use it exactly as provided; do not add or subtract 1, and do not mention a different numbered plan week.`,
        competitionClaimRule: grounding.hasActiveCompetitionInfluence
          ? 'Only describe the exact phase supplied by competitionContext.activeInfluences.'
          : 'There is no active competition influence. Do not say the athlete is in a race, competition, taper, peak, or post-race phase.',
        weeklyLoadRule:
          grounding.currentWeekComparison ===
          'WEEK_TO_DATE_VS_FULL_PREVIOUS_WEEK'
            ? 'currentWeekLoad is week-to-date while previousWeekLoad is a full week. Label it as week-to-date and do not call the difference a drop, decline, or unusually low.'
            : 'Both weekly load values cover full weeks and may be compared directly.',
      },
      factHash: executionContext.factHash,
      contextId: executionContext.contextId,
      dayCompletionState: executionContext.day.completionState,
      activePlan: executionContext.plan
        ? {
            title: executionContext.plan.title,
            goal: executionContext.plan.goal,
            periodWeeks: executionContext.plan.periodWeeks,
            currentWeekIndex: executionContext.plan.currentWeekIndex,
          }
        : null,
      currentWorkout: executionContext.currentWorkout
        ? toSuggestionWorkout(executionContext.currentWorkout)
        : null,
      todayWorkouts:
        executionContext.day.plannedWorkouts.map(toSuggestionWorkout),
      tomorrowWorkouts:
        executionContext.tomorrow.plannedWorkouts.map(toSuggestionWorkout),
      nextWorkouts: executionContext.nextWorkouts.map(toSuggestionWorkout),
      load: {
        currentWeekLoad: executionContext.recentLoad.currentWeekLoad,
        previousWeekLoad: executionContext.recentLoad.previousWeekLoad,
        loadDrift:
          executionContext.recentLoad.currentWeekLoad != null &&
          executionContext.recentLoad.previousWeekLoad != null
            ? Math.round(
                executionContext.recentLoad.currentWeekLoad -
                  executionContext.recentLoad.previousWeekLoad,
              )
            : null,
        ctl: executionContext.recentLoad.ctl,
        atl: executionContext.recentLoad.atl,
        tsb: executionContext.recentLoad.tsb,
      },
      recentActivity,
      _timingHints: {
        todayLocalDate: date,
        recentActivityLocalDate: recentActivity?.localDate ?? null,
        recentActivityDayRelation:
          recentActivity?.localDate === date ? 'today' : 'unknown',
        recentActivityLocalTime: recentActivity?.localStartTime ?? null,
        recentActivityLocalHour: recentActivity?.localHour ?? null,
        recentActivityDayPeriod: recentActivity?.dayPeriod ?? null,
      },
      linkedActivities: executionContext.day.linkedActivities,
      unlinkedActivities: executionContext.day.unlinkedActivities,
      recentEvents: executionContext.recentEvents.slice(0, 5),
      competitionContext: executionContext.competitionContext,
      weather: {
        status: 'unavailable',
        summary: null,
        temperatureC: null,
        feelsLikeC: null,
        precipitationProbability: null,
        windKph: null,
        airQuality: null,
      },
    };
  }

  private buildGrounding(
    context: PlanExecutionContext,
  ): PlanExecutionAdviceGrounding {
    const anchor = new Date(`${context.anchor.anchorDate}T00:00:00.000Z`);
    const currentWeekElapsedDays = anchor.getUTCDay() || 7;
    const hasActiveCompetitionInfluence =
      context.competitionContext.activeInfluences.some((influence) =>
        Boolean(String(influence.phase ?? '').trim()),
      );
    const completedWorkoutCount = context.day.plannedWorkouts.filter(
      (workout) => workout.status === 'DONE',
    ).length;
    const dayActivities = [
      ...context.day.linkedActivities,
      ...context.day.unlinkedActivities,
    ];
    const recentActivity = [...dayActivities].sort((a, b) =>
      String(b.startTime ?? '').localeCompare(String(a.startTime ?? '')),
    )[0];
    return {
      hasActivePlan: Boolean(context.plan),
      currentPlanWeekIndex: context.plan?.currentWeekIndex ?? null,
      hasActiveCompetitionInfluence,
      completedWorkoutCount,
      recordedActivityCount: dayActivities.length,
      recentActivityDayPeriod: recentActivity?.dayPeriod ?? null,
      currentWeekElapsedDays,
      currentWeekComparison:
        currentWeekElapsedDays < 7
          ? 'WEEK_TO_DATE_VS_FULL_PREVIOUS_WEEK'
          : 'FULL_WEEK_VS_FULL_PREVIOUS_WEEK',
    };
  }

  private async readPlanExecutionAdviceCache(params: {
    userId: string;
    locale: SupportedAppLocale;
    cacheKey: string;
  }) {
    const rows = await this.prisma.$queryRaw<PlanExecutionAdviceCacheRow[]>(
      Prisma.sql`
        SELECT summary, tags, source, signature_hash, generated_at
        FROM "t_ai_plan_execution_advice"
        WHERE "user_id" = ${params.userId}
          AND "locale" = ${params.locale}
          AND "cache_key" = ${params.cacheKey}
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }

  private async writePlanExecutionAdviceCache(params: {
    userId: string;
    locale: SupportedAppLocale;
    cacheKey: string;
    surface: PlanExecutionSurface;
    anchorDate: string;
    planId: string | null;
    planWorkoutId: string | null;
    activityId: string | number | null;
    signatureHash: string;
    keyContext: unknown;
    summary: string;
    tags: string[];
    source: 'generated' | 'fallback';
    provider?: string | null;
    model?: string | null;
  }) {
    const activityId =
      params.activityId == null ? null : String(params.activityId);
    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "t_ai_plan_execution_advice" (
          "id",
          "created_at",
          "updated_at",
          "user_id",
          "locale",
          "cache_key",
          "surface",
          "anchor_date",
          "plan_id",
          "plan_workout_id",
          "activity_id",
          "signature_hash",
          "key_context",
          "summary",
          "tags",
          "source",
          "provider",
          "model",
          "generated_at"
        )
        VALUES (
          ${randomUUID()},
          NOW(),
          NOW(),
          ${params.userId},
          ${params.locale},
          ${params.cacheKey},
          ${params.surface},
          ${params.anchorDate},
          ${params.planId},
          ${params.planWorkoutId},
          ${activityId},
          ${params.signatureHash},
          CAST(${JSON.stringify(params.keyContext)} AS jsonb),
          ${params.summary},
          CAST(${JSON.stringify(params.tags)} AS jsonb),
          ${params.source},
          ${params.provider ?? null},
          ${params.model ?? null},
          NOW()
        )
        ON CONFLICT ("user_id", "locale", "cache_key")
        DO UPDATE SET
          "updated_at" = NOW(),
          "surface" = EXCLUDED."surface",
          "anchor_date" = EXCLUDED."anchor_date",
          "plan_id" = EXCLUDED."plan_id",
          "plan_workout_id" = EXCLUDED."plan_workout_id",
          "activity_id" = EXCLUDED."activity_id",
          "signature_hash" = EXCLUDED."signature_hash",
          "key_context" = EXCLUDED."key_context",
          "summary" = EXCLUDED."summary",
          "tags" = EXCLUDED."tags",
          "source" = EXCLUDED."source",
          "provider" = EXCLUDED."provider",
          "model" = EXCLUDED."model",
          "generated_at" = EXCLUDED."generated_at"
      `,
    );
  }
}
