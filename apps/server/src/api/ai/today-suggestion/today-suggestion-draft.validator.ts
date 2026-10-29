import {
  isTodaySuggestionIntentType,
  type TodaySuggestionIntensity,
  type TodaySuggestionRecommendationKind,
} from '@shared/ai-today-suggestion-contract';
import type {
  TodaySuggestionConstraintProjection,
  TodaySuggestionDraft,
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

export function validateTodaySuggestionDraft(
  raw: unknown,
): TodaySuggestionDraft {
  const row = record(raw);
  const recommendation = record(row?.recommendation);
  if (!row || !recommendation) {
    throw new Error('TODAY_SUGGESTION_INVALID_DRAFT');
  }
  const kind = String(recommendation.kind ?? '').toUpperCase();
  const preferredIntent = String(row.preferredIntent ?? '').toUpperCase();
  if (!RECOMMENDATION_KINDS.has(kind as TodaySuggestionRecommendationKind)) {
    throw new Error('TODAY_SUGGESTION_INVALID_RECOMMENDATION');
  }
  if (!isTodaySuggestionIntentType(preferredIntent)) {
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
    preferredIntent,
    secondaryIntents,
    tags: stringList(row.tags, 5, 32),
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
  if (
    projection.highConcern &&
    (draft.recommendation.intensity === 'HARD' ||
      draft.preferredIntent === 'CREATE_TODAY_WORKOUT')
  ) {
    throw new Error('TODAY_SUGGESTION_OUTPUT_REJECTED_HIGH_CONCERN');
  }
  if (
    projection.pendingInquiry &&
    draft.preferredIntent !== 'OPEN_ASSESSMENT'
  ) {
    throw new Error('TODAY_SUGGESTION_OUTPUT_REJECTED_PENDING_ASSESSMENT');
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
    projection.newWorkoutWindowOpen === false &&
    (draft.recommendation.kind === 'TRAIN' ||
      draft.preferredIntent === 'CREATE_TODAY_WORKOUT' ||
      (draft.preferredIntent === 'OPEN_TODAY_WORKOUT' &&
        !projection.todayWorkouts.some(
          (workout) => workout.status === 'IN_PROGRESS',
        )))
  ) {
    throw new Error('TODAY_SUGGESTION_OUTPUT_REJECTED_TRAINING_WINDOW_CLOSED');
  }
  return draft;
}
