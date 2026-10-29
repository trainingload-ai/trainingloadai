import {
  containsZeroPercentage,
  type CoachReviewAction,
  type CoachReviewJudgment,
} from '@/api/ai/daily-plan-review-judgment';
import {
  addCalendarDays,
  groundOvernightRelativeDayCopy,
} from '@/api/ai/core/athlete-relative-day';
import type { PlanWorkoutAdjustmentDraftData } from '@shared/ai-coach-schema';
import type { CoachReviewContext } from './coach-review-context.service';
import type { CoachReviewWorkoutEvidence } from './coach-review-context.service';

export type RuntimeCoachReviewJudgment = CoachReviewJudgment & {
  source: 'llm' | 'fallback';
  upstreamFailureCode: string | null;
};

export function normalizeCoachReviewJudgment(args: {
  context: CoachReviewContext;
  judgment: RuntimeCoachReviewJudgment;
}): RuntimeCoachReviewJudgment {
  const groundedEvidenceCodes = groundEvidenceCodes(
    args.context,
    args.judgment.evidenceCodes,
  );
  const rationale = groundRelativeDayCopy(
    args.context,
    args.judgment.rationale,
  );
  if (
    args.judgment.source !== 'llm' ||
    !isDisplayableModelRationale(args.context, rationale)
  ) {
    return suppressCoachReviewOutput(
      {
        ...args.judgment,
        rationale,
        evidenceCodes: groundedEvidenceCodes,
      },
      args.judgment.source === 'llm' ? 'MODEL_RATIONALE_REJECTED' : null,
    );
  }
  if (args.judgment.decision !== 'ADJUST') {
    return {
      ...args.judgment,
      decision: 'KEEP',
      presentation: hasMeaningfulExecutionDeviation(args.context)
        ? 'GUIDANCE'
        : (args.judgment.presentation ?? 'SILENT'),
      action: null,
      targetWorkoutId: null,
      sourceWorkoutId: null,
      targetDate: null,
      rationale,
      evidenceCodes: groundedEvidenceCodes,
      adjustmentIntent: null,
    };
  }
  if (!validAdjustmentTarget(args.context, args.judgment)) {
    return suppressCoachReviewOutput(
      {
        ...args.judgment,
        rationale,
        evidenceCodes: groundedEvidenceCodes,
      },
      'INVALID_ADJUSTMENT_TARGET',
    );
  }
  return {
    ...args.judgment,
    presentation: 'DECISION',
    rationale,
    evidenceCodes: groundedEvidenceCodes,
  };
}

/**
 * Keep the saved plan unchanged when model-authored user-facing copy is not
 * available or fails factual/presentation validation. Rules may still classify
 * evidence internally, but they must not impersonate the coach in the UI.
 */
export function suppressCoachReviewOutput(
  judgment: RuntimeCoachReviewJudgment,
  evidenceCode: string | null = null,
): RuntimeCoachReviewJudgment {
  return {
    ...judgment,
    decision: 'KEEP',
    presentation: 'SILENT',
    action: null,
    targetWorkoutId: null,
    sourceWorkoutId: null,
    targetDate: null,
    rationale: '',
    evidenceCodes: evidenceCode
      ? [...new Set([...judgment.evidenceCodes, evidenceCode])]
      : judgment.evidenceCodes,
    adjustmentIntent: null,
  };
}

