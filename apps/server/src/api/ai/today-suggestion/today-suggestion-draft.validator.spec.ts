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
  } as unknown as TodaySuggestionConstraintProjection;

  it('accepts a bounded structured draft and drops unknown fields', () => {
    expect(validateTodaySuggestionDraft({ ...valid, url: '/admin' })).toEqual(
      valid,
    );
  });

  it('requires explicit handling of an unapplied or rejected coach decision', () => {
    const withDecision = {
      ...projection,
      coachState: {
        decisions: [
          {
            id: 'decision-1',
            stateRole: 'ACTIVE_PROPOSAL',
            relevance: 'TODAY',
          },
        ],
      },
    } as TodaySuggestionConstraintProjection;
    expect(() =>
      validateTodaySuggestionDraftForProjection(valid, withDecision),
    ).toThrow('COACH_DECISION');
    expect(
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          coachDecisionHandling: [
            { decisionId: 'decision-1', handling: 'CONDITIONAL', reason: null },
          ],
        },
        withDecision,
      ).recommendation.kind,
    ).toBe('TRAIN');
    expect(() =>
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          coachDecisionHandling: [
            { decisionId: 'decision-1', handling: 'DEPART', reason: null },
          ],
        },
        withDecision,
      ),
    ).toThrow('COACH_DECISION');
    const rejected = {
      ...withDecision,
      coachState: {
        decisions: [
          {
            id: 'decision-1',
            stateRole: 'REJECTED_HISTORY',
            relevance: 'TODAY',
          },
        ],
      },
    } as TodaySuggestionConstraintProjection;
    expect(() =>
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          coachDecisionHandling: [
            { decisionId: 'decision-1', handling: 'FOLLOW' },
          ],
        },
        rejected,
      ),
    ).toThrow('COACH_DECISION');
  });

  it('does not equate an unplanned activity with finishing all training for the day', () => {
    expect(
      validateTodaySuggestionDraftForProjection(valid, {
        ...projection,
        constraints: [],
        todayActivityCount: 1,
        latestActivityId: 'short-walk',
      }).recommendation.kind,
    ).toBe('TRAIN');
  });

  it.each(['OPEN_IMPORT', 'OPEN_PROVIDER_SETTINGS'])(
    'rejects %s as a prerequisite when recent training is already recorded',
    (preferredIntent) => {
      expect(() =>
        validateTodaySuggestionDraftForProjection(
          {
            ...valid,
            recommendation: { kind: 'SYNC_DATA' },
            preferredIntent,
          },
          {
            ...projection,
            constraints: [],
            activityEvidence: { activities: { readyCount: 10 } },
          } as TodaySuggestionConstraintProjection,
        ),
      ).toThrow('UNNECESSARY_DATA_TASK');
    },
  );

  it('does not turn missing optional context into a routine check-in', () => {
    expect(() =>
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          recommendation: { kind: 'CHECK_IN' },
          preferredIntent: 'ASK_COACH',
        },
        { ...projection, latestActivityId: 'today-activity' },
      ),
    ).toThrow('UNNECESSARY_CHECK_IN');
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
    expect(
      validateTodaySuggestionDraftForProjection(valid, {
        ...projection,
        pendingInquiry: { caseId: 'case-1', questionId: 'question-1' },
      }).recommendation.kind,
    ).toBe('TRAIN');
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
        minutesUntilDayEnd: 10,
      }),
    ).toThrow('TODAY_SUGGESTION_OUTPUT_REJECTED_INSUFFICIENT_TIME');
  });

  it('delivers recovery guidance with an optional review link in the evening', () => {
    expect(
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          headline: "Review today's training",
          recommendation: { kind: 'RECOVER' },
          preferredIntent: 'OPEN_ACTIVITY_REVIEW',
          secondaryIntents: ['ASK_COACH'],
        },
        {
          ...projection,
          latestActivityId: 'activity-1',
        },
      ),
    ).toMatchObject({
      recommendation: { kind: 'RECOVER' },
      preferredIntent: 'OPEN_ACTIVITY_REVIEW',
    });
  });
});
