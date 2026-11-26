import {
  isTodaySuggestionIntentType,
  type TodaySuggestionIntensity,
  type TodaySuggestionRecommendationKind,
} from '@shared/ai-today-suggestion-contract';
import { CoachTaskResultValidationError } from '../core/coach-task-result-error';
import { groundTodaySuggestionNumbers } from './today-suggestion-number-grounding';
import type {
  TodaySuggestionConstraintProjection,
  TodaySuggestionDraft,
} from './today-suggestion.types';
import {
  hasRecentTrainingActivity,
  isRelevantTodaySuggestionDecision,
  todaySuggestionScheduledWorkout,
} from './today-suggestion.types';

const RECOMMENDATION_KINDS = new Set<TodaySuggestionRecommendationKind>([
  'TRAIN',
  'RECOVER',
  'REST',
  'CHECK_IN',
  'SYNC_DATA',
  'ADJUST_PLAN',
  'REVIEW_ACTIVITY',
]);
const INTENSITIES = new Set<TodaySuggestionIntensity>([
  'VERY_EASY',
  'EASY',
  'MODERATE',
  'HARD',
]);

const TRAINING_BASIS_CORRECTIONS = {
  TRAINING_BASIS_REQUIRED:
    'Provide trainingBasis for the scheduled workout or optional additional training, or reassess whether TRAIN is supported.',
  TRAINING_BASIS_WORKOUT_UNAVAILABLE:
    'Select a PLANNED or IN_PROGRESS workout for the projected date, or revise the recommendation using the current schedule.',
  TRAINING_BASIS_REASON_NOT_IN_SUMMARY:
    'Include the reason for optional additional training in summary and use the same wording in trainingBasis.reason.',
  TRAINING_BASIS_CREATE_WORKOUT_REQUIRED:
    'Use CREATE_TODAY_WORKOUT as preferredIntent for ADDITIONAL training.',
  TRAINING_BASIS_OPEN_WORKOUT_CONFLICT:
    'Remove OPEN_TODAY_WORKOUT from secondaryIntents for ADDITIONAL training.',
  TRAINING_BASIS_UNEXPECTED:
    'Omit trainingBasis when recommendation.kind is not TRAIN.',
} as const;

function rejectTrainingBasis(
  code: keyof typeof TRAINING_BASIS_CORRECTIONS,
): never {
  throw new CoachTaskResultValidationError(
    'TODAY_SUGGESTION_OUTPUT_REJECTED_TRAINING_BASIS',
    code,
    TRAINING_BASIS_CORRECTIONS[code],
  );
}

function rejectDraftField(code: string, correction: string): never {
  throw new CoachTaskResultValidationError(
    'TODAY_SUGGESTION_OUTPUT_REJECTED_DRAFT',
    code,
    correction,
  );
}

