import { describe, expect, it } from '@jest/globals';
import type { CoachReviewContext } from '../coach-review-context.service';
import {
  buildCoachReviewFallback,
  buildReviewAdjustmentMetadata,
  classifyUpstreamFailure,
  groundRelativeDayCopy,
  normalizeCoachReviewJudgment,
} from '../coach-review-runtime-v4';

const copy = { keep: 'Keep the plan.', propose: 'Give recovery more room.' };

describe('coach review runtime v4 safety', () => {
  it('postpones the real late unplanned run case using two evidence domains', () => {
    const result = buildCoachReviewFallback(
      context({
        activity: { load: 26.9, dayPeriod: 'evening', sportType: 'RUN' },
        targetLoad: 21.4,
      }),
      copy,
      'UPSTREAM_BILLING',
    );

    expect(result).toMatchObject({
      decision: 'ADJUST',
      action: 'POSTPONE',
      targetWorkoutId: 'next',
      source: 'fallback',
      upstreamFailureCode: 'UPSTREAM_BILLING',
      evidenceCodes: expect.arrayContaining([
        'EXTRA_ACTIVITY',
        'SHORT_RECOVERY',
      ]),
    });
  });

  it.each([
    [
      'a light evening walk',
      context({ activity: { load: 3, sportType: 'WALK' } }),
    ],
    ['mildly negative TSB alone', context({ tsb: -5, atl: 45, ctl: 50 })],
    [
      'a missed workout replaced by comparable same-sport work',
      context({
        incompleteWorkout: true,
        activity: { load: 24, sportType: 'RUN', linkedWorkoutId: 'missed' },
        reviewedWorkoutLoad: 30,
      }),
    ],
    ['missing load and PMC evidence', context({ activity: { load: null } })],
  ])('keeps for %s', (_name, value) => {
    expect(buildCoachReviewFallback(value, copy)).toMatchObject({
      decision: 'KEEP',
      action: null,
      targetWorkoutId: null,
    });
  });

  it('skips only when postponement collides and the actual work replaced the stimulus', () => {
    const value = context({
      activity: { load: 30, dayPeriod: 'night', sportType: 'RUN' },
      targetLoad: 30,
      collision: true,
    });

    expect(buildCoachReviewFallback(value, copy)).toMatchObject({
      decision: 'ADJUST',
      action: 'SKIP',
      evidenceCodes: expect.arrayContaining(['SCHEDULE_COLLISION']),
    });
  });

  it('rewrites overnight 今天/today copy to yesterday when the reviewed day is already over', () => {
    const shanghaiMorning = context({ incompleteWorkout: true });
    shanghaiMorning.meta.locale = 'zh';
    expect(
      groundRelativeDayCopy(
        shanghaiMorning,
        '本周已错过 9/9 和 9/11，建议把今天错过的对话强度轻松跑推迟到明天。',
      ),
    ).toBe(
      '本周已错过 9/9 和 9/11，建议把昨天错过的对话强度轻松跑推迟到今天。',
    );

    const englishMorning = context({ incompleteWorkout: true });
    expect(
      groundRelativeDayCopy(
        englishMorning,
        "The week already missed two sessions. Postpone today's missed easy run to tomorrow.",
      ),
    ).toBe(
      "The week already missed two sessions. Postpone yesterday's missed easy run to today.",
    );
  });

  it('grounds ADJUST fallback copy that still says today after midnight', () => {
    const result = buildCoachReviewFallback(
      context({
        activity: { load: 26.9, dayPeriod: 'evening', sportType: 'RUN' },
        targetLoad: 21.4,
      }),
      {
        keep: 'Keep the plan.',
        propose: "Today's session was incomplete. Postpone to tomorrow.",
      },
    );

    expect(result.decision).toBe('ADJUST');
    expect(result.rationale).toBe(
      "Yesterday's session was incomplete. Postpone to today.",
    );
  });

  it('leaves relative day words alone when the review is still on athlete-today', () => {
    const sameDay = context({ incompleteWorkout: true });
    sameDay.meta.athleteToday = '2026-08-25';
    expect(
      groundRelativeDayCopy(
        sameDay,
        "Postpone today's missed easy run to tomorrow.",
      ),
    ).toBe("Postpone today's missed easy run to tomorrow.");
  });

  it('grounds LLM rationale that calls the reviewed-day miss “today”', () => {
    const value = context({ incompleteWorkout: true });
    value.meta.locale = 'zh';
    expect(
      normalizeCoachReviewJudgment({
        context: value,
        judgment: {
          decision: 'ADJUST',
          presentation: 'DECISION',
          action: 'RESCHEDULE_MISSED',
          targetWorkoutId: 'missed',
          sourceWorkoutId: null,
          targetDate: '2026-08-27',
          rationale:
            '本周已错过 9/9 和 9/11，建议把今天错过的对话强度轻松跑 · 20 分钟推迟到明天。',
          confidence: 0.7,
          evidenceCodes: ['MISSED_WORKOUT'],
          adjustmentIntent: null,
          source: 'llm',
          upstreamFailureCode: null,
        },
      }).rationale,
    ).toBe(
      '本周已错过 9/9 和 9/11，建议把昨天错过的对话强度轻松跑 · 20 分钟推迟到今天。',
    );
  });

  it('exposes complete before/after metadata for safe schedule actions', () => {
    const target = context({}).upcoming[0];

    expect(
      buildReviewAdjustmentMetadata({
        action: 'POSTPONE',
        target,
        rationale: 'Recover overnight.',
        draft: null,
        beforeLoad: 30,
        afterLoad: null,
      }),
    ).toMatchObject({
      kind: 'postpone',
      before: { date: '2026-08-26', expectedLoad: 30 },
      after: { date: '2026-08-27', expectedLoad: 30 },
      changes: [{ field: 'date' }],
    });
    expect(
      buildReviewAdjustmentMetadata({
        action: 'SKIP',
        target,
        rationale: 'Stimulus already supplied.',
        draft: null,
        beforeLoad: 30,
        afterLoad: null,
      }),
    ).toMatchObject({
      kind: 'skip',
      after: { expectedLoad: 0 },
      changes: [{ field: 'status', after: 'SKIPPED' }],
    });
  });

  it('never binds an invented model workout id to the first upcoming workout', () => {
    const value = context({});
    const result = normalizeCoachReviewJudgment({
      context: value,
      judgment: {
        decision: 'ADJUST',
        action: 'POSTPONE',
        targetWorkoutId: 'invented-id',
        rationale: 'Move it.',
        confidence: 0.8,
        evidenceCodes: [],
        adjustmentIntent: null,
        source: 'llm',
        upstreamFailureCode: null,
      },
    });

    expect(result).toMatchObject({
      decision: 'KEEP',
      presentation: 'SILENT',
      targetWorkoutId: null,
      source: 'llm',
      rationale: '',
      evidenceCodes: expect.arrayContaining(['INVALID_ADJUSTMENT_TARGET']),
    });
  });

  it('suppresses contradicted model copy instead of replacing it with rules', () => {
    const value = context({ incompleteWorkout: true, reviewedWorkoutLoad: 30 });
    const result = normalizeCoachReviewJudgment({
      context: value,
      judgment: {
        decision: 'KEEP',
        presentation: 'SILENT',
        action: null,
        targetWorkoutId: null,
        rationale: 'Load is stable and the plan is on track.',
        confidence: 0.8,
        evidenceCodes: ['PLAN_ON_TRACK'],
        adjustmentIntent: null,
        source: 'llm',
        upstreamFailureCode: null,
      },
    });

    expect(result).toMatchObject({
      decision: 'KEEP',
      presentation: 'SILENT',
      rationale: '',
      evidenceCodes: expect.arrayContaining([
        'MISSED_WORKOUT',
        'LOAD_DEFICIT',
        'MODEL_RATIONALE_REJECTED',
      ]),
    });
    expect(result.evidenceCodes).not.toContain('PLAN_ON_TRACK');
  });

  it('preserves valid model-authored coaching guidance for KEEP', () => {
    const value = context({ incompleteWorkout: true, reviewedWorkoutLoad: 30 });
    value.meta.locale = 'zh';
    const result = normalizeCoachReviewJudgment({
      context: value,
      judgment: {
        decision: 'KEEP',
        presentation: 'GUIDANCE',
        action: null,
        targetWorkoutId: null,
        rationale:
          '昨天的轻松跑没有完成，接下来的课表先保持不变，从明天这节轻松跑重新找回节奏就好。',
        confidence: 0.8,
        evidenceCodes: ['MISSED_WORKOUT'],
        adjustmentIntent: null,
        source: 'llm',
        upstreamFailureCode: null,
      },
    });

    expect(result).toMatchObject({
      decision: 'KEEP',
      presentation: 'GUIDANCE',
      rationale:
        '昨天的轻松跑没有完成，接下来的课表先保持不变，从明天这节轻松跑重新找回节奏就好。',
    });
  });

  it.each([
    '本周实际负荷为计划的 0%。',
    '本周实际负荷为计划的０％。',
    'Actual load is 0 percent of plan.',
    '本周比计划少了 0 个百分点。',
    '本周完成比例为百分之零。',
  ])('never surfaces a zero percentage: %s', (rationale) => {
    const result = normalizeCoachReviewJudgment({
      context: context({ incompleteWorkout: true, reviewedWorkoutLoad: 30 }),
      judgment: {
        decision: 'KEEP',
        presentation: 'GUIDANCE',
        action: null,
        targetWorkoutId: null,
        rationale,
        confidence: 0.8,
        evidenceCodes: ['MISSED_WORKOUT'],
        adjustmentIntent: null,
        source: 'llm',
        upstreamFailureCode: null,
      },
    });

    expect(result).toMatchObject({
      decision: 'KEEP',
      presentation: 'SILENT',
      rationale: '',
      evidenceCodes: expect.arrayContaining(['MODEL_RATIONALE_REJECTED']),
    });
  });

  it('never surfaces rule-authored fallback copy', () => {
    const value = context({
      activity: { load: 26.9, dayPeriod: 'evening', sportType: 'RUN' },
      targetLoad: 21.4,
    });
    const result = normalizeCoachReviewJudgment({
      context: value,
      judgment: buildCoachReviewFallback(value, copy, 'UPSTREAM_TIMEOUT'),
    });

    expect(result).toMatchObject({
      decision: 'KEEP',
      presentation: 'SILENT',
      rationale: '',
      source: 'fallback',
      upstreamFailureCode: 'UPSTREAM_TIMEOUT',
    });
  });

  it.each([
    [401, 'UPSTREAM_AUTH'],
    [402, 'UPSTREAM_BILLING'],
    [403, 'UPSTREAM_FORBIDDEN'],
    [429, 'UPSTREAM_RATE_LIMIT'],
    [503, 'UPSTREAM_SERVER'],
  ])('classifies upstream HTTP %i', (status, expected) => {
    expect(classifyUpstreamFailure({ status })).toBe(expected);
  });
});

