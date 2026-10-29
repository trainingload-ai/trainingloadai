import {
  validateTodaySuggestionDraft,
  validateTodaySuggestionDraftForProjection,
} from './today-suggestion-draft.validator';
import type { TodaySuggestionConstraintProjection } from './today-suggestion.types';

describe('validateTodaySuggestionDraft', () => {
  const valid = {
    headline: 'Easy run today',
    summary: 'Keep the session conversational and stop if pain appears.',
    recommendation: {
      kind: 'TRAIN',
      durationMinutes: 30,
      intensity: 'EASY',
      details: ['Keep breathing relaxed.'],
    },
    confidence: 'MEDIUM',
    evidenceCodes: ['NO_ACTIVE_PLAN'],
    preferredIntent: 'CREATE_TODAY_WORKOUT',
    secondaryIntents: ['ASK_COACH', 'SCHEDULE_REMINDER'],
    tags: ['Easy', '30 min'],
  };
  const projection = {
    highConcern: false,
    pendingInquiry: null,
    todayWorkouts: [],
    newWorkoutWindowOpen: true,
  } as unknown as TodaySuggestionConstraintProjection;

  it('accepts a bounded structured draft and drops unknown fields', () => {
    expect(validateTodaySuggestionDraft({ ...valid, url: '/admin' })).toEqual(
      valid,
    );
  });

  it('rejects arbitrary intent names while leaving Workout generation to its dedicated skill', () => {
    expect(() =>
      validateTodaySuggestionDraft({
        ...valid,
        preferredIntent: 'OPEN_ARBITRARY_URL',
      }),
    ).toThrow('TODAY_SUGGESTION_INVALID_INTENT');
    expect(
      validateTodaySuggestionDraft({
        ...valid,
        generatedWorkout: { name: 'must be ignored here' },
      }),
    ).toEqual(valid);
  });

  it('rejects URLs hidden in athlete-facing fields', () => {
    expect(() =>
      validateTodaySuggestionDraft({
        ...valid,
        summary: 'Open https://example.com and continue.',
      }),
    ).toThrow('TODAY_SUGGESTION_URL_NOT_ALLOWED');
  });

  it('rejects drafts that conflict with authoritative safety facts', () => {
    expect(() =>
      validateTodaySuggestionDraftForProjection(valid, {
        ...projection,
        highConcern: true,
      }),
    ).toThrow('TODAY_SUGGESTION_OUTPUT_REJECTED_HIGH_CONCERN');
    expect(() =>
      validateTodaySuggestionDraftForProjection(valid, {
        ...projection,
        pendingInquiry: { caseId: 'case-1', questionId: 'question-1' },
      }),
    ).toThrow('TODAY_SUGGESTION_OUTPUT_REJECTED_PENDING_ASSESSMENT');
    expect(() =>
      validateTodaySuggestionDraftForProjection(valid, {
        ...projection,
        todayWorkouts: [
          {
            id: 'workout-1',
            planId: 'plan-1',
            scheduledDate: '2026-10-28',
            name: 'Scheduled run',
            sportType: 'RUN',
            status: 'PLANNED',
            plannedDurationSeconds: 1800,
            linkedActivityCount: 0,
          },
        ],
      }),
    ).toThrow('TODAY_SUGGESTION_OUTPUT_REJECTED_DUPLICATE_WORKOUT');
    expect(() =>
      validateTodaySuggestionDraftForProjection(valid, {
        ...projection,
        newWorkoutWindowOpen: false,
      }),
    ).toThrow('TODAY_SUGGESTION_OUTPUT_REJECTED_TRAINING_WINDOW_CLOSED');
  });

  it('allows a fact-based daily review after the training window closes', () => {
    expect(
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          headline: "Review today's training",
          recommendation: { kind: 'REVIEW_ACTIVITY' },
          preferredIntent: 'OPEN_ACTIVITY_REVIEW',
          secondaryIntents: ['ASK_COACH'],
        },
        {
          ...projection,
          latestActivityId: 'activity-1',
          newWorkoutWindowOpen: false,
        },
      ),
    ).toMatchObject({
      recommendation: { kind: 'REVIEW_ACTIVITY' },
      preferredIntent: 'OPEN_ACTIVITY_REVIEW',
    });
  });
});
