import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import type {
  TodaySuggestionDeliveryReason,
  TodaySuggestionDeliveryState,
  TodaySuggestionV2,
} from '@shared/ai-today-suggestion-contract';
import { isTodaySuggestionWorkout } from '@shared/ai-today-suggestion-contract';
import { stableJson } from '../core/ai-common.util';
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
import { hasRecentTrainingActivity } from './today-suggestion.types';
import type { TodayWeatherLocation } from '@/weather/weather.types';

export type TodaySuggestionResponseV2 = TodaySuggestionV2 & {
  tags: string[];
  source: 'fallback' | 'cache' | 'generated';
  shouldRefresh: boolean;
  generatedAt: string | null;
  reason: string;
  tone: 'neutral' | 'warning' | 'success';
  weatherAttribution?: {
    serviceName: string;
    modified: true;
    legalPageUrl?: string;
  };
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
    return this.serialized(args.userId, () => this.generate(args));
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
    revisionRetry = 0,
  ): Promise<TodaySuggestionResponseV2> {
    let projection = await this.projector.project(args);
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
      cached.validUntil.getTime() > Date.now()
    ) {
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
      );
    }

    // Viewing a card is optional and must never alter the training prescription.
    let draft: TodaySuggestionDraft;
    let state: TodaySuggestionDeliveryState;
    let reasonCode: TodaySuggestionDeliveryReason;
    let provider: string | null = null;
    let model: string | null = null;
    let runId: string | null = null;
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
    } else if (projection.coachState?.decisionReadStatus === 'UNAVAILABLE') {
      draft = this.factFallback(projection);
      state = 'FACT_FALLBACK';
      reasonCode = 'COACH_STATE_UNAVAILABLE';
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort('timeout'), 60_000);
      const forwardAbort = () => controller.abort(args.signal?.reason);
      if (args.signal?.aborted) forwardAbort();
      else args.signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        const run = await this.agent.run({
          projection,
          signal: controller.signal,
          allowWithoutConsent: args.allowWithoutConsent,
        });
        draft = run.draft;
        if (draft.preferredIntent === 'CREATE_TODAY_WORKOUT') {
          try {
            const generated = await this.workoutGenerator.generate({
              projection,
              draft,
              signal: controller.signal,
              allowWithoutConsent: args.allowWithoutConsent,
            });
            draft = { ...draft, generatedWorkout: generated.workout };
            workoutRunId = generated.runId;
          } catch (error) {
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
        state =
          reasonCode === 'AI_NOT_CONFIGURED'
            ? 'AI_UNAVAILABLE'
            : 'FACT_FALLBACK';
        this.logger.warn(
          `[AI][today-suggestion-v2] fallback userId=${args.userId} date=${projection.date} reason=${reasonCode}`,
        );
      } finally {
        clearTimeout(timeout);
        args.signal?.removeEventListener('abort', forwardAbort);
      }
    }

    const latest = await this.projector.project(args);
    if (
      latest.factHash !== projection.factHash ||
      latest.constraintHash !== projection.constraintHash ||
      !cachedWeatherMatches(keyContext(projection), latest)
    ) {
      if (revisionRetry < 1) return this.generate(args, revisionRetry + 1);
      projection = latest;
      draft = this.factFallback(latest);
      state = 'FACT_FALLBACK';
      reasonCode = 'FACTS_CHANGED';
      generatedAt = null;
      runId = null;
      workoutRunId = null;
      provider = null;
      model = null;
    }

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
    const persisted = await this.prisma.$transaction(async (tx) => {
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
    this.logger.log(
      `[AI][today-suggestion-v2] outcome userId=${args.userId} date=${projection.date} state=${state} reason=${reasonCode} runId=${runId ?? 'none'}`,
    );
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
    );
  }

  private factFallback(
    projection: TodaySuggestionConstraintProjection,
  ): TodaySuggestionDraft {
    const zh = projection.locale.toLowerCase().startsWith('zh');
    if (projection.highConcern) {
      return {
        headline: zh ? '今天先保持保守安排' : 'Keep today conservative',
        summary: zh
          ? '当前已有状态信号需要优先处理。今天先休息，暂不开始高强度训练；现有教练判断可作为进一步调整的依据。'
          : 'Current recorded concerns take priority. Rest today and avoid starting an intense session; the existing coach decision can guide any further adjustment.',
        recommendation: { kind: 'REST' },
        confidence: 'MEDIUM',
        evidenceCodes: ['HIGH_CONCERN'],
        preferredIntent: projection.activeDecisionId
          ? 'OPEN_DECISION'
          : 'ASK_COACH',
        secondaryIntents: [],
        tags: [zh ? '优先恢复' : 'Recovery first'],
      };
    }
    if (projection.userFeedback?.feedback === 'REST_TODAY') {
      return {
        headline: zh
          ? '今天按你的选择休息'
          : 'Keep today as your chosen rest day',
        summary: zh
          ? '今天以休息为主，不需要补做训练。明天再结合近期训练负荷和计划安排下一次训练。'
          : 'Keep today for rest without making up training. Use your recent training load and plan to decide the next session tomorrow.',
        recommendation: { kind: 'REST' },
        confidence: 'HIGH',
        evidenceCodes: [],
        preferredIntent: projection.tomorrowWorkouts.length
          ? 'VIEW_TOMORROW'
          : null,
        secondaryIntents: [],
        tags: [zh ? '今日休息' : 'Rest today'],
      };
    }
    if (
      ['TRAINED_ELSEWHERE', 'DATA_PENDING'].includes(
        projection.userFeedback?.feedback ?? '',
      )
    ) {
      return {
        headline: zh
          ? '今天先恢复，不追加训练'
          : 'Recover today without adding training',
        summary: zh
          ? '已记录你对今天训练情况的反馈。今天先恢复，不因平台暂时缺少记录而补练；后续有新活动数据时会自动更新判断。'
          : 'Your training feedback is recorded. Recover without making up training because a record is missing here; new activity data will update the recommendation.',
        recommendation: { kind: 'RECOVER' },
        confidence: 'MEDIUM',
        evidenceCodes: [],
        preferredIntent: projection.tomorrowWorkouts.length
          ? 'VIEW_TOMORROW'
          : null,
        secondaryIntents: [],
        tags: [zh ? '恢复' : 'Recovery'],
      };
    }
    if (projection.coachState?.decisionReadStatus === 'UNAVAILABLE') {
      return {
        headline: zh
          ? '暂按已确认的安排保守执行'
          : 'Keep to the confirmed schedule conservatively',
        summary: zh
          ? '最新教练调整暂时不可用。今天先维持已确认的低负担安排，不临时追加或补做训练。'
          : 'The latest coach adjustments are temporarily unavailable. Keep to confirmed low-demand activity without adding or making up training.',
        recommendation: { kind: 'RECOVER' },
        confidence: 'LOW',
        evidenceCodes: [],
        preferredIntent: projection.activePlan ? 'OPEN_PLAN' : null,
        secondaryIntents: [],
        tags: [],
      };
    }
    const current = projection.todayWorkouts.find((workout) =>
      ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
    );
    if (projection.activeDecisionId) {
      return {
        headline: zh
          ? '以当前课表为准，调整尚未应用'
          : 'The current schedule stands; the adjustment is not applied',
        summary: zh
          ? '教练提出的调整尚未写入课表。今天继续以已确认的安排为准，不把原安排与调整方案叠加执行；确认调整后，建议会随课表更新。'
          : 'The proposed adjustment is not applied to your schedule. Follow the confirmed schedule without combining it with the alternative; accepting the adjustment will update the advice.',
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
        headline: zh ? '按今天的安排执行' : "Follow today's scheduled workout",
        summary: zh
          ? `今天已安排「${current.name}」。按原定内容和强度执行即可，不额外加量；若出现疼痛或明显不适，停止训练。`
          : `${current.name} is scheduled today. Follow its prescribed content and intensity without adding volume; stop if pain or clear discomfort develops.`,
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
        tags: [zh ? '今日安排' : "Today's schedule"],
      };
    }
    if (
      (projection.todayActivityCount ?? 0) > 0 ||
      projection.constraints.includes('TODAY_WORKOUT_COMPLETED')
    ) {
      return {
        headline: current
          ? zh
            ? '今天已有活动，不自动重复训练'
            : 'Activity is recorded; avoid repeating training'
          : zh
            ? '今天已有训练，接下来以恢复为主'
            : 'Training is recorded; prioritize recovery next',
        summary: current
          ? zh
            ? `今天已有活动记录，「${current.name}」尚未标记完成。暂不自动重复或补做这节训练；活动关联和处理结果更新后，建议会同步变化。`
            : `Activity is recorded today, while ${current.name} is not marked complete. Do not automatically repeat or make up this session; activity processing and matching will update the advice.`
          : zh
            ? '今天已有完成记录，接下来以恢复为主，不需要额外补练。明天继续结合近期负荷与原有安排执行。'
            : 'Training is recorded today. Prioritize recovery without extra make-up training, and use recent load and the existing schedule for tomorrow.',
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
        headline: zh ? '今天保持轻松节奏' : 'Keep today easy',
        summary: zh
          ? '当前先以轻松活动或休息为主，不临时追加高强度训练，也不补做临近结束的课次。后续结合近期负荷和已有安排继续。'
          : 'Keep to easy activity or rest for now, without adding intensity or squeezing in a session near the end of the day. Continue using recent load and your existing schedule.',
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
        headline: zh ? '活动数据正在更新' : 'Activity data is updating',
        summary: zh
          ? '活动数据仍在处理或同步。暂不据此判定漏练，也不安排补练；处理完成后会自动更新建议，无需额外反馈。'
          : 'Activity data is still processing or syncing. This does not establish a missed workout or a need to make it up. Advice will update when processing finishes; no extra feedback is needed.',
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
    return {
      headline: zh
        ? '暂无近期训练记录'
        : 'No recent training records are available',
      summary: noActivity
        ? zh
          ? '目前还没有可用于判断近期训练状态的活动记录。你可以先导入活动，或直接告诉教练今天的时间和身体感受。'
          : 'There is no recorded activity to assess recent training yet. Import an activity or tell the coach about your available time and how you feel today.'
        : zh
          ? '近期没有新的活动记录，暂不据此推断你停止了训练。已有历史记录可以保留；如需基于最近训练生成建议，可以导入近期活动。'
          : 'No recent activities are recorded here; this does not imply you stopped training. Importing a recent activity can support advice based on your latest training.',
      recommendation: { kind: noActivity ? 'SYNC_DATA' : 'CHECK_IN' },
      confidence: 'LOW',
      evidenceCodes: projection.constraints,
      preferredIntent: noActivity ? 'OPEN_IMPORT' : 'ASK_COACH',
      secondaryIntents: projection.activePlan
        ? ['OPEN_PLAN', 'ASK_COACH']
        : ['ASK_COACH'],
      tags: [zh ? '事实不足' : 'More context needed'],
    };
  }

  private reasonFromError(
    error: unknown,
    aborted: boolean,
  ): TodaySuggestionDeliveryReason {
    if (aborted) return 'UPSTREAM_TIMEOUT';
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('OUTPUT_REJECTED') || message.includes('INVALID_')) {
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
  ): TodaySuggestionResponseV2 {
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
