import {
  isTodaySuggestionIntentType,
  type TodaySuggestionIntensity,
  type TodaySuggestionRecommendationKind,
} from '@shared/ai-today-suggestion-contract';
import { CoachTaskResultValidationError } from '../core/coach-task-result-error';
import type {
  TodaySuggestionConstraintProjection,
  TodaySuggestionDraft,
} from './today-suggestion.types';
import {
  hasRecentTrainingActivity,
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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredText(value: unknown, max: number, name: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`TODAY_SUGGESTION_${name}_REQUIRED`);
  if (/\b(?:https?:\/\/|www\.)/i.test(text)) {
    throw new Error('TODAY_SUGGESTION_URL_NOT_ALLOWED');
  }
  return text.slice(0, max);
}

function optionalText(value: unknown, max: number) {
  const text = String(value ?? '').trim();
  if (/\b(?:https?:\/\/|www\.)/i.test(text)) {
    throw new Error('TODAY_SUGGESTION_URL_NOT_ALLOWED');
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
    throw new Error('TODAY_SUGGESTION_URL_NOT_ALLOWED');
  }
  return result;
}

function trainingBasis(value: unknown): TodaySuggestionDraft['trainingBasis'] {
  if (value == null) return undefined;
  const basis = record(value);
  if (basis?.kind === 'SCHEDULED')
    return {
      kind: 'SCHEDULED',
      workoutId: requiredText(basis.workoutId, 160, 'TRAINING_BASIS_WORKOUT'),
    };
  if (basis?.kind === 'ADDITIONAL')
    return {
      kind: 'ADDITIONAL',
      reason: requiredText(basis.reason, 240, 'TRAINING_BASIS_REASON'),
    };
  throw new Error('TODAY_SUGGESTION_INVALID_TRAINING_BASIS');
}

export function validateTodaySuggestionDraft(
  raw: unknown,
): TodaySuggestionDraft {
  const row = record(raw);
  const recommendation = record(row?.recommendation);
  if (!row || !recommendation) {
    throw new Error('TODAY_SUGGESTION_INVALID_DRAFT');
  }
  const kind = String(recommendation.kind ?? '').toUpperCase();
  const preferredIntent =
    row.preferredIntent == null
      ? null
      : String(row.preferredIntent).toUpperCase();
  if (!RECOMMENDATION_KINDS.has(kind as TodaySuggestionRecommendationKind)) {
    throw new Error('TODAY_SUGGESTION_INVALID_RECOMMENDATION');
  }
  if (
    preferredIntent !== null &&
    !isTodaySuggestionIntentType(preferredIntent)
  ) {
    throw new Error('TODAY_SUGGESTION_INVALID_INTENT');
  }
  const rawIntensity = String(recommendation.intensity ?? '').toUpperCase();
  const intensity = rawIntensity
    ? (rawIntensity as TodaySuggestionIntensity)
    : undefined;
  if (intensity && !INTENSITIES.has(intensity)) {
    throw new Error('TODAY_SUGGESTION_INVALID_INTENSITY');
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
    headline: requiredText(row.headline, 120, 'HEADLINE'),
    summary: requiredText(row.summary, 700, 'SUMMARY'),
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
  const scheduledWorkout = todaySuggestionScheduledWorkout(projection, draft);
  if (draft.recommendation.kind === 'TRAIN') {
    const basis = draft.trainingBasis;
    const moved = projection.todayWorkouts.some(
      (workout) => workout.status === 'MOVED',
    );
    const remaining = projection.todayWorkouts.filter((workout) =>
      ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
    );
    if ((moved || remaining.length > 1) && !basis) {
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
    throw new Error(
      'TODAY_SUGGESTION_OUTPUT_REJECTED_UNREQUESTED_EXTRA_TRAINING',
    );
  }
  if (
    hasRecentTrainingActivity(projection) &&
    (draft.recommendation.kind === 'SYNC_DATA' ||
      ['OPEN_IMPORT', 'OPEN_PROVIDER_SETTINGS'].includes(draft.preferredIntent))
  ) {
    throw new Error('TODAY_SUGGESTION_OUTPUT_REJECTED_UNNECESSARY_DATA_TASK');
  }
  if (
    hasRecentTrainingActivity(projection) &&
    !projection.highConcern &&
    (['CHECK_IN', 'REVIEW_ACTIVITY'].includes(draft.recommendation.kind) ||
      draft.preferredIntent === 'OPEN_ASSESSMENT')
  ) {
    throw new Error('TODAY_SUGGESTION_OUTPUT_REJECTED_UNNECESSARY_CHECK_IN');
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
    throw new Error('TODAY_SUGGESTION_OUTPUT_REJECTED_EXPLICIT_FEEDBACK');
  }
  if (
    projection.highConcern &&
    (draft.recommendation.kind === 'TRAIN' ||
      draft.recommendation.intensity === 'HARD' ||
      draft.preferredIntent === 'CREATE_TODAY_WORKOUT')
  ) {
    throw new Error('TODAY_SUGGESTION_OUTPUT_REJECTED_HIGH_CONCERN');
  }
  if (
    projection.todayWorkouts.some((workout) =>
      ['PLANNED', 'IN_PROGRESS'].includes(workout.status),
    ) &&
    draft.preferredIntent === 'CREATE_TODAY_WORKOUT'
  ) {
    throw new Error('TODAY_SUGGESTION_OUTPUT_REJECTED_DUPLICATE_WORKOUT');
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
    throw new Error('TODAY_SUGGESTION_OUTPUT_REJECTED_INSUFFICIENT_TIME');
  }
  for (const decision of projection.coachState?.decisions ?? []) {
    if (!['TODAY', 'TOMORROW', 'UNKNOWN'].includes(decision.relevance))
      continue;
    const handling = draft.coachDecisionHandling?.find(
      (item) => item.decisionId === decision.id,
    );
    if (
      decision.basisCoverage === 'UNVERIFIED' &&
      handling?.handling === 'FOLLOW'
    )
      throw new Error('TODAY_SUGGESTION_OUTPUT_REJECTED_UNVERIFIED_BASIS');
    const allowed =
      decision.stateRole === 'ACTIVE_PROPOSAL'
        ? ['FOLLOW', 'CONDITIONAL', 'DEPART']
        : ['REJECTED_HISTORY', 'APPLIED_HISTORY'].includes(decision.stateRole)
          ? ['HISTORY']
          : ['IGNORE'];
    if (
      !handling ||
      !allowed.includes(handling.handling) ||
      (handling.handling === 'DEPART' && !handling.reason)
    ) {
      throw new Error('TODAY_SUGGESTION_OUTPUT_REJECTED_COACH_DECISION');
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