type ContextOptions = {
  activity?: {
    load?: number | null;
    dayPeriod?: string;
    sportType?: string;
    linkedWorkoutId?: string | null;
  };
  targetLoad?: number;
  tsb?: number;
  atl?: number;
  ctl?: number;
  incompleteWorkout?: boolean;
  reviewedWorkoutLoad?: number;
  collision?: boolean;
};

function context(options: ContextOptions): CoachReviewContext {
  const reviewedWorkout = options.incompleteWorkout
    ? [
        {
          ...workout('missed', '2026-08-25', options.reviewedWorkoutLoad ?? 30),
          executionStatus: 'MISSED',
        },
      ]
    : [];
  const activities = options.activity
    ? [
        {
          id: 1,
          hashId: 'activity-1',
          date: '2026-08-25',
          localStartTime: '21:35:00',
          dayPeriod: options.activity.dayPeriod ?? 'evening',
          title: 'Actual activity',
          sportType: options.activity.sportType ?? 'RUN',
          durationMinutes: 35,
          distanceKm: 6,
          load: options.activity.load ?? null,
          sessionRpe: null,
          avgHeartRate: null,
          avgPower: null,
          linkedWorkoutId: options.activity.linkedWorkoutId ?? null,
        },
      ]
    : [];
  const target = workout('next', '2026-08-26', options.targetLoad ?? 30);
  const next = options.collision
    ? workout('collision', '2026-08-27', 55, true)
    : workout('later', '2026-08-28', 20);
  return {
    reviewFactHash: 'fact',
    meta: {
      promptVersion: 'plan_review_judgment_v4_2',
      scale: 'daily',
      locale: 'en',
      timezone: 'Asia/Shanghai',
      reviewedFrom: '2026-08-25',
      reviewedThrough: '2026-08-25',
      athleteToday: '2026-08-26',
      generatedAt: '2026-08-26T00:00:00.000Z',
    },
    athlete: { sportProfiles: [] },
    plan: {
      id: 'plan',
      title: 'Base plan',
      goal: null,
      status: 'ACTIVE',
      startDate: '2026-08-01',
      endDate: '2026-09-01',
      periodWeeks: 4,
      currentWeekIndex: 4,
      currentDayIndex: 4,
      updatedAt: '2026-08-25T00:00:00.000Z',
    },
    recent7Days: [
      {
        date: '2026-08-25',
        plannedWorkouts: reviewedWorkout,
        activities,
        pmc: {
          dailyLoad: options.activity?.load ?? 0,
          ctl: options.ctl ?? null,
          atl: options.atl ?? null,
          tsb: options.tsb ?? null,
        },
      },
    ],
    reviewWindowSummary: {
      planned: reviewedWorkout.length,
      done: 0,
      skipped: 0,
      moved: 0,
      incomplete: reviewedWorkout.length,
      plannedLoad: options.reviewedWorkoutLoad ?? 0,
      actualLoad: options.activity?.load ?? 0,
      extraActivities: activities.filter((row) => !row.linkedWorkoutId).length,
      sportBreakdown: {},
    },
    executionSignals: {
      missedWorkoutIds: options.incompleteWorkout ? ['missed'] : [],
      consecutiveMissedWorkouts: options.incompleteWorkout ? 1 : 0,
      plannedSessionsToDate: reviewedWorkout.length,
      completedSessionsToDate: 0,
      plannedLoadToDate: options.reviewedWorkoutLoad ?? 0,
      actualLoadToDate: options.activity?.load ?? 0,
      sessionCompletionRatio: reviewedWorkout.length ? 0 : null,
      loadCompletionRatio:
        options.reviewedWorkoutLoad && options.reviewedWorkoutLoad > 0
          ? (options.activity?.load ?? 0) / options.reviewedWorkoutLoad
          : null,
    },
    scheduleOpportunities: [{ date: '2026-08-27', weekIndex: 4, dayIndex: 2 }],
    loadSnapshot: {
      currentWeekLoad: null,
      previousWeekLoad: null,
      loadDelta: null,
      ctl: options.ctl ?? null,
      atl: options.atl ?? null,
      tsb: options.tsb ?? null,
      dailyLoadLast7d: [],
      restDaysLast14d: null,
    },
    upcoming: [target, next],
    competitionContext: null,
    recentDecisions: [],
    dataQuality: {
      missing: [],
      hasActivityDetails: activities.length > 0,
      hasPmcTrend: options.tsb != null,
      hasAthleteProfile: false,
    },
  } as CoachReviewContext;
}

function workout(
  id: string,
  date: string,
  expectedLoad: number,
  hardSession = false,
) {
  return {
    id,
    date,
    weekIndex: 4,
    dayIndex: 1,
    sessionIndex: 1,
    sportType: 'RUN',
    status: 'PLANNED',
    executionStatus: 'ACTIONABLE',
    name: 'Run',
    notes: null,
    text: '10min Z1',
    structureKind: 'ENDURANCE',
    dslVersion: 1,
    plannedDurationSeconds: 600,
    plannedSessionRpe: null,
    expectedLoad,
    summary: { hardSession },
    linkedActivityIds: [],
  } as CoachReviewContext['upcoming'][number];
}
