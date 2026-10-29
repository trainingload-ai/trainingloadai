import { Injectable } from '@nestjs/common';
import { AiUsageKind } from '@prisma/client';
import { TODAY_SUGGESTION_INTENT_TYPES } from '@shared/ai-today-suggestion-contract';
import { AiService } from '../ai.service';
import { stableJson } from '../core/ai-common.util';
import { validateTodaySuggestionDraftForProjection } from './today-suggestion-draft.validator';
import type {
  TodaySuggestionAgentRun,
  TodaySuggestionConstraintProjection,
} from './today-suggestion.types';

const ALLOWED_TOOLS = [
  'training.data_coverage',
  'training.readiness',
  'plan.execution_context',
  'plan.recent',
  'integration.status',
  'activity.byHashId',
  'activity.series',
  'coach_task_submit_result',
] as const;

@Injectable()
export class TodaySuggestionAgentService {
  constructor(private readonly ai: AiService) {}

  async run(args: {
    projection: TodaySuggestionConstraintProjection;
    continuityStage: 1 | 2 | 3;
    signal?: AbortSignal;
    allowWithoutConsent?: boolean;
  }): Promise<TodaySuggestionAgentRun> {
    const { projection } = args;
    const stageRule =
      args.continuityStage === 1
        ? 'This is the first unresolved delivery. Give a complete, practical recommendation.'
        : args.continuityStage === 2
          ? 'The previous presented suggestion was not explicitly resolved and facts are unchanged. Lower the time, complexity, or activation barrier without claiming the athlete ignored it.'
          : 'The previous presented suggestions were not explicitly resolved and facts are unchanged. Identify one real barrier worth clarifying (time, fatigue, pain, or willingness); ask only when the answer changes the action.';
    const result = await this.ai.runBackgroundCoachTask({
      userId: projection.userId,
      lang: projection.locale,
      taskType: 'TODAY_SUGGESTION',
      activeSkillName: 'readiness-check',
      usageKind: AiUsageKind.TODAY_SUGGESTION,
      funding: 'PLATFORM',
      triggerType: 'HOME_TODAY_SUGGESTION',
      triggerRef: `${projection.date}:${projection.locale}`,
      dedupeKey: [
        'today-suggestion-v2',
        projection.factHash,
        projection.constraintHash,
        projection.continuityHash,
        String(args.continuityStage),
        projection.locale,
      ].join(':'),
      allowedToolNames: ALLOWED_TOOLS,
      requiredToolNames: projection.requiredToolNames,
      signal: args.signal,
      allowWithoutConsent: args.allowWithoutConsent,
      instructions: [
        'Produce a structured today-suggestion draft. This is one branch of the normal Coach Agent loop.',
        "Build a useful whole-day recommendation from today's plan, actual completion and activities, readiness or load, a meaningful review of what happened, and the handoff to tomorrow. As the day progresses, prefer reviewing confirmed facts and clarifying missing completion data over inventing another workout.",
        'The server projection below is authoritative but intentionally compact. Call only the read tools whose evidence can materially change the decision.',
        'Hard constraints require evidence acquisition or restrict unsafe conclusions; they never map directly to canned athlete-facing copy.',
        'Do not output URLs, database ids, provider credentials, write-operation parameters, workout fields, or workout DSL. You decide whether a workout is appropriate; the dedicated workout-generator skill owns the Workout artifact.',
        'If a waiting assessment case exists, select OPEN_ASSESSMENT and do not invent a second question. If HIGH_CONCERN exists, do not select CREATE_TODAY_WORKOUT.',
        'If a usable workout already exists today, prefer OPEN_TODAY_WORKOUT instead of CREATE_TODAY_WORKOUT.',
        `Allowed intent names: ${TODAY_SUGGESTION_INTENT_TYPES.join(', ')}. Never invent an intent name.`,
        'TODAY_TRAINING_WINDOW_CLOSED means the athlete local time is 20:00 or later. It only restricts actions and must never become the subject of the headline, summary, or evidence: do not quote the clock time or explain the cutoff. Do not recommend starting or making up a workout, recommendation.kind must not be TRAIN, and CREATE_TODAY_WORKOUT and SCHEDULE_REMINDER are forbidden. Prefer an evidence-backed daily review, recovery, plan review, data check, or tomorrow handoff. OPEN_ACTIVITY_REVIEW, OPEN_PLAN, OPEN_IMPORT, OPEN_PROVIDER_SETTINGS, ASK_COACH, and VIEW_TOMORROW remain available when supported by facts. A workout already IN_PROGRESS may still use OPEN_TODAY_WORKOUT.',
        'Evidence codes must refer to facts actually present in the projection or facts returned by a tool. Use 2-3 meaningful evidence codes when possible.',
        stageRule,
        'Submit exactly: {"headline":"...","summary":"...","recommendation":{"kind":"TRAIN|RECOVER|REST|CHECK_IN|SYNC_DATA|ADJUST_PLAN|REVIEW_ACTIVITY","durationMinutes":30,"intensity":"VERY_EASY|EASY|MODERATE|HARD","details":["..."]},"confidence":"HIGH|MEDIUM|LOW","uncertainty":"optional","evidenceCodes":["..."],"preferredIntent":"one allowed intent name listed above","secondaryIntents":["..."],"tags":["..."]}. Do not generate or return any Workout fields. CREATE_TODAY_WORKOUT only requests the dedicated workout-generator skill to compose one standard Workout afterward.',
        `Write athlete-facing fields in locale ${projection.locale}.`,
        `SERVER_PROJECTION_BEGIN\n${stableJson(projection.lightContext)}\nSERVER_PROJECTION_END`,
      ].join('\n\n'),
      validateResult: (raw) =>
        validateTodaySuggestionDraftForProjection(raw, projection),
    });
    return {
      draft: result.result,
      provider: result.provider,
      model: result.model,
      runId: result.runId,
      operationId: result.operationId,
      replayed: result.replayed,
    };
  }
}
