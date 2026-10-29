import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import type {
  TodaySuggestionDeliveryReason,
  TodaySuggestionDeliveryState,
  TodaySuggestionV2,
} from '@shared/ai-today-suggestion-contract';
import { isTodaySuggestionWorkout } from '@shared/ai-today-suggestion-contract';
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
  });
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
    return this.serialized(`${args.userId}:${args.locale}`, () =>
      this.generate(args),
    );
  }

  private async generate(args: {
    userId: string;
    locale: string;
    timezone?: string | null;
    location?: TodayWeatherLocation | null;
    allowAi: boolean;
    allowWithoutConsent?: boolean;
    signal?: AbortSignal;
  }): Promise<TodaySuggestionResponseV2> {
    const projection = await this.projector.project(args);
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
    const cachedFallbackStillFresh = Boolean(
      cached && Date.now() - cached.generatedAt.getTime() < 60_000,
    );
    if (
      cached &&
      cachedResult &&
      (cachedResult.delivery.state !== 'FACT_FALLBACK' ||
        cachedFallbackStillFresh) &&
      cached.constraintHash === projection.constraintHash &&
      cached.signatureHash === projection.factHash &&
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
          delivery: {
            state: 'CACHED',
            reasonCode: 'CACHE_HIT',
            generatedAt: cached.generatedAt.toISOString(),
          },
        },
        cached.tags,
      );
    }

    const continuityStage = await this.engagement.previewContinuityStage(
      args.userId,
      projection.continuityHash,
    );
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
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort('timeout'), 60_000);
      const forwardAbort = () => controller.abort(args.signal?.reason);
      if (args.signal?.aborted) forwardAbort();
      else args.signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        const run = await this.agent.run({
          projection,
          continuityStage,
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
              preferredIntent: 'ASK_COACH',
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

    const generationToken = deterministicGenerationToken([
      args.userId,
      args.locale,
      projection.factHash,
      projection.constraintHash,
      projection.continuityHash,
      String(continuityStage),
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
    const persisted = await this.prisma.aiTodaySuggestion.upsert({
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
        validUntil: projection.validUntil,
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
        validUntil: projection.validUntil,
        runId,
        provider,
        model,
        generatedAt: generatedAt ?? new Date(),
      },
    });
    await this.engagement.rollover({
      userId: args.userId,
      generationToken,
      continuityHash: projection.continuityHash,
      suggestionDate: projection.date,
    });
    this.logger.log(
      `[AI][today-suggestion-v2] outcome userId=${args.userId} date=${projection.date} state=${state} reason=${reasonCode} runId=${runId ?? 'none'}`,
    );
    return this.present(result, persisted.tags);
  }

  private factFallback(
    projection: TodaySuggestionConstraintProjection,
  ): TodaySuggestionDraft {
    const zh = projection.locale.toLowerCase().startsWith('zh');
    const current = projection.todayWorkouts.find((workout) =>
      ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
    );
    if (projection.pendingInquiry) {
      return {
        headline: zh ? '先补充当前状态' : 'Update your current status',
        summary: zh
          ? '当前判断还缺少一项会影响今天安排的信息。补充后，教练会结合计划、训练记录和身体状态重新判断。'
          : "One detail that can change today's recommendation is still missing. Update it so the coach can reassess the plan and your current state.",
        recommendation: { kind: 'CHECK_IN' },
        confidence: 'HIGH',
        evidenceCodes: ['WAITING_FOR_USER'],
        preferredIntent: 'OPEN_ASSESSMENT',
        secondaryIntents: [],
        tags: [zh ? '状态待补充' : 'Status needed'],
      };
    }
    const trainingWindowClosed = projection.newWorkoutWindowOpen === false;
    if (
      current &&
      (!trainingWindowClosed || current.status === 'IN_PROGRESS')
    ) {
      return {
        headline: zh ? '按今天的安排开始' : "Start today's scheduled workout",
        summary: zh
          ? `今天已安排「${current.name}」。开始前根据体感确认强度；若有疼痛或明显疲劳，先调整或休息。`
          : `You have ${current.name} scheduled today. Check how you feel before starting, and reduce or rest if pain or unusual fatigue is present.`,
        recommendation: { kind: 'TRAIN' },
        confidence: 'MEDIUM',
        evidenceCodes: ['TODAY_WORKOUT_AVAILABLE'],
        preferredIntent: 'OPEN_TODAY_WORKOUT',
        secondaryIntents: ['ASK_COACH', 'SCHEDULE_REMINDER'],
        tags: [zh ? '今日训练' : "Today's workout"],
      };
    }
    if (trainingWindowClosed && current) {
      return {
        headline: zh
          ? '先确认今天的计划完成情况'
          : "Confirm today's plan completion",
        summary: zh
          ? `今天安排了「${current.name}」，但目前没有确认完成。先核对是否已经训练、数据是否仍在同步；如果确实没有完成，也不必临时补做，再结合明天的计划调整。`
          : `${current.name} was scheduled today but is not confirmed complete. Check whether it was done or is still syncing. If it was missed, do not make it up now; adjust it with tomorrow's plan.`,
        recommendation: { kind: 'REVIEW_ACTIVITY' },
        confidence: 'MEDIUM',
        evidenceCodes: ['TODAY_WORKOUT_AVAILABLE'],
        preferredIntent: projection.activePlan ? 'OPEN_PLAN' : 'ASK_COACH',
        secondaryIntents: ['ASK_COACH'],
        tags: [zh ? '完成情况待确认' : 'Completion to confirm'],
      };
    }
    if (projection.latestActivityId) {
      return {
        headline: zh
          ? '回顾今天的训练，再衔接明天'
          : "Review today's training and connect it to tomorrow",
        summary: zh
          ? '今天已有活动记录。先看实际强度、完成质量和身体反应，再决定明天维持、调整还是恢复。'
          : 'An activity is recorded today. Review its actual intensity, execution quality, and physical response before deciding whether tomorrow should continue, adjust, or recover.',
        recommendation: { kind: 'REVIEW_ACTIVITY' },
        confidence: 'MEDIUM',
        evidenceCodes: ['RECENT_ACTIVITY'],
        preferredIntent: 'OPEN_ACTIVITY_REVIEW',
        secondaryIntents: projection.tomorrowWorkouts.length
          ? ['VIEW_TOMORROW', 'ASK_COACH']
          : ['ASK_COACH'],
        tags: [zh ? '今日复盘' : 'Daily review'],
      };
    }
    const noActivity = projection.constraints.includes(
      'NEVER_RECORDED_ACTIVITY',
    );
    if (trainingWindowClosed && !noActivity) {
      return {
        headline: zh
          ? '回顾今天，再为明天做准备'
          : 'Review today and prepare for tomorrow',
        summary: zh
          ? '今天没有可确认的计划训练或活动完成记录。先核对数据是否完整；如果今天确实没有训练，也不必临时补做，明天再结合计划和身体状态安排。'
          : "There is no confirmed planned workout or completed activity for today. Check whether the data is complete. If you did not train, do not make it up now; use tomorrow's plan and readiness to decide the next step.",
        recommendation: { kind: 'CHECK_IN' },
        confidence: 'LOW',
        evidenceCodes: projection.constraints.filter(
          (code) => code !== 'TODAY_TRAINING_WINDOW_CLOSED',
        ),
        preferredIntent: projection.tomorrowWorkouts.length
          ? 'VIEW_TOMORROW'
          : 'ASK_COACH',
        secondaryIntents: projection.activePlan ? ['OPEN_PLAN'] : [],
        tags: [zh ? '今日回顾' : 'Daily review'],
      };
    }
    return {
      headline: zh
        ? '先补齐今天判断需要的信息'
        : 'Complete the facts needed for today',
      summary: noActivity
        ? zh
          ? '目前还没有可用于判断近期训练状态的活动记录。你可以先导入活动，或直接告诉教练今天的时间和身体感受。'
          : 'There is no recorded activity to assess recent training yet. Import an activity or tell the coach about your available time and how you feel today.'
        : zh
          ? '当前事实不足以形成可靠的训练强度建议。可以查看计划、补充活动记录，或让教练继续判断。'
          : 'The current facts are not enough for a reliable intensity recommendation. Review the plan, add activity data, or continue with the coach.',
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
      message.includes('NOT_CONFIGURED') ||
      message.includes('API_KEY') ||
      message.includes('provider')
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
      shouldRefresh: result.delivery.state === 'GENERATED',
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