function rejectUnsupportedRecommendation(
  code: string,
  correction: string,
): never {
  throw new CoachTaskResultValidationError(
    `TODAY_SUGGESTION_OUTPUT_REJECTED_${code}`,
    code,
    correction,
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredText(
  value: unknown,
  max: number,
  code: string,
  field: string,
) {
  const text = String(value ?? '').trim();
  if (!text) rejectDraftField(code, `Provide a non-empty ${field} field.`);
  if (/\b(?:https?:\/\/|www\.)/i.test(text)) {
    rejectDraftField(
      'URL_NOT_ALLOWED',
      'Remove URLs from athlete-facing text.',
    );
  }
  return text.slice(0, max);
}

function optionalText(value: unknown, max: number) {
  const text = String(value ?? '').trim();
  if (/\b(?:https?:\/\/|www\.)/i.test(text)) {
    rejectDraftField(
      'URL_NOT_ALLOWED',
      'Remove URLs from athlete-facing text.',
    );
  }
  return text ? text.slice(0, max) : undefined;
}

function stringList(value: unknown, maxItems: number, maxLength: number) {
  const result = Array.isArray(value)
    ? [
        ...new Set(
          value.map((item) => String(item ?? '').trim()).filter(Boolean),
        ),
      ]
        .slice(0, maxItems)
        .map((item) => item.slice(0, maxLength))
    : [];
  if (result.some((item) => /\b(?:https?:\/\/|www\.)/i.test(item))) {
    rejectDraftField(
      'URL_NOT_ALLOWED',
      'Remove URLs from athlete-facing text.',
    );
  }
  return result;
}

function trainingBasis(value: unknown): TodaySuggestionDraft['trainingBasis'] {
  if (value == null) return undefined;
  const basis = record(value);
  if (basis?.kind === 'SCHEDULED')
    return {
      kind: 'SCHEDULED',
      workoutId: requiredText(
        basis.workoutId,
        160,
        'TRAINING_BASIS_WORKOUT_REQUIRED',
        'trainingBasis.workoutId',
      ),
    };
  if (basis?.kind === 'ADDITIONAL')
    return {
      kind: 'ADDITIONAL',
      reason: requiredText(
        typeof basis.reason === 'string' ? basis.reason : undefined,
        240,
        'TRAINING_BASIS_REASON_REQUIRED',
        'trainingBasis.reason',
      ),
    };
  rejectDraftField(
    'INVALID_TRAINING_BASIS',
    'Use SCHEDULED or ADDITIONAL for trainingBasis.kind, or omit trainingBasis for non-TRAIN recommendations.',
  );
}

export function validateTodaySuggestionDraft(
  raw: unknown,
): TodaySuggestionDraft {
  const row = record(raw);
  const recommendation = record(row?.recommendation);
  if (!row || !recommendation) {
    rejectDraftField(
      'INVALID_DRAFT',
      'Submit a draft object with a recommendation object.',
    );
  }
  const kind = String(recommendation.kind ?? '').toUpperCase();
  const preferredIntent =
    row.preferredIntent == null
      ? null
      : String(row.preferredIntent).toUpperCase();
  if (!RECOMMENDATION_KINDS.has(kind as TodaySuggestionRecommendationKind)) {
    rejectDraftField(
      'INVALID_RECOMMENDATION',
      'Use a supported recommendation.kind from the task contract.',
    );
  }
  if (
    preferredIntent !== null &&
    !isTodaySuggestionIntentType(preferredIntent)
  ) {
    rejectDraftField(
      'INVALID_INTENT',
      'Use an allowed preferredIntent or set it to null.',
    );
  }
  const rawIntensity = String(recommendation.intensity ?? '').toUpperCase();
  const intensity = rawIntensity
    ? (rawIntensity as TodaySuggestionIntensity)
    : undefined;
  if (intensity && !INTENSITIES.has(intensity)) {
    rejectDraftField(
      'INVALID_INTENSITY',
      'Use VERY_EASY, EASY, MODERATE or HARD, or omit intensity.',
    );
  }
  const rawDuration = Number(recommendation.durationMinutes);
  const durationMinutes = Number.isInteger(rawDuration)
    ? Math.min(240, Math.max(5, rawDuration))
    : undefined;
  const secondaryIntents = stringList(row.secondaryIntents, 4, 48).filter(
    isTodaySuggestionIntentType,
  );
  const basis = trainingBasis(row.trainingBasis);
  return {
    headline: requiredText(row.headline, 120, 'HEADLINE_REQUIRED', 'headline'),
    summary: requiredText(row.summary, 700, 'SUMMARY_REQUIRED', 'summary'),
    recommendation: {
      kind: kind as TodaySuggestionRecommendationKind,
      ...(durationMinutes ? { durationMinutes } : {}),
      ...(intensity ? { intensity } : {}),
      ...(stringList(recommendation.details, 4, 160).length
        ? { details: stringList(recommendation.details, 4, 160) }
        : {}),
    },
    confidence: ['HIGH', 'MEDIUM', 'LOW'].includes(
      String(row.confidence ?? '').toUpperCase(),
    )
      ? (String(
          row.confidence,
        ).toUpperCase() as TodaySuggestionDraft['confidence'])
      : 'LOW',
    ...(optionalText(row.uncertainty, 240)
      ? { uncertainty: optionalText(row.uncertainty, 240) }
      : {}),
    evidenceCodes: stringList(row.evidenceCodes, 6, 64),
    preferredIntent: isTodaySuggestionIntentType(preferredIntent)
      ? preferredIntent
      : null,
    secondaryIntents,
    tags: stringList(row.tags, 5, 32),
    ...(basis ? { trainingBasis: basis } : {}),
    ...(Array.isArray(row.coachDecisionHandling)
      ? {
          coachDecisionHandling: row.coachDecisionHandling.map((item) => {
            const handling = record(item);
            return {
              decisionId: String(handling?.decisionId ?? ''),
              handling: String(
                handling?.handling ?? '',
              ).toUpperCase() as NonNullable<
                TodaySuggestionDraft['coachDecisionHandling']
              >[number]['handling'],
              reason: optionalText(handling?.reason, 320) ?? null,
            };
          }),
        }
      : {}),
  };
}

/**
 * Keep factual grounding inside the background Agent result validator so a
 * rejected draft is retained in the CoachRun tool audit instead of being
 * discarded after the run has already been marked completed.
 */
export function validateTodaySuggestionDraftForProjection(
  raw: unknown,
  projection: TodaySuggestionConstraintProjection,
): TodaySuggestionDraft {
  const draft = validateTodaySuggestionDraft(raw);
  groundTodaySuggestionNumbers(draft, projection);
  const scheduledWorkout = todaySuggestionScheduledWorkout(projection, draft);
  if (draft.recommendation.kind === 'TRAIN') {
    const basis = draft.trainingBasis;
    if (!basis) {
      rejectTrainingBasis('TRAINING_BASIS_REQUIRED');
    }
    if (basis?.kind === 'SCHEDULED' && !scheduledWorkout) {
      rejectTrainingBasis('TRAINING_BASIS_WORKOUT_UNAVAILABLE');
    }
    if (basis?.kind === 'ADDITIONAL') {
      if (!draft.summary.includes(basis.reason)) {
        rejectTrainingBasis('TRAINING_BASIS_REASON_NOT_IN_SUMMARY');
      }
      if (draft.preferredIntent !== 'CREATE_TODAY_WORKOUT') {
        rejectTrainingBasis('TRAINING_BASIS_CREATE_WORKOUT_REQUIRED');
      }
      if (draft.secondaryIntents.includes('OPEN_TODAY_WORKOUT')) {
        rejectTrainingBasis('TRAINING_BASIS_OPEN_WORKOUT_CONFLICT');
      }
    }
  }
  if (
    draft.recommendation.kind === 'TRAIN' &&
    (projection.constraints ?? []).includes('TODAY_WORKOUT_COMPLETED')
  ) {
    rejectUnsupportedRecommendation(
      'UNREQUESTED_EXTRA_TRAINING',
      'The workout is complete. Revise the recommendation without prescribing more training today.',
    );
  }
  if (
    hasRecentTrainingActivity(projection) &&
    (draft.recommendation.kind === 'SYNC_DATA' ||
      ['OPEN_IMPORT', 'OPEN_PROVIDER_SETTINGS'].includes(draft.preferredIntent))
  ) {
    rejectUnsupportedRecommendation(
      'UNNECESSARY_DATA_TASK',
      'Use the recorded activities to advise the athlete without asking them to import data or connect a provider.',
    );
  }
  if (
    hasRecentTrainingActivity(projection) &&
    !projection.highConcern &&
    (['CHECK_IN', 'REVIEW_ACTIVITY'].includes(draft.recommendation.kind) ||
      draft.preferredIntent === 'OPEN_ASSESSMENT')
  ) {
    rejectUnsupportedRecommendation(
      'UNNECESSARY_CHECK_IN',
      'Give a recommendation based on recorded activities without requiring a check-in or activity review.',
    );
  }
  if (
    ['REST_TODAY', 'TRAINED_ELSEWHERE', 'DATA_PENDING'].includes(
      projection.userFeedback?.feedback ?? '',
    ) &&
    (draft.recommendation.kind === 'TRAIN' ||
      [
        'CREATE_TODAY_WORKOUT',
        'OPEN_TODAY_WORKOUT',
        'SCHEDULE_REMINDER',
      ].includes(draft.preferredIntent))
  ) {
    rejectUnsupportedRecommendation(
      'EXPLICIT_FEEDBACK',
      'Honor the athlete’s feedback and remove training recommendations and training actions for today.',
    );
  }
  if (
    projection.highConcern &&
    (draft.recommendation.kind === 'TRAIN' ||
      draft.recommendation.intensity === 'HARD' ||
      draft.preferredIntent === 'CREATE_TODAY_WORKOUT')
  ) {
    rejectUnsupportedRecommendation(
      'HIGH_CONCERN',
      'Account for the high-concern evidence without recommending training, hard intensity or workout creation.',
    );
  }
  if (
    projection.todayWorkouts.some((workout) =>
      ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
    ) &&
    draft.preferredIntent === 'CREATE_TODAY_WORKOUT'
  ) {
    rejectUnsupportedRecommendation(
      'DUPLICATE_WORKOUT',
      'Use the existing scheduled workout or omit the workout action. Do not create a duplicate.',
    );
  }
  if (
    draft.recommendation.kind === 'TRAIN' &&
    !(
      draft.preferredIntent === 'OPEN_TODAY_WORKOUT' &&
      scheduledWorkout?.status === 'IN_PROGRESS'
    ) &&
    Number.isFinite(projection.minutesUntilDayEnd) &&
    (draft.recommendation.durationMinutes ??
      (scheduledWorkout?.plannedDurationSeconds ?? 1_800) / 60) >
      projection.minutesUntilDayEnd
  ) {
    rejectUnsupportedRecommendation(
      'INSUFFICIENT_TIME',
      'Choose a recommendation that fits the remaining time today.',
    );
  }
  for (const decision of projection.coachState?.decisions ?? []) {
    if (!isRelevantTodaySuggestionDecision(decision)) continue;
    const handling = draft.coachDecisionHandling?.find(
      (item) => item.decisionId === decision.id,
    );
    const active = decision.stateRole === 'ACTIVE_PROPOSAL';
    const unverified = active && decision.basisCoverage === 'UNVERIFIED';
    const allowed = active ? ['CONDITIONAL', 'DEPART'] : ['HISTORY'];
    if (active && !unverified) allowed.unshift('FOLLOW');
    const decisionId = JSON.stringify(decision.id);
    const expected = allowed.join(' or ');
    if (!handling) {
      throw new CoachTaskResultValidationError(
        'TODAY_SUGGESTION_OUTPUT_REJECTED_COACH_DECISION',
        'COACH_DECISION_HANDLING_REQUIRED',
        `Add a coachDecisionHandling entry for decisionId ${decisionId} with handling set to ${expected}.`,
      );
    }
    if (!allowed.includes(handling.handling)) {
      const unverifiedFollow = unverified && handling.handling === 'FOLLOW';
      throw new CoachTaskResultValidationError(
        unverifiedFollow
          ? 'TODAY_SUGGESTION_OUTPUT_REJECTED_UNVERIFIED_BASIS'
          : 'TODAY_SUGGESTION_OUTPUT_REJECTED_COACH_DECISION',
        unverifiedFollow
          ? 'COACH_DECISION_UNVERIFIED_FOLLOW'
          : 'COACH_DECISION_INVALID_HANDLING',
        `Set handling for decisionId ${decisionId} to ${expected}.`,
      );
    }
    if (handling.handling === 'DEPART' && !handling.reason) {
      throw new CoachTaskResultValidationError(
        'TODAY_SUGGESTION_OUTPUT_REJECTED_COACH_DECISION',
        'COACH_DECISION_DEPART_REASON_REQUIRED',
        `Provide a fact-grounded reason for DEPART on decisionId ${decisionId}, or change handling to a supported alternative.`,
      );
    }
  }
  if (draft.recommendation.kind !== 'TRAIN' && draft.trainingBasis) {
    rejectTrainingBasis('TRAINING_BASIS_UNEXPECTED');
  }

  const factualEvidence = new Set<string>(projection.constraints ?? []);
  if (hasRecentTrainingActivity(projection))
    factualEvidence.add('RECENT_ACTIVITY');
  if (projection.activePlan) factualEvidence.add('PLAN_CONTEXT');
  const load = record(projection.lightContext?.load);
  if (load && Object.values(load).some((value) => typeof value === 'number'))
    factualEvidence.add('RECENT_LOAD');
  const competition = record(projection.lightContext?.competition);
  if (
    Array.isArray(competition?.activeInfluences) &&
    competition.activeInfluences.length
  )
    factualEvidence.add('COMPETITION_CONTEXT');
  draft.evidenceCodes = draft.evidenceCodes.filter((code) =>
    factualEvidence.has(code),
  );
  return draft;
}
