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
    onRunStarted?: (runId: string, attemptId: string) => void;
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
      onRunStarted: args.onRunStarted,
      instructions: [
        '# Goal & athlete-facing voice\nProduce a structured today-suggestion draft via the normal Coach Agent loop. Decide what is useful for the rest of today from actual activities, remaining workouts and recent training load, and deliver the judgment on the home page now. Do not turn completion checks, reviews, clicks or routine questions into tasks for the athlete.\nWrite 2-4 concise athlete-facing sentences: lead with the concrete next action, then the most relevant activity or load facts that support it. Do not quote the exact current clock time (advice may stay cached; use natural context such as tonight). Mention tomorrow only when it changes today’s advice, and never invent an existing plan.',
        '# Evidence & tools\nThe server projection is authoritative but compact; call read tools only when evidence can materially change the decision. Hard constraints require evidence acquisition or restrict unsafe conclusions; they never map directly to canned athlete-facing copy. Evidence codes must refer to facts present in the projection or returned by tools (use 2-3 meaningful codes when possible).\n- Activity & load facts: A recorded activity alone does not mean rest; weigh its duration, distance, intensity and remaining sessions. Missing historical records do not prove a training break or detraining; with sparse activityCoverage, low CTL/ATL/TSB reflect incomplete history, not poor fitness or a weak base.\n- Tomorrow & comparisons: Use tomorrowWorkouts.plannedDurationSeconds for any scheduled tomorrow duration without inferring interval details. For recorded weekly load percentage comparison, use load.weekToDateLoadChangePercent preserving its direction, state it compares the same days last week (excluding today and the matching day last week), omit if missing, and put numeric comparisons in their own sentence.\n- Optional health & user memory (sharedFacts): Recent activity records are sufficient for daily coaching. Sleep, HRV and physiological baselines are optional—use recorded values when present, omit otherwise, and never ask for sleep feedback or wearable setup. Honor readiness per use: provisional sleep is only what is reported so far (never call it a complete night or treat silence as proof); sleep duration, stages and score are independent. Current user statements/corrections override obsolete assessments. Missing observations are unknown, not zero load or permission to intensify. If safety context is unavailable or over budget, state the limitation without technical status labels and avoid high-intensity prescriptions.',
        '# Schedule, matching & user feedback\nLocal time and minutesUntilDayEnd are scheduling context, not a training cutoff. Evening training is valid. Fit new sessions within the remaining day, do not make up missed sessions automatically, and respect all remaining workouts. A recorded activity does not prove every scheduled workout is complete; use todayExecution and individual statuses.\n- workoutMatching: Explain unresolved activity-to-workout ambiguity naturally and guide manual association via activity details or a focused Coach discussion. Never mark completion or pick a candidate from an ambiguous set; the activity remains valid training and unlinked work does not mean repeating the session.\n- userFeedback: REST_TODAY means no training prompt today; TRAINED_ELSEWHERE means training occurred even if unrecorded; DATA_PENDING means wait for system data without asking the athlete; LATER means do not chase a response. Not opening or clicking a suggestion is normal—never infer a barrier, reduce advice, or ask for motivation from click/presentation history, nor infer completion from opening a link.',
        '# Decisions, inquiries & trainingBasis\nThe current workout schedule is authoritative. ACTIVE_PROPOSAL decisions are unapplied alternatives (coordinate with the schedule; never stack incompatible workouts). Rejected decisions must not be re-proposed without new facts; applied decisions are already reflected. Recent reviews are context for this judgment, not a reason to redirect the athlete.\n- An UNVERIFIED assessment or proposal lacks proof it covers current health/memory revisions—judge fresh from raw facts; never treat old TTL or risk labels as current evidence; UNVERIFIED proposals allow CONDITIONAL or DEPART only, never FOLLOW.\n- Return coachDecisionHandling: {decisionId,handling,reason} for every relevantDecisions item (ACTIVE_PROPOSAL -> FOLLOW/CONDITIONAL/DEPART with fact-grounded reason for DEPART; REJECTED_HISTORY/APPLIED_HISTORY -> HISTORY; [] when none). Never expose these internal fields in athlete-facing copy.\n- pendingInquiry: Give the best supported judgment without duplicating its question. OPEN_ASSESSMENT is an optional secondary action unless HIGH_CONCERN requires clarification first. Under HIGH_CONCERN, never select CREATE_TODAY_WORKOUT.\n- MOVED workouts are history, never remaining training for today. Every TRAIN recommendation requires trainingBasis. Return {kind:"SCHEDULED",workoutId:"..."} for one actual PLANNED/IN_PROGRESS workout today, or {kind:"ADDITIONAL",reason:"..."} for new optional training. For ADDITIONAL, include one complete athlete-facing sentence in summary explicitly calling it optional additional training and explaining why it fits current load, available time and tomorrow\'s schedule, copy that exact sentence into reason, never frame it as completing/restoring a moved course, and use CREATE_TODAY_WORKOUT. Recommend recovery/rest if extra training is unsupported. Omit trainingBasis for non-TRAIN recommendations.',
        `# Intents & strict boundaries\nAllowed intent names: ${TODAY_SUGGESTION_INTENT_TYPES.join(', ')}. Never invent an intent name. When recent activities exist, recommendation.kind should be the actual training decision (TRAIN, RECOVER, REST or ADJUST_PLAN)—do not select SYNC_DATA, OPEN_IMPORT or OPEN_PROVIDER_SETTINGS as the main recommendation (a disconnected provider is irrelevant when recorded training suffices). Prefer OPEN_TODAY_WORKOUT over CREATE_TODAY_WORKOUT when a usable workout already exists today; preferredIntent may be null.\nDo not output URLs, provider credentials, write-operation parameters, workout fields, or workout DSL. Internal ids are allowed only inside coachDecisionHandling and trainingBasis. CREATE_TODAY_WORKOUT only requests the dedicated workout-generator skill to compose one standard Workout afterward.`,
        `# Output\nWrite athlete-facing fields in locale ${projection.locale}. Submit exactly:\n{"headline":"...","summary":"...","recommendation":{"kind":"TRAIN|RECOVER|REST|CHECK_IN|SYNC_DATA|ADJUST_PLAN|REVIEW_ACTIVITY","durationMinutes":30,"intensity":"VERY_EASY|EASY|MODERATE|HARD","details":["..."]},"confidence":"HIGH|MEDIUM|LOW","uncertainty":"optional","evidenceCodes":["..."],"preferredIntent":null,"secondaryIntents":["..."],"tags":["..."],"coachDecisionHandling":[],"trainingBasis":{"kind":"SCHEDULED","workoutId":"..."}}`,
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
