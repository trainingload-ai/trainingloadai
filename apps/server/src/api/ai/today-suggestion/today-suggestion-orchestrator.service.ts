import { publicRuntimeText, type PublicRuntimeKey } from '@/utils/public-runtime-copy';
import { resolveSupportedLocale } from '@/utils/locale.util';
import { TodaySuggestionGuidanceLifecycle } from './today-suggestion-guidance.service';
import {
  TodaySuggestionGenerationService,
  TodayGenerationLeaseLost,
  type TodayGenerationLease,
} from './today-suggestion-generation.service';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import type {
  TodaySuggestionDeliveryReason,
  TodaySuggestionDeliveryState,
  TodaySuggestionV2,
} from '@shared/ai-today-suggestion-contract';
import { isTodaySuggestionWorkout } from '@shared/ai-today-suggestion-contract';
import { stableJson } from '../core/ai-common.util';
import { isCoachModelTimeoutError } from '../core/tool-loop-agent.runtime';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import { PrismaService } from '@/prisma/prisma.service';
import { TodaySuggestionAgentService } from './today-suggestion-agent.service';
import { TodaySuggestionConstraintProjector } from './today-suggestion-constraint.projector';
import { TodaySuggestionDeliveryPolicy } from './today-suggestion-delivery-policy';
import { TodaySuggestionEngagementService } from './today-suggestion-engagement.service';
import { TodaySuggestionWorkoutGeneratorService } from './today-suggestion-workout-generator.service';
import type {
  TodaySuggestionConstraintProjection,
  TodaySuggestionDraft,
} from './today-suggestion.types';
import {
  hasRecentTrainingActivity,
  todaySuggestionCoachAvailable,
} from './today-suggestion.types';
import type { TodayWeatherLocation } from '@/weather/weather.types';

export type TodaySuggestionResponseV2 = TodaySuggestionV2 & {
  tags: string[];
  source: 'fallback' | 'cache' | 'generated';
  shouldRefresh: boolean;
  retryAt?: string;
  generatedAt: string | null;
  reason: string;
  tone: 'neutral' | 'warning' | 'success';
  weatherAttribution?: {
    serviceName: string;
    modified: true;
    legalPageUrl?: string;
  };
};

type TodaySuggestionAttempt = { runId: string; attemptId?: string };
type TodaySuggestionDeliveryTrace = {
  date?: string;
  attempts: TodaySuggestionAttempt[];
};

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function deterministicGenerationToken(parts: string[]) {
  const hex = createHash('sha256').update(parts.join('\u001f')).digest('hex');
  const bytes = hex.slice(0, 32).split('');
  bytes[12] = '5';
  bytes[16] = ((Number.parseInt(bytes[16] ?? '0', 16) & 0x3) | 0x8).toString(
    16,
  );
  const value = bytes.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function storedV2(value: unknown): TodaySuggestionV2 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.version !== 2 ||
    typeof row.suggestionId !== 'string' ||
    typeof row.headline !== 'string' ||
    typeof row.summary !== 'string' ||
    typeof row.validUntil !== 'string' ||
    !row.delivery ||
    typeof row.delivery !== 'object'
  ) {
    return null;
  }
  const intents = [
    row.primaryIntent,
    ...(Array.isArray(row.secondaryIntents) ? row.secondaryIntents : []),
  ];
  if (
    intents.some((intent) => {
      if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
        return false;
      }
      const candidate = intent as Record<string, unknown>;
      return (
        candidate.type === 'CREATE_TODAY_WORKOUT' &&
        !isTodaySuggestionWorkout(candidate.preview)
      );
    })
  ) {
    return null;
  }
  return row as unknown as TodaySuggestionV2;
}

function keyContext(
  projection: TodaySuggestionConstraintProjection,
): Prisma.InputJsonValue {
  return jsonValue({
    factHash: projection.factHash,
    constraintHash: projection.constraintHash,
    continuityHash: projection.continuityHash,
    edition: projection.edition,
    timezone: projection.timezone,
    weatherImpact: projection.weatherImpact,
  });
}

