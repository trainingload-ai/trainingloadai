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
    signal?: AbortSignal;
    allowWithoutConsent?: boolean;
  }): Promise<TodaySuggestionAgentRun> {
    const { projection } = args;
    const result = await this.ai.runBackgroundCoachTask({
      userId: projection.userId,
      lang: projection.locale,
      taskType: 'TODAY_SUGGESTION',
      activeSkillName: 'readiness-check',
      usageKind: AiUsageKind.TODAY_SUGGESTION,
      funding: 'PLATFORM',
      triggerType: 'HOME_TODAY_SUGGESTION',
      triggerRef: `${projection.date}:${projection.locale}`,
      allowedToolNames: ALLOWED_TOOLS,
      requiredToolNames: projection.requiredToolNames,
      signal: args.signal,
      allowWithoutConsent: args.allowWithoutConsent,
      instructions: [
        'Produce a structured today-suggestion draft. This is one branch of the normal Coach Agent loop.',
        "Build a useful whole-day recommendation from today's plan, actual completion and activities, readiness or load, a meaningful review of what happened, and the handoff to tomorrow. As the day progresses, prefer reviewing confirmed facts and clarifying missing completion data over inventing another workout.",
        'The server projection below is authoritative but intentionally compact. Call only the read tools whose evidence can materially change the decision.',
        'Hard constraints require evidence acquisition or restrict unsafe conclusions; they never map directly to canned athlete-facing copy.',
        'Do not output URLs, provider credentials, write-operation parameters, workout fields, or workout DSL. Internal decision ids are allowed only inside coachDecisionHandling. The dedicated workout-generator skill owns the Workout artifact.',
        'Give the best supported training judgment even when a pendingInquiry exists. Do not duplicate its question. OPEN_ASSESSMENT is an optional secondary action unless HIGH_CONCERN requires clarification before proceeding. If HIGH_CONCERN exists, do not select CREATE_TODAY_WORKOUT.',
        'If a usable workout already exists today, prefer OPEN_TODAY_WORKOUT instead of CREATE_TODAY_WORKOUT.',
        `Allowed intent names: ${TODAY_SUGGESTION_INTENT_TYPES.join(', ')}. Never invent an intent name.`,
        'Local time and minutesUntilDayEnd are scheduling context, not a universal training cutoff. Evening training is valid. Fit a new session within the remaining day, do not make up a missed session automatically, and respect all remaining workouts. A recorded activity does not prove every scheduled workout is complete; use todayExecution and individual statuses.',
        'Evidence codes must refer to facts actually present in the projection or facts returned by a tool. Use 2-3 meaningful evidence codes when possible.',
        'Recent activity records are sufficient for useful daily coaching. Sleep, HRV and physiological baselines are optional: use recorded values when available and otherwise omit them. Do not ask for sleep feedback or wearable setup, and do not make missing optional data the subject of the suggestion.',
        'Deliver the actual training judgment on the home page now. Do not promise to read data later or ask the athlete to open an activity, read a review, click a suggestion or answer a routine question before receiving advice. Perform necessary reads yourself. Review and coach links are optional supporting actions.',
        'Not opening or clicking a suggestion is normal. Never infer a barrier, reduce the recommendation, or ask for motivation solely from presentation or click history.',
        'If recent usable activities exist, do not select SYNC_DATA, OPEN_IMPORT or OPEN_PROVIDER_SETTINGS as the main recommendation. A missing or disconnected provider is irrelevant when recorded training already supports daily coaching.',
        'Honor explicit userFeedback: REST_TODAY means no training prompt today; TRAINED_ELSEWHERE means training happened even if not recorded here; DATA_PENDING means wait for system data without asking the athlete; LATER means do not chase a response. Never infer completion from merely opening a link.',
        'The current workout schedule is authoritative for what is actually scheduled. ACTIVE_PROPOSAL decisions are unapplied alternatives: coordinate them with the schedule and never stack incompatible workouts. Rejected decisions are history and must not be proposed again without new facts; applied decisions are already reflected in current facts. Recent reviews are context for the same daily judgment, not a reason to send the athlete elsewhere for an answer.',
        'For each relevantDecisions item return coachDecisionHandling: {decisionId,handling,reason}. ACTIVE_PROPOSAL allows FOLLOW, CONDITIONAL or DEPART (DEPART requires a fact-grounded reason); REJECTED_HISTORY and APPLIED_HISTORY require HISTORY; INTERNAL_DRAFT and SUPERSEDED_HISTORY require IGNORE. Do not expose these internal fields in athlete-facing copy.',
        'When recent activities exist, recommendation.kind should express the actual training decision (TRAIN, RECOVER, REST or ADJUST_PLAN), not an instruction to read a review or complete setup. preferredIntent may be null: useful advice does not require a button or a response.',
        'Submit exactly: {"headline":"...","summary":"...","recommendation":{"kind":"TRAIN|RECOVER|REST|CHECK_IN|SYNC_DATA|ADJUST_PLAN|REVIEW_ACTIVITY","durationMinutes":30,"intensity":"VERY_EASY|EASY|MODERATE|HARD","details":["..."]},"confidence":"HIGH|MEDIUM|LOW","uncertainty":"optional","evidenceCodes":["..."],"preferredIntent":null,"secondaryIntents":["..."],"tags":["..."],"coachDecisionHandling":[]}. preferredIntent can instead be one allowed intent name when useful. Do not generate or return any Workout fields. CREATE_TODAY_WORKOUT only requests the dedicated workout-generator skill to compose one standard Workout afterward.',
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
