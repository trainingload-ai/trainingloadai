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

  const movedProjection = {
    ...projection,
    date: '2026-11-18',
    constraints: [],
    todayWorkouts: [
      {
        id: 'moved-course',
        status: 'MOVED',
        scheduledDate: '2026-11-18',
        name: 'Endurance ride',
        plannedDurationSeconds: 3900,
      },
    ],
    tomorrowWorkouts: [
      {
        id: 'tomorrow-course',
        status: 'PLANNED',
        scheduledDate: '2026-11-19',
        name: 'Endurance ride',
        plannedDurationSeconds: 3900,
      },
    ],
  } as unknown as TodaySuggestionConstraintProjection;

  it('rejects reviving a moved course as training today without an explicit basis', () => {
    expect(() =>
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          summary: 'The moved endurance ride is still scheduled for tonight.',
          preferredIntent: null,
        },
        movedProjection,
      ),
    ).toThrow('TRAINING_BASIS');
  });

  it.each(['moved-course', 'tomorrow-course', 'unknown-course'])(
    'rejects %s as the scheduled training basis for today',
    (workoutId) => {
      expect(() =>
        validateTodaySuggestionDraftForProjection(
          {
            ...valid,
            preferredIntent: null,
            trainingBasis: { kind: 'SCHEDULED', workoutId },
          },
          movedProjection,
        ),
      ).toThrow('TRAINING_BASIS');
    },
  );

  it('accepts a different remaining course on the same day after another course moves', () => {
    expect(
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          preferredIntent: 'OPEN_TODAY_WORKOUT',
          trainingBasis: { kind: 'SCHEDULED', workoutId: 'remaining-course' },
        },
        {
          ...movedProjection,
          todayWorkouts: [
            ...movedProjection.todayWorkouts,
            {
              ...movedProjection.tomorrowWorkouts[0],
              id: 'remaining-course',
              scheduledDate: movedProjection.date,
            },
          ],
        },
      ).trainingBasis,
    ).toEqual({ kind: 'SCHEDULED', workoutId: 'remaining-course' });
  });

  it('allows explicit additional training with its explanation visible to the athlete', () => {
    const reason =
      'An optional extra easy ride fits your available time and recent load.';
    expect(
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          summary: reason,
          preferredIntent: 'CREATE_TODAY_WORKOUT',
          trainingBasis: { kind: 'ADDITIONAL', reason },
        },
        movedProjection,
      ).trainingBasis,
    ).toEqual({ kind: 'ADDITIONAL', reason });
    expect(() =>
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          preferredIntent: null,
          trainingBasis: { kind: 'ADDITIONAL', reason },
        },
        movedProjection,
      ),
    ).toThrow('TRAINING_BASIS');
  });

  it('requires an explicit new-workout preview for additional training, rather than reviving moved-course prose', () => {
    const summary =
      'Complete the moved endurance ride tonight as originally scheduled.';
    expect(() =>
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          summary,
          preferredIntent: null,
          trainingBasis: { kind: 'ADDITIONAL', reason: summary },
        },
        movedProjection,
      ),
    ).toThrow('TRAINING_BASIS');
  });

  it('requires the chosen course identity when more than one course remains today', () => {
    expect(() =>
      validateTodaySuggestionDraftForProjection(
        { ...valid, preferredIntent: 'OPEN_TODAY_WORKOUT' },
        {
          ...movedProjection,
          todayWorkouts: ['first', 'second'].map((id) => ({
            ...movedProjection.tomorrowWorkouts[0],
            id,
            scheduledDate: movedProjection.date,
          })),
        },
      ),
    ).toThrow('TRAINING_BASIS');
  });

  it('checks remaining time against the selected course rather than a different course', () => {
    expect(
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          recommendation: { kind: 'TRAIN' },
          preferredIntent: 'OPEN_TODAY_WORKOUT',
          trainingBasis: { kind: 'SCHEDULED', workoutId: 'short-course' },
        },
        {
          ...movedProjection,
          minutesUntilDayEnd: 20,
          todayWorkouts: [
            {
              ...movedProjection.tomorrowWorkouts[0],
              scheduledDate: movedProjection.date,
            },
            {
              ...movedProjection.tomorrowWorkouts[0],
              id: 'short-course',
              scheduledDate: movedProjection.date,
              plannedDurationSeconds: 900,
            },
          ],
        },
      ).recommendation.kind,
    ).toBe('TRAIN');
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