function cachedWeatherMatches(
  value: unknown,
  projection: TodaySuggestionConstraintProjection,
) {
  const context =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return (
    stableJson(context.weatherImpact ?? { status: 'unavailable' }) ===
    stableJson(projection.weatherImpact ?? { status: 'unavailable' })
  );
}

function keyContextTimezone(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const timezone = (value as Record<string, unknown>).timezone;
  return typeof timezone === 'string' && timezone.trim()
    ? timezone.trim()
    : null;
}

@Injectable()
export class TodaySuggestionOrchestratorService {
  private readonly logger = new Logger(TodaySuggestionOrchestratorService.name);
  private readonly requestTails = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly projector: TodaySuggestionConstraintProjector,
    private readonly agent: TodaySuggestionAgentService,
    private readonly workoutGenerator: TodaySuggestionWorkoutGeneratorService,
    private readonly delivery: TodaySuggestionDeliveryPolicy,
    private readonly engagement: TodaySuggestionEngagementService,
    private readonly generations: TodaySuggestionGenerationService,
    @Optional() private readonly guidance?: TodaySuggestionGuidanceLifecycle,
  ) {}

  get(args: {
    userId: string;
    locale: string;
    timezone?: string | null;
    location?: TodayWeatherLocation | null;
    allowAi: boolean;
    allowWithoutConsent?: boolean;
    signal?: AbortSignal;
  }) {
    return this.serialized(args.userId, async () => {
      const trace: TodaySuggestionDeliveryTrace = { attempts: [] };
      const result = await this.generate(args, trace);
      if (trace.date) {
        const { state, reasonCode } = result.delivery;
        const attempts: TodaySuggestionAttempt[] =
          trace.attempts.length > 0 ? trace.attempts : [{ runId: 'none' }];
        for (const [index, { runId, attemptId }] of attempts.entries()) {
          const event =
            index === attempts.length - 1 ? 'outcome' : 'superseded outcome';
          this.logger.log(
            `[AI][today-suggestion-v2] ${event} userId=${args.userId} date=${trace.date} state=${state} reason=${reasonCode} runId=${runId} attemptId=${attemptId ?? 'none'}`,
          );
        }
      }
      return result;
    });
  }

  private async generate(
    args: {
      userId: string;
      locale: string;
      timezone?: string | null;
      location?: TodayWeatherLocation | null;
      allowAi: boolean;
      allowWithoutConsent?: boolean;
      signal?: AbortSignal;
    },
    trace: TodaySuggestionDeliveryTrace,
    revisionRetry = 0,
    lease?: TodayGenerationLease,
    waitAttempt = 0,
  ): Promise<TodaySuggestionResponseV2> {
    let projection = await this.projector.project(args);
    const reconciled = await this.guidance?.reconcile(projection);
    if (reconciled?.changed) projection = await this.projector.project(args);
    const cached = await this.prisma.aiTodaySuggestion.findUnique({
      where: {
        ai_today_suggestion_user_locale_date_unique: {
          userId: args.userId,
          locale: args.locale,
          date: projection.date,
        },
      },
    });
    const cachedResult = storedV2(cached?.structuredResult);
    const cachedIsGenerated =
      cachedResult?.delivery.state === 'GENERATED' ||
      cachedResult?.delivery.state === 'CACHED';
    const cachedFallbackStillFresh = Boolean(
      cached && Date.now() - cached.generatedAt.getTime() < 60_000,
    );
    if (
      cached &&
      cachedResult &&
      (cachedIsGenerated ||
        (cachedResult.delivery.state === 'AI_UNAVAILABLE' &&
          ['AI_DISABLED', 'ACCESS_DENIED'].includes(
            cachedResult.delivery.reasonCode,
          )) ||
        cachedFallbackStillFresh) &&
      cached.constraintHash === projection.constraintHash &&
      cached.signatureHash === projection.factHash &&
      cachedWeatherMatches(cached.keyContext, projection) &&
      cached.validUntil &&
      cached.validUntil.getTime() > Date.now() &&
      (cachedResult.recommendation.kind !== 'TRAIN' ||
        (cachedResult.recommendation.durationMinutes ?? 0) <=
          (projection.minutesUntilDayEnd ?? 1_440))
    ) {
      if (trace.attempts.length > 0) trace.date = projection.date;
      if (keyContextTimezone(cached.keyContext) !== projection.timezone) {
        await this.prisma.aiTodaySuggestion.update({
          where: { id: cached.id },
          data: { keyContext: keyContext(projection) },
        });
      }
      await this.engagement.rollover({
        userId: args.userId,
        generationToken: cached.generationToken,
        continuityHash: projection.continuityHash,
        suggestionDate: projection.date,
      });
      return this.present(
        {
          ...cachedResult,
          delivery: cachedIsGenerated
            ? {
                state: 'CACHED',
                reasonCode: 'CACHE_HIT',
                generatedAt: cached.generatedAt.toISOString(),
                cached: true,
              }
            : { ...cachedResult.delivery, cached: true },
        },
        cached.tags,
        projection,
      );
    }

    const scope = {
      userId: args.userId,
      locale: args.locale,
      date: projection.date,
      inputHash: createHash('sha256')
        .update(
          stableJson({
            facts: projection.factHash,
            constraints: projection.constraintHash,
            weather: projection.weatherImpact,
          }),
        )
        .digest('hex'),
    };
    if (!lease) {
      const claim = await this.generations.claim(scope);
      if (claim.kind !== 'ACQUIRED') {
        if (claim.kind === 'BUSY' && waitAttempt < 3) {
          await new Promise((resolve) =>
            setTimeout(resolve, [150, 350, 750][waitAttempt]),
          );
          return this.generate(
            args,
            trace,
            revisionRetry,
            undefined,
            waitAttempt + 1,
          );
        }
        return this.currentFallback(
          projection,
          claim.kind === 'BUSY' ? 'GENERATION_IN_PROGRESS' : 'RETRY_COOLDOWN',
          new Date(
            claim.kind === 'BUSY'
              ? Math.min(claim.retryAt.getTime(), Date.now() + 15_000)
              : claim.retryAt.getTime(),
          ),
        );
      }
      try {
        return await this.generate(args, trace, revisionRetry, claim.lease);
      } catch (error) {
        if (!(error instanceof TodayGenerationLeaseLost)) throw error;
        const latest = await this.projector.project(args);
        if (trace.attempts.length > 0) trace.date = latest.date;
        return this.currentFallback(
          latest,
          'GENERATION_IN_PROGRESS',
          new Date(Date.now() + 15_000),
        );
      } finally {
        await this.generations.release(claim.lease);
      }
    }
    await this.generations.bind(lease, scope);
    trace.date = projection.date;

    // Viewing a card is optional and must never alter the training prescription.
    let draft: TodaySuggestionDraft;
    let state: TodaySuggestionDeliveryState;
    let reasonCode: TodaySuggestionDeliveryReason;
    let provider: string | null = null;
    let model: string | null = null;
    let runId: string | null = null;
    let attempt: TodaySuggestionAttempt | undefined;
    let workoutRunId: string | null = null;
    let generatedAt: Date | null = null;

    if (!projection.allowAi || !projection.featureAllowed) {
      draft = this.factFallback(projection);
      state = 'AI_UNAVAILABLE';
      reasonCode = projection.allowAi ? 'ACCESS_DENIED' : 'AI_DISABLED';
    } else if (
      ['not_configured', 'disabled', 'misconfigured'].includes(
        projection.aiState ?? '',
      )
    ) {
      draft = this.factFallback(projection);
      state = 'AI_UNAVAILABLE';
      reasonCode = 'AI_NOT_CONFIGURED';
    } else if (
      projection.coachState?.decisionReadStatus === 'UNAVAILABLE' ||
      projection.coachState?.assessmentReadStatus === 'UNAVAILABLE' ||
      (projection.lightContext.sharedFacts as { status?: string } | undefined)
        ?.status === 'LIMITED'
    ) {
      draft = this.factFallback(projection);
      state = 'FACT_FALLBACK';
      reasonCode = 'COACH_STATE_UNAVAILABLE';
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort('timeout'), 60_000);
      try {
        const run = await this.agent.run({
          projection,
          signal: controller.signal,
          allowWithoutConsent: args.allowWithoutConsent,
          onRunStarted: (id, attemptId) => {
            attempt = { runId: id, attemptId };
            trace.attempts.push(attempt);
          },
        });
        if (!attempt) {
          attempt = { runId: run.runId };
          trace.attempts.push(attempt);
        }
        draft = run.draft;
        lease.failure = undefined;
        if (draft.preferredIntent === 'CREATE_TODAY_WORKOUT') {
          const workoutController = new AbortController();
          const workoutTimeout = setTimeout(
            () => workoutController.abort('timeout'),
            60_000,
          );
          try {
            const generated = await this.workoutGenerator.generate({
              projection,
              draft,
              signal: workoutController.signal,
              allowWithoutConsent: args.allowWithoutConsent,
            });
            if (
              draft.trainingBasis?.kind === 'ADDITIONAL' &&
              !isTodaySuggestionWorkout(generated.workout)
            )
              throw new Error(
                'TODAY_SUGGESTION_OUTPUT_REJECTED_ADDITIONAL_WORKOUT',
              );
            draft = { ...draft, generatedWorkout: generated.workout };
            workoutRunId = generated.runId;
          } catch (error) {
            if (draft.trainingBasis?.kind === 'ADDITIONAL')
              throw Object.assign(
                new Error(
                  'TODAY_SUGGESTION_OUTPUT_REJECTED_ADDITIONAL_WORKOUT',
                ),
                { cause: error },
              );
            this.logger.warn(
              `[AI][today-suggestion-workout] unavailable userId=${args.userId} date=${projection.date} reason=${this.errorMessage(error)}`,
            );
            draft = {
              ...draft,
              preferredIntent: null,
              secondaryIntents: draft.secondaryIntents.filter(
                (intent) => intent !== 'CREATE_TODAY_WORKOUT',
              ),
            };
          } finally {
            clearTimeout(workoutTimeout);
          }
        }
        provider = run.provider;
        model = run.model;
        runId = run.runId;
        generatedAt = new Date();
        state = 'GENERATED';
        reasonCode = 'GENERATED';
      } catch (error) {
        draft = this.factFallback(projection);
        reasonCode = this.reasonFromError(error, controller.signal.aborted);
        if (
          !['AI_NOT_CONFIGURED', 'AI_DISABLED', 'ACCESS_DENIED'].includes(
            reasonCode,
          )
        )
          lease.failure = reasonCode;
        state =
          reasonCode === 'AI_NOT_CONFIGURED'
            ? 'AI_UNAVAILABLE'
            : 'FACT_FALLBACK';
        this.logger.warn(
          `[AI][today-suggestion-v2] fallback userId=${args.userId} date=${projection.date} reason=${reasonCode}`,
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    const latest = await this.projector.project(args);
    if (
      latest.factHash !== projection.factHash ||
      latest.constraintHash !== projection.constraintHash ||
      !cachedWeatherMatches(keyContext(projection), latest)
    ) {
      if (revisionRetry < 1 && !lease.failure) {
        if (attempt) {
          this.logger.log(
            `[AI][today-suggestion-v2] attempt superseded reason=FACTS_CHANGED runId=${attempt.runId} attemptId=${attempt.attemptId ?? 'none'}`,
          );
        }
        return this.generate(args, trace, revisionRetry + 1, lease);
      }
      projection = latest;
      draft = this.factFallback(latest);
      state = 'FACT_FALLBACK';
      reasonCode = lease.failure ? reasonCode : 'FACTS_CHANGED';
      lease.failure ??= 'FACTS_CHANGED';
      generatedAt = null;
      runId = null;
      workoutRunId = null;
      provider = null;
      model = null;
    }

    await this.generations.bind(lease, {
      ...scope,
      date: projection.date,
      inputHash: createHash('sha256')
        .update(
          stableJson({
            facts: projection.factHash,
            constraints: projection.constraintHash,
            weather: projection.weatherImpact,
          }),
        )
        .digest('hex'),
    });
    const generationToken = deterministicGenerationToken([
      args.userId,
      args.locale,
      projection.factHash,
      projection.constraintHash,
      projection.continuityHash,
      stableJson(projection.weatherImpact ?? { status: 'unavailable' }),
      state,
      reasonCode,
      runId ?? 'no-run',
      workoutRunId ?? 'no-workout-run',
    ]);
    const delivered = this.delivery.build({
      projection,
      draft,
      generationToken,
      state,
      reasonCode,
      generatedAt,
    });
    const result = {
      ...delivered,
      ...(projection.weatherAttribution
        ? { weatherAttribution: projection.weatherAttribution }
        : {}),
    };
    const write = {
      where: {
        ai_today_suggestion_user_locale_date_unique: {
          userId: args.userId,
          locale: args.locale,
          date: projection.date,
        },
      },
      create: {
        userId: args.userId,
        locale: args.locale,
        date: projection.date,
        signatureHash: projection.factHash,
        constraintHash: projection.constraintHash,
        continuityHash: projection.continuityHash,
        keyContext: keyContext(projection),
        summary: result.summary,
        tags: jsonValue(draft.tags),
        resultVersion: 2,
        structuredResult: jsonValue(result),
        generationToken,
        validUntil: new Date(result.validUntil),
        runId,
        provider,
        model,
        generatedAt: generatedAt ?? new Date(),
      },
      update: {
        signatureHash: projection.factHash,
        constraintHash: projection.constraintHash,
        continuityHash: projection.continuityHash,
        keyContext: keyContext(projection),
        summary: result.summary,
        tags: jsonValue(draft.tags),
        resultVersion: 2,
        structuredResult: jsonValue(result),
        generationToken,
        validUntil: new Date(result.validUntil),
        runId,
        provider,
        model,
        generatedAt: generatedAt ?? new Date(),
      },
    };
    const persisted = await this.generations.publish(lease, async (tx) => {
      await acquireHashtextAdvisoryXactLock(
        tx,
        `today-advice:${args.userId}:${args.locale}:${projection.date}`,
      );
      const current = await tx.aiTodaySuggestion.findUnique({
        where: write.where,
      });
      const currentResult = storedV2(current?.structuredResult);
      if (
        state !== 'GENERATED' &&
        current &&
        currentResult &&
        ['GENERATED', 'CACHED'].includes(currentResult.delivery.state) &&
        current.signatureHash === projection.factHash &&
        current.constraintHash === projection.constraintHash &&
        current.validUntil &&
        current.validUntil.getTime() > Date.now() &&
        cachedWeatherMatches(current.keyContext, projection)
      ) {
        return current;
      }
      return tx.aiTodaySuggestion.upsert(write);
    });
    const persistedResult = storedV2(persisted.structuredResult) ?? result;
    await this.engagement.rollover({
      userId: args.userId,
      generationToken: persisted.generationToken,
      continuityHash: projection.continuityHash,
      suggestionDate: projection.date,
    });
    trace.date = projection.date;
    return this.present(
      persisted.generationToken === generationToken
        ? persistedResult
        : {
            ...persistedResult,
            delivery: {
              ...persistedResult.delivery,
              state: 'CACHED',
              reasonCode: 'CACHE_HIT',
              cached: true,
            },
          },
      persisted.tags,
      projection,
    );
  }

  private async currentFallback(
    projection: TodaySuggestionConstraintProjection,
    reasonCode: TodaySuggestionDeliveryReason,
    retryAt: Date,
  ): Promise<TodaySuggestionResponseV2> {
    const draft = this.factFallback(projection);
    const generationToken = await this.generations.contextToken(
      projection.userId,
      projection.timezone,
    );
    return {
      ...this.present(
        this.delivery.build({
          projection,
          draft,
          generationToken,
          state: 'FACT_FALLBACK',
          reasonCode,
          generatedAt: null,
        }),
        draft.tags,
        projection,
      ),
      retryAt: retryAt.toISOString(),
    };
  }

  private factFallback(
    projection: TodaySuggestionConstraintProjection,
  ): TodaySuggestionDraft {
    const locale = resolveSupportedLocale(projection.locale);
    const t = (key: PublicRuntimeKey, values?: Record<string, string | number>) =>
      publicRuntimeText(locale, key, values);
    if (
      projection.coachState?.assessmentReadStatus === 'UNAVAILABLE' ||
      (projection.lightContext?.sharedFacts as { status?: string } | undefined)
        ?.status === 'LIMITED'
    )
      return {
        headline: t('today.lowDemand'),
        summary: t('today.insufficientEvidence'),
        recommendation: { kind: 'RECOVER' },
        confidence: 'LOW',
        evidenceCodes: [],
        preferredIntent: 'ASK_COACH',
        secondaryIntents: [],
        tags: [],
      };
    if (projection.highConcern) {
      return {
        headline: t('today.conservative'),
        summary: t('today.concern'),
        recommendation: { kind: 'REST' },
        confidence: 'MEDIUM',
        evidenceCodes: ['HIGH_CONCERN'],
        preferredIntent: projection.activeDecisionId
          ? 'OPEN_DECISION'
          : 'ASK_COACH',
        secondaryIntents: [],
        tags: [t('today.needRecovery')],
      };
    }
    if (projection.userFeedback?.feedback === 'REST_TODAY') {
      return {
        headline: t('today.chosenRest'),
        summary: t('today.chosenRestBody'),
        recommendation: { kind: 'REST' },
        confidence: 'HIGH',
        evidenceCodes: [],
        preferredIntent: projection.tomorrowWorkouts.length
          ? 'VIEW_TOMORROW'
          : null,
        secondaryIntents: [],
        tags: [t('today.rest')],
      };
    }
    if (
      ['TRAINED_ELSEWHERE', 'DATA_PENDING'].includes(
        projection.userFeedback?.feedback ?? '',
      )
    ) {
      return {
        headline: t('today.recover'),
        summary: t('today.recoverBody'),
        recommendation: { kind: 'RECOVER' },
        confidence: 'MEDIUM',
        evidenceCodes: [],
        preferredIntent: projection.tomorrowWorkouts.length
          ? 'VIEW_TOMORROW'
          : null,
        secondaryIntents: [],
        tags: [t('today.recovery')],
      };
    }
    if (projection.coachState?.decisionReadStatus === 'UNAVAILABLE') {
      return {
        headline: t('today.keepConfirmed'),
        summary: t('today.decisionUnavailable'),
        recommendation: { kind: 'RECOVER' },
        confidence: 'LOW',
        evidenceCodes: [],
        preferredIntent: projection.activePlan ? 'OPEN_PLAN' : null,
        secondaryIntents: [],
        tags: [],
      };
    }
    const sharedMemory = (
      projection.lightContext?.sharedFacts as
        | { memory?: { items?: Array<{ category?: string; kind?: string }> } }
        | undefined
    )?.memory;
    if (
      sharedMemory?.items?.some(
        (item) =>
          item.kind === 'CONSTRAINT' ||
          ['pain', 'illness', 'recovery', 'fatigue'].includes(
            item.category ?? '',
          ),
      )
    )
      return {
        headline: t('today.lowDemand'),
        summary: t('today.memorySummary'),
        recommendation: { kind: 'RECOVER' },
        confidence: 'LOW',
        evidenceCodes: [],
        preferredIntent: null,
        secondaryIntents: [],
        tags: [],
      };
    const matching = (
      projection.lightContext?.workoutMatching as
        | Array<{
            activityTitle?: string;
            candidates: Array<{ name?: string; planTitle?: string | null }>;
          }>
        | undefined
    )?.[0];
    if (matching?.candidates.length) {
      const names = matching.candidates
        .slice(0, 2)
        .map((candidate) =>
          candidate.planTitle
            ? `${candidate.planTitle} · ${candidate.name || (t('today.workout'))}`
            : candidate.name || (t('today.independentWorkout')),
        );
      return {
        headline: t('today.linkActivity'),
        summary: t('today.linkActivityBody', {
          workouts: new Intl.ListFormat(locale, { type: 'disjunction' }).format(names),
        }),
        recommendation: { kind: 'RECOVER' },
        confidence: 'LOW',
        evidenceCodes: ['RECENT_ACTIVITY'],
        preferredIntent: 'OPEN_ACTIVITY_REVIEW',
        secondaryIntents: ['ASK_COACH'],
        tags: [],
      };
    }
    const current = projection.todayWorkouts.find((workout) =>
      ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
    );
    if (projection.activeDecisionId) {
      return {
        headline: t('today.unapplied'),
        summary: t('today.unappliedBody'),
        recommendation: { kind: 'ADJUST_PLAN' },
        confidence: 'MEDIUM',
        evidenceCodes: projection.activePlan ? ['PLAN_CONTEXT'] : [],
        preferredIntent: projection.activePlan ? 'OPEN_PLAN' : null,
        secondaryIntents: ['OPEN_DECISION'],
        tags: [],
      };
    }
    if (
      current &&
      !(projection.todayActivityCount ?? 0) &&
      (current.plannedDurationSeconds ?? 1_800) / 60 <=
        (projection.minutesUntilDayEnd ?? 1_440)
    ) {
      return {
        headline: t('today.followSchedule'),
        summary: t('today.followScheduleBody', { workout: current.name }),
        recommendation: {
          kind: 'TRAIN',
          ...(current.plannedDurationSeconds
            ? {
                durationMinutes: Math.ceil(current.plannedDurationSeconds / 60),
              }
            : {}),
        },
        confidence: 'MEDIUM',
        evidenceCodes: ['TODAY_WORKOUT_AVAILABLE'],
        preferredIntent: 'OPEN_TODAY_WORKOUT',
        secondaryIntents: [],
        tags: [t('today.scheduled')],
      };
    }
    if (
      (projection.todayActivityCount ?? 0) > 0 ||
      projection.constraints.includes('TODAY_WORKOUT_COMPLETED')
    ) {
      const recent =
        (projection.todayActivityCount ?? 0) > 0 &&
        Array.isArray(projection.lightContext.recentActivities)
          ? projection.lightContext.recentActivities.find(
              (item) => item.hashId === projection.latestActivityId,
            )
          : null;
      const recordedFacts: string[] = [];
      if (recent && Number.isFinite(recent.distanceKm) && recent.distanceKm > 0)
        recordedFacts.push(
          t('today.distance', { value: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(recent.distanceKm) }),
        );
      if (
        recent &&
        Number.isFinite(recent.durationMinutes) &&
        recent.durationMinutes > 0
      )
        recordedFacts.push(
          t('today.duration', { value: Math.round(recent.durationMinutes) }),
        );
      if (
        recent &&
        Number.isFinite(recent.avgHeartRate) &&
        recent.avgHeartRate > 0
      )
        recordedFacts.push(
          t('today.averageHeartRate', { value: Math.round(recent.avgHeartRate) }),
        );
      const activitySummary = recordedFacts.length
        ? t('today.recordedFacts', { facts: new Intl.ListFormat(locale, { type: 'unit' }).format(recordedFacts) })
        : t('today.recorded');
      return {
        headline: current
          ? t('today.activityPresent')
          : t('today.trainingPresent'),
        summary: current
          ? t('today.activityPresentBody', { workout: current.name })
          : t('today.recoveryNext', { activity: activitySummary, followUp: t(projection.activePlan ? 'today.continueSchedule' : 'today.unknownHistory') }),
        recommendation: { kind: 'RECOVER' },
        confidence: 'MEDIUM',
        evidenceCodes: ['RECENT_ACTIVITY'],
        preferredIntent: null,
        secondaryIntents: projection.latestActivityId
          ? ['OPEN_ACTIVITY_REVIEW']
          : [],
        tags: [],
      };
    }
    if (hasRecentTrainingActivity(projection) || current) {
      return {
        headline: t('today.easy'),
        summary: t('today.easyBody'),
        recommendation: { kind: 'RECOVER' },
        confidence: 'LOW',
        evidenceCodes: hasRecentTrainingActivity(projection)
          ? ['RECENT_ACTIVITY']
          : [],
        preferredIntent: null,
        secondaryIntents: projection.activePlan ? ['OPEN_PLAN'] : [],
        tags: [],
      };
    }
    if (
      projection.constraints.includes('ACTIVITY_PROCESSING_PENDING') ||
      projection.constraints.includes('WAITING_FOR_DATA')
    ) {
      return {
        headline: t('today.processing'),
        summary: t('today.processingBody'),
        recommendation: { kind: 'RECOVER' },
        confidence: 'LOW',
        evidenceCodes: ['ACTIVITY_PROCESSING_PENDING'],
        preferredIntent: null,
        secondaryIntents: [],
        tags: [],
      };
    }
    const noActivity = projection.constraints.includes(
      'NEVER_RECORDED_ACTIVITY',
    );
    const coachAvailable = todaySuggestionCoachAvailable(projection);
    return {
      headline: t('today.missingActivity'),
      summary: noActivity
        ? coachAvailable
          ? t('today.importOrCoach')
          : t('today.importOnly')
        : t('today.staleActivity'),
      recommendation: { kind: noActivity ? 'SYNC_DATA' : 'CHECK_IN' },
      confidence: 'LOW',
      evidenceCodes: projection.constraints,
      preferredIntent: noActivity
        ? 'OPEN_IMPORT'
        : coachAvailable
          ? 'ASK_COACH'
          : null,
      secondaryIntents: projection.activePlan
        ? coachAvailable
          ? ['OPEN_PLAN', 'ASK_COACH']
          : ['OPEN_PLAN']
        : coachAvailable
          ? ['ASK_COACH']
          : [],
      tags: [t('today.moreContext')],
    };
  }

  private reasonFromError(
    error: unknown,
    aborted: boolean,
  ): TodaySuggestionDeliveryReason {
    if (aborted || isCoachModelTimeoutError(error)) return 'UPSTREAM_TIMEOUT';
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('OUTPUT_REJECTED') ||
      message.includes('INVALID_') ||
      message.includes('BACKGROUND_COACH_TASK_RESULT_MISSING')
    ) {
      return 'OUTPUT_REJECTED';
    }
    if (
      message.includes('AI_NOT_CONFIGURED') ||
      message.includes('SELF_HOST_AI_CREDENTIAL_UNAVAILABLE')
    ) {
      return 'AI_NOT_CONFIGURED';
    }
    return 'UPSTREAM_ERROR';
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private present(
    result: TodaySuggestionV2,
    rawTags: unknown,
    projection: TodaySuggestionConstraintProjection,
  ): TodaySuggestionResponseV2 {
    result = this.delivery.localize(result, projection);
    const tags = Array.isArray(rawTags)
      ? rawTags
          .map((tag) => String(tag ?? ''))
          .filter(Boolean)
          .slice(0, 5)
      : result.evidence.map((item) => item.label).slice(0, 3);
    return {
      ...result,
      tags,
      source:
        result.delivery.state === 'CACHED'
          ? 'cache'
          : result.delivery.state === 'GENERATED'
            ? 'generated'
            : 'fallback',
      shouldRefresh: false,
      generatedAt: result.delivery.generatedAt,
      reason: result.recommendation.kind.toLowerCase(),
      tone:
        result.recommendation.kind === 'REST' ||
        result.recommendation.kind === 'CHECK_IN'
          ? 'warning'
          : 'neutral',
    };
  }

  private async serialized<T>(key: string, task: () => Promise<T>) {
    const previous = this.requestTails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.requestTails.set(key, tail);
    try {
      return await current;
    } finally {
      if (this.requestTails.get(key) === tail) this.requestTails.delete(key);
    }
  }
}