export function buildCoachReviewFallback(
  context: CoachReviewContext,
  copy: { keep: string; propose: string },
  upstreamFailureCode: string | null = null,
): RuntimeCoachReviewJudgment {
  const target = context.upcoming[0] ?? null;
  if (!target) {
    return keepFallback(context, copy.keep, upstreamFailureCode, [
      'NO_UPCOMING_WORKOUT',
    ]);
  }
  const reviewedDays = context.recent7Days.filter(
    (day) =>
      day.date >= context.meta.reviewedFrom &&
      day.date <= context.meta.reviewedThrough,
  );
  const reviewedWorkouts = reviewedDays.flatMap((day) => day.plannedWorkouts);
  const reviewedActivities = reviewedDays.flatMap((day) => day.activities);
  const incomplete = reviewedWorkouts.filter(
    (workout) => workout.executionStatus === 'MISSED',
  );
  const activeDayLoads = context.recent7Days
    .map((day) => day.pmc.dailyLoad)
    .filter((value): value is number => value != null && value >= 10)
    .sort((a, b) => a - b);
  const activeMedian = median(activeDayLoads);
  const extra = reviewedActivities.filter(
    (activity) => !activity.linkedWorkoutId,
  );
  const substantialExtra = extra.find((activity) => {
    if (activity.load == null) return false;
    const reference = target.expectedLoad ?? activeMedian;
    return reference != null
      ? activity.load >= Math.max(10, reference * 0.5)
      : activity.load >= 20;
  });
  const incompleteWithoutReplacement = incomplete.some((workout) => {
    const comparable = reviewedActivities.some(
      (activity) =>
        activity.sportType === workout.sportType &&
        activity.load != null &&
        workout.expectedLoad != null &&
        activity.load >= workout.expectedLoad * 0.5,
    );
    return !comparable;
  });
  const executionConcern = Boolean(
    substantialExtra || incompleteWithoutReplacement,
  );
  const lastPmc = context.recent7Days.at(-1)?.pmc;
  const load = context.loadSnapshot;
  const loadGrowth =
    load.currentWeekLoad != null &&
    load.previousWeekLoad != null &&
    load.previousWeekLoad >= 10 &&
    load.currentWeekLoad > load.previousWeekLoad * 1.2;
  const pmcPressure =
    lastPmc?.ctl != null &&
    lastPmc.atl != null &&
    lastPmc.tsb != null &&
    lastPmc.tsb < 0 &&
    lastPmc.atl > lastPmc.ctl * 1.1;
  const loadConcern = Boolean(loadGrowth && pmcPressure);
  const tomorrow = addCalendarDays(context.meta.reviewedThrough, 1);
  const recoveryConcern = extra.some(
    (activity) =>
      (activity.dayPeriod === 'evening' || activity.dayPeriod === 'night') &&
      target.date === tomorrow &&
      (activity.load == null || substantialExtra?.id === activity.id),
  );
  const postponedDate = target.date ? addCalendarDays(target.date, 1) : null;
  const collision = Boolean(
    postponedDate &&
    context.upcoming
      .slice(1)
      .some(
        (workout) =>
          workout.date === postponedDate &&
          (workout.summary?.hardSession === true ||
            target.summary?.hardSession === true),
      ),
  );
  const concerns = [executionConcern, loadConcern, recoveryConcern].filter(
    Boolean,
  ).length;
  if (concerns < 2 || (!executionConcern && !recoveryConcern)) {
    return keepFallback(context, copy.keep, upstreamFailureCode, [
      ...(executionConcern ? ['EXECUTION_MISMATCH'] : []),
      ...(loadConcern ? ['LOAD_PRESSURE'] : []),
      ...(recoveryConcern ? ['SHORT_RECOVERY'] : []),
    ]);
  }
  const action: CoachReviewAction =
    collision &&
    substantialExtra?.sportType === target.sportType &&
    substantialExtra.load != null &&
    target.expectedLoad != null &&
    substantialExtra.load >= target.expectedLoad * 0.8
      ? 'SKIP'
      : 'POSTPONE';
  return {
    decision: 'ADJUST',
    presentation: 'DECISION',
    action,
    targetWorkoutId: target.id,
    sourceWorkoutId: null,
    targetDate: null,
    rationale: groundRelativeDayCopy(context, copy.propose),
    confidence: action === 'SKIP' ? 0.52 : 0.58,
    evidenceCodes: [
      ...(substantialExtra ? ['EXTRA_ACTIVITY'] : []),
      ...(incompleteWithoutReplacement ? ['MISSED_WORKOUT'] : []),
      ...(loadConcern ? ['LOAD_PRESSURE'] : []),
      ...(recoveryConcern ? ['SHORT_RECOVERY'] : []),
      ...(collision ? ['SCHEDULE_COLLISION'] : []),
    ],
    adjustmentIntent: null,
    source: 'fallback',
    upstreamFailureCode,
  };
}

export function decisionTypeForAction(action: CoachReviewAction | null) {
  if (action === 'POSTPONE') return 'PLAN_WORKOUT_POSTPONE' as const;
  if (action === 'RESCHEDULE_MISSED') return 'PLAN_WORKOUT_RESCHEDULE' as const;
  if (action === 'SKIP') return 'PLAN_WORKOUT_STATUS' as const;
  if (action === 'ADD_SESSION') return 'PLAN_WORKOUT_ADD' as const;
  if (
    action === 'REDUCE_VOLUME' ||
    action === 'REDUCE_INTENSITY' ||
    action === 'RECOVERY' ||
    action === 'REPLACE_NEXT' ||
    action === 'INCREASE_VOLUME' ||
    action === 'INCREASE_INTENSITY'
  ) {
    return 'PLAN_WORKOUT_UPDATE' as const;
  }
  return null;
}

