import {
  validateTodaySuggestionDraft,
  validateTodaySuggestionDraftForProjection,
} from './today-suggestion-draft.validator';
import type { TodaySuggestionConstraintProjection } from './today-suggestion.types';

describe('validateTodaySuggestionDraft', () => {
  const valid = {
    headline: 'Easy run today',
    summary:
      'An easy session fits the time available. Keep the session conversational and stop if pain appears.',
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
    trainingBasis: {
      kind: 'ADDITIONAL',
      reason: 'An easy session fits the time available.',
    },
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

  it('requires a training basis even when no workouts are scheduled today', () => {
    expect(() =>
      validateTodaySuggestionDraftForProjection(
        { ...valid, trainingBasis: undefined },
        projection,
      ),
    ).toThrow('TODAY_SUGGESTION_OUTPUT_REJECTED_TRAINING_BASIS');
  });

  it('includes the reason for an optional session in the athlete-facing summary', () => {
    const reason = 'Recent sessions have been easy and the athlete has time.';
    expect(
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          summary: `If you want to train today, keep the extra run easy. ${reason}`,
          trainingBasis: { kind: 'ADDITIONAL', reason },
        },
        projection,
      ),
    ).toMatchObject({
      recommendation: { kind: 'TRAIN' },
      trainingBasis: { kind: 'ADDITIONAL', reason },
    });
  });

  it('rejects extra training justified by low recorded load when history is sparse', () => {
    const reason = '整体训练负荷很低，所以今天适合再骑一段。';
    expect(() =>
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          summary: reason,
          trainingBasis: { kind: 'ADDITIONAL', reason },
        },
        {
          ...projection,
          lightContext: { activityCoverage: { readyCount: 3 } },
        },
      ),
    ).toThrow(expect.objectContaining({ code: 'TRAINING_BASIS_SPARSE_LOAD' }));
  });

  it('keeps the right rolling load and removes a wrong absolute load and unsupported average', () => {
    const result = validateTodaySuggestionDraftForProjection(
      {
        ...valid,
        summary:
          'Plane Erholung ein. In den letzten sieben Tagen waren es rund 458 Punkte. Der 28-Tage-Durchschnitt liegt bei 51 Punkten.',
        recommendation: {
          kind: 'RECOVER',
          details: ['Die letzten 7 Tage ergeben 496,7 Punkte.'],
        },
        preferredIntent: 'ASK_COACH',
        trainingBasis: undefined,
      },
      {
        ...projection,
        lightContext: {
          load: {
            rolling7DayLoad: 496.7,
            currentWeekLoad: 140,
            previousWeekLoad: 472,
          },
        },
      },
    );
    expect(result.summary).toBe('Plane Erholung ein.');
    expect(result.recommendation.details).toEqual([
      'Die letzten 7 Tage ergeben 496,7 Punkte.',
    ]);
  });

  it.each([' ', {}])(
    'requires a non-empty text reason for an optional session (%j)',
    (reason) => {
      expect(() =>
        validateTodaySuggestionDraftForProjection(
          { ...valid, trainingBasis: { kind: 'ADDITIONAL', reason } },
          projection,
        ),
      ).toThrow(
        expect.objectContaining({ code: 'TRAINING_BASIS_REASON_REQUIRED' }),
      );
    },
  );

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
    ).toThrow(expect.objectContaining({ code: 'INVALID_INTENT' }));
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
    ).toThrow(expect.objectContaining({ code: 'URL_NOT_ALLOWED' }));
  });

  it('rejects overlong athlete-facing text instead of slicing mid-word', () => {
    const overlongSummary = `${'a'.repeat(689)}Zone-2-Bereich extra words.`;
    expect(() =>
      validateTodaySuggestionDraft({
        ...valid,
        summary: overlongSummary,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'SUMMARY_TOO_LONG',
        correction: expect.stringContaining('700'),
      }),
    );

    const overlongUncertainty = `${'b'.repeat(230)}but it will help later.`;
    expect(() =>
      validateTodaySuggestionDraft({
        ...valid,
        uncertainty: overlongUncertainty,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'UNCERTAINTY_TOO_LONG',
        correction: expect.stringContaining('240'),
      }),
    );

    expect(() =>
      validateTodaySuggestionDraft({
        ...valid,
        recommendation: {
          ...valid.recommendation,
          details: ['c'.repeat(161)],
        },
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'RECOMMENDATION_DETAILS_TOO_LONG',
        correction: expect.stringContaining('160'),
      }),
    );
  });

  it('accepts complete athlete-facing prose right at the 700/240 boundaries', () => {
    const exactSummary = `${valid.trainingBasis.reason} ${'a'.repeat(700 - valid.trainingBasis.reason.length - 1)}`;
    const exactUncertainty = 'u'.repeat(240);
    const result = validateTodaySuggestionDraft({
      ...valid,
      summary: exactSummary,
      uncertainty: exactUncertainty,
    });
    expect(result.summary).toBe(exactSummary);
    expect(result.summary.length).toBe(700);
    expect(result.uncertainty).toBe(exactUncertainty);
    expect(result.uncertainty?.length).toBe(240);
  });

  it.each([
    ['SCHEDULED', 'TRAINING_BASIS_WORKOUT_REQUIRED', 'trainingBasis.workoutId'],
    ['ADDITIONAL', 'TRAINING_BASIS_REASON_REQUIRED', 'trainingBasis.reason'],
  ])(
    'names the missing %s basis field in the correction',
    (kind, code, field) => {
      expect(() =>
        validateTodaySuggestionDraft({
          ...valid,
          trainingBasis: { kind },
        }),
      ).toThrow(
        expect.objectContaining({
          code,
          correction: expect.stringContaining(field),
        }),
      );
    },
  );

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
          trainingBasis: undefined,
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
        {
          ...valid,
          preferredIntent: 'OPEN_TODAY_WORKOUT',
          trainingBasis: undefined,
        },
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

  it('does not exempt a future session from the time limit because another session is in progress', () => {
    const sessions = ['IN_PROGRESS', 'PLANNED'].map((status, index) => ({
      ...movedProjection.tomorrowWorkouts[0],
      id: `course-${index}`,
      scheduledDate: movedProjection.date,
      status,
    }));
    expect(() =>
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          preferredIntent: 'OPEN_TODAY_WORKOUT',
          trainingBasis: { kind: 'SCHEDULED', workoutId: 'course-1' },
        },
        { ...movedProjection, todayWorkouts: sessions, minutesUntilDayEnd: 10 },
      ),
    ).toThrow('INSUFFICIENT_TIME');
    expect(
      validateTodaySuggestionDraftForProjection(
        {
          ...valid,
          preferredIntent: 'OPEN_TODAY_WORKOUT',
          trainingBasis: { kind: 'SCHEDULED', workoutId: 'course-0' },
        },
        { ...movedProjection, todayWorkouts: sessions, minutesUntilDayEnd: 10 },
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
          trainingBasis: undefined,
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