export function buildReviewAdjustmentMetadata(args: {
  action: CoachReviewAction;
  target: CoachReviewWorkoutEvidence;
  rationale: string;
  draft: PlanWorkoutAdjustmentDraftData | null;
  beforeLoad: number | null;
  afterLoad: number | null;
  targetDate?: string | null;
}) {
  const before = {
    name: args.target.name,
    date: args.target.date,
    summary: workoutDisplaySummary(args.target),
    expectedLoad: args.beforeLoad ?? args.target.expectedLoad,
  };
  if (args.draft) {
    return {
      kind: args.action.toLowerCase(),
      before,
      after: {
        name: args.draft.after.name ?? args.target.name,
        date: args.draft.after.scheduledDate ?? args.target.date,
        summary:
          args.draft.after.notes ||
          args.draft.after.name ||
          args.draft.after.text,
        expectedLoad: args.afterLoad,
      },
      changes: args.draft.changes,
    };
  }
  if (args.action === 'POSTPONE' || args.action === 'RESCHEDULE_MISSED') {
    const nextDate =
      args.action === 'RESCHEDULE_MISSED'
        ? (args.targetDate ?? null)
        : args.target.date
          ? addCalendarDays(args.target.date, 1)
          : null;
    return {
      kind:
        args.action === 'RESCHEDULE_MISSED' ? 'reschedule_missed' : 'postpone',
      before,
      after: { ...before, date: nextDate },
      changes:
        args.target.date && nextDate
          ? [
              {
                field: 'date',
                before: args.target.date,
                after: nextDate,
                reason: args.rationale,
              },
            ]
          : [],
    };
  }
  return {
    kind: 'skip',
    before,
    after: { ...before, summary: null, expectedLoad: 0 },
    changes: [
      {
        field: 'status',
        before: args.target.status,
        after: 'SKIPPED',
        reason: args.rationale,
      },
    ],
  };
}

export function classifyUpstreamFailure(error: unknown) {
  const status = Number(
    (error as { status?: unknown })?.status ??
      (error as { response?: { status?: unknown } })?.response?.status,
  );
  if (status === 401) return 'UPSTREAM_AUTH';
  if (status === 402) return 'UPSTREAM_BILLING';
  if (status === 403) return 'UPSTREAM_FORBIDDEN';
  if (status === 429) return 'UPSTREAM_RATE_LIMIT';
  if (status >= 500) return 'UPSTREAM_SERVER';
  const message = error instanceof Error ? error.message : String(error);
  if (/\b402\b|insufficient balance|payment required/i.test(message)) {
    return 'UPSTREAM_BILLING';
  }
  if (/timeout|timed out|aborted/i.test(message)) return 'UPSTREAM_TIMEOUT';
  return 'UPSTREAM_ERROR';
}

function keepFallback(
  context: CoachReviewContext,
  rationale: string,
  upstreamFailureCode: string | null,
  evidenceCodes: string[],
): RuntimeCoachReviewJudgment {
  return {
    decision: 'KEEP',
    presentation: hasMeaningfulExecutionDeviation(context)
      ? 'GUIDANCE'
      : 'SILENT',
    action: null,
    targetWorkoutId: null,
    sourceWorkoutId: null,
    targetDate: null,
    rationale: groundRelativeDayCopy(context, rationale),
    confidence: 0.65,
    evidenceCodes: groundEvidenceCodes(context, evidenceCodes),
    adjustmentIntent: null,
    source: 'fallback',
    upstreamFailureCode,
  };
}

function validAdjustmentTarget(
  context: CoachReviewContext,
  judgment: RuntimeCoachReviewJudgment,
) {
  const action = judgment.action;
  if (!action) return false;
  const upcomingTarget = context.upcoming.find(
    (workout) => workout.id === judgment.targetWorkoutId,
  );
  const missedTarget = missedWorkout(context, judgment.targetWorkoutId);
  const missedSource = missedWorkout(context, judgment.sourceWorkoutId);
  const openDate = (context.scheduleOpportunities ?? []).some(
    (opportunity) => opportunity.date === judgment.targetDate,
  );
  if (action === 'ADD_SESSION') {
    return Boolean(!judgment.targetWorkoutId && missedSource && openDate);
  }
  if (action === 'RESCHEDULE_MISSED') {
    return Boolean(missedTarget && !judgment.sourceWorkoutId && openDate);
  }
  if (action === 'REPLACE_NEXT') {
    return Boolean(
      upcomingTarget &&
      isActionable(upcomingTarget) &&
      missedSource &&
      missedSource.sportType === upcomingTarget.sportType &&
      !judgment.targetDate,
    );
  }
  if (action === 'INCREASE_VOLUME' || action === 'INCREASE_INTENSITY') {
    const signals = context.executionSignals;
    const supportedProgression = Boolean(
      signals &&
      signals.completedSessionsToDate > 0 &&
      signals.consecutiveMissedWorkouts <= 1 &&
      (signals.loadCompletionRatio == null ||
        signals.loadCompletionRatio >= 0.65),
    );
    return Boolean(
      supportedProgression &&
      upcomingTarget &&
      isActionable(upcomingTarget) &&
      !judgment.sourceWorkoutId &&
      !judgment.targetDate,
    );
  }
  return Boolean(
    upcomingTarget &&
    isActionable(upcomingTarget) &&
    !judgment.sourceWorkoutId &&
    !judgment.targetDate,
  );
}

function isActionable(workout: CoachReviewWorkoutEvidence) {
  return ['PLANNED', 'IN_PROGRESS'].includes(workout.status);
}

function missedWorkout(
  context: CoachReviewContext,
  workoutId: string | null | undefined,
) {
  if (!workoutId) return null;
  return context.recent7Days
    .flatMap((day) => day.plannedWorkouts)
    .find(
      (workout) =>
        workout.id === workoutId && workout.executionStatus === 'MISSED',
    );
}

export function hasMeaningfulExecutionDeviation(context: CoachReviewContext) {
  const signals = context.executionSignals;
  if (!signals) return false;
  return (
    signals.missedWorkoutIds.length > 0 ||
    (signals.plannedLoadToDate >= 10 &&
      signals.loadCompletionRatio != null &&
      signals.loadCompletionRatio < 0.7) ||
    (signals.plannedSessionsToDate >= 2 &&
      signals.sessionCompletionRatio != null &&
      signals.sessionCompletionRatio < 0.7)
  );
}

function groundEvidenceCodes(
  context: CoachReviewContext,
  evidenceCodes: string[],
) {
  const signals = context.executionSignals;
  if (!signals) return [...new Set(evidenceCodes)];
  const hasDeviation = hasMeaningfulExecutionDeviation(context);
  const result = new Set(
    evidenceCodes.filter((code) => !(hasDeviation && code === 'PLAN_ON_TRACK')),
  );
  if (signals.missedWorkoutIds.length > 0) result.add('MISSED_WORKOUT');
  if (
    signals.plannedLoadToDate >= 10 &&
    signals.loadCompletionRatio != null &&
    signals.loadCompletionRatio < 0.7
  ) {
    result.add('LOAD_DEFICIT');
  }
  return [...result];
}

function isDisplayableModelRationale(
  context: CoachReviewContext,
  rationale: string,
) {
  if (!rationale.trim() || containsZeroPercentage(rationale)) return false;
  if (!hasMeaningfulExecutionDeviation(context)) return true;
  return !/负荷平稳|按(?:原)?计划(?:继续|进行|执行)|计划进展顺利|on track|load (?:is )?stable|execution.*support keeping/i.test(
    rationale,
  );
}

/**
 * Daily jobs run after local midnight, so the reviewed day is already
 * yesterday. Frozen 今天/today copy is rewritten only for that overnight case.
 */
export function groundRelativeDayCopy(
  context: CoachReviewContext,
  rationale: string,
) {
  return groundOvernightRelativeDayCopy({
    text: rationale,
    locale: context.meta.locale,
    scale: context.meta.scale,
    athleteToday: context.meta.athleteToday,
    reviewedThrough: context.meta.reviewedThrough,
  });
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

function workoutDisplaySummary(workout: CoachReviewWorkoutEvidence) {
  return workout.notes || workout.name || workout.text;
}
