import { Injectable, Logger } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { AiService } from '@/api/ai/ai.service';
import { AiUsageService } from '@/api/ai/ai-usage.service';
import type {
  CoachReviewAction,
  CoachReviewJudgment,
} from '@/api/ai/daily-plan-review-judgment';
import { PlanLoadEstimatorService } from '@/api/plan/plan-load-estimator.service';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import type { WorkoutSummary } from '@shared/workout-summary';
import type { WorkoutStructureKind } from '@shared/workout-structure';
import type { PlanWorkoutAdjustmentDraftData } from '@shared/ai-coach-schema';
import type {
  CoachReviewContext,
  CoachReviewWorkoutEvidence,
} from './coach-review-context.service';
import {
  ReviewModelCallGuard,
  reviewUsageFailureReason,
} from './review-model-call-guard';

export type CoachReviewCompositionResult = {
  draft: PlanWorkoutAdjustmentDraftData | null;
  beforeLoad: number | null;
  afterLoad: number | null;
  attempts: number;
  failure: string | null;
};

const CONTENT_ACTIONS = new Set<CoachReviewAction>([
  'REDUCE_VOLUME',
  'REDUCE_INTENSITY',
  'RECOVERY',
  'REPLACE_NEXT',
  'ADD_SESSION',
  'INCREASE_VOLUME',
  'INCREASE_INTENSITY',
]);

@Injectable()
export class CoachReviewAdjustmentService {
  private readonly logger = new Logger(CoachReviewAdjustmentService.name);

  constructor(
    private readonly ai: AiService,
    private readonly usage: AiUsageService,
    private readonly codecs: WorkoutCodecRegistry,
    private readonly loadEstimator: PlanLoadEstimatorService,
    private readonly modelGuard: ReviewModelCallGuard,
  ) {}

  async compose(args: {
    userId: string;
    lang: string;
    context: CoachReviewContext;
    judgment: CoachReviewJudgment;
  }): Promise<CoachReviewCompositionResult> {
    if (!args.judgment.action || !CONTENT_ACTIONS.has(args.judgment.action)) {
      return {
        draft: null,
        beforeLoad: null,
        afterLoad: null,
        attempts: 0,
        failure: 'not_content_action',
      };
    }
    const missedSource = (args.context.recent7Days ?? [])
      .flatMap((day) => day.plannedWorkouts)
      .find(
        (row) =>
          row.id === args.judgment.sourceWorkoutId &&
          row.executionStatus === 'MISSED',
      );
    const workout =
      args.judgment.action === 'ADD_SESSION'
        ? missedSource
        : args.context.upcoming.find(
            (row) => row.id === args.judgment.targetWorkoutId,
          );
    if (!workout || !validCoordinates(workout)) {
      return {
        draft: null,
        beforeLoad: workout?.expectedLoad ?? null,
        afterLoad: null,
        attempts: 0,
        failure: 'invalid_target_workout',
      };
    }
    const input = {
      action: args.judgment.action,
      adjustmentIntent: args.judgment.adjustmentIntent,
      coachRationale: args.judgment.rationale,
      plan: {
        id: args.context.plan?.id,
        title: args.context.plan?.title,
        goal: args.context.plan?.goal,
      },
      athlete: args.context.athlete,
      before: toAdjustmentWorkout(workout),
      missedSource: missedSource ? toAdjustmentWorkout(missedSource) : null,
      targetSchedule:
        args.judgment.action === 'ADD_SESSION'
          ? (args.context.scheduleOpportunities.find(
              (row) => row.date === args.judgment.targetDate,
            ) ?? null)
          : null,
      planId: args.context.plan?.id,
      workoutId: workout.id,
    };
    let validationError: string | null = null;
    let lastLoads = {
      before: workout.expectedLoad,
      after: null as number | null,
    };
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const action = args.judgment.action;
      const generated = await this.modelGuard.run(
        `adjustment:${args.context.meta.scale}`,
        (signal) =>
          this.ai.generatePlanReviewAdjustment({
            userId: args.userId,
            lang: args.lang,
            scale: args.context.meta.scale,
            action,
            input,
            targetWorkoutId: workout.id,
            validationError,
            signal,
          }),
        { failureReason: reviewUsageFailureReason },
      );
      await this.usage.recordUsageEvent({
        userId: args.userId,
        operationId: generated.operationId,
        callKey: `${generated.operationId}:background-aggregate`,
        kind: usageKind(args.context.meta.scale),
        provider: generated.provider,
        model: generated.model,
        usage: generated.usage,
        sid: `coach-${args.context.meta.scale}-review-composer`,
        entityId: workout.id,
      });
      if (!generated.draft) {
        validationError = 'Output did not match the adjustment draft schema.';
        continue;
      }
      const checked = await this.validate({
        userId: args.userId,
        context: args.context,
        workout,
        action: args.judgment.action,
        targetDate: args.judgment.targetDate ?? null,
        draft: generated.draft,
      });
      lastLoads = { before: checked.beforeLoad, after: checked.afterLoad };
      if (checked.ok === true) {
        return {
          draft: generated.draft,
          beforeLoad: checked.beforeLoad,
          afterLoad: checked.afterLoad,
          attempts: attempt,
          failure: null,
        };
      }
      validationError = checked.error;
    }
    this.logger.warn(
      `[coach-review-composer] failed scale=${args.context.meta.scale} action=${args.judgment.action} workout=${workout.id} error=${validationError}`,
    );
    return {
      draft: null,
      beforeLoad: lastLoads.before,
      afterLoad: lastLoads.after,
      attempts: 2,
      failure: validationError || 'adjustment_generation_failed',
    };
  }

  private async validate(args: {
    userId: string;
    context: CoachReviewContext;
    workout: CoachReviewWorkoutEvidence;
    action: CoachReviewAction;
    targetDate: string | null;
    draft: PlanWorkoutAdjustmentDraftData;
  }): Promise<
    | { ok: true; beforeLoad: number | null; afterLoad: number | null }
    | {
        ok: false;
        error: string;
        beforeLoad: number | null;
        afterLoad: number | null;
      }
  > {
    const before = toAdjustmentWorkout(args.workout);
    const immutableError = validateImmutableDraft({
      planId: args.context.plan?.id ?? '',
      workoutId: args.workout.id,
      before,
      action: args.action,
      targetSchedule:
        args.action === 'ADD_SESSION'
          ? (args.context.scheduleOpportunities.find(
              (row) => row.date === args.targetDate,
            ) ?? null)
          : null,
      draft: args.draft,
    });
    if (immutableError) {
      return {
        ok: false,
        error: immutableError,
        beforeLoad: args.workout.expectedLoad,
        afterLoad: null,
      };
    }
    const kind = args.workout.structureKind as WorkoutStructureKind;
    let beforeSummary: WorkoutSummary;
    let afterSummary: WorkoutSummary;
    try {
      const codec = this.codecs.get(kind, args.workout.dslVersion);
      const beforeStructure = codec.parseText(
        args.draft.before.text,
        args.workout.dslVersion,
      );
      const afterStructure = codec.parseText(
        args.draft.after.text,
        args.workout.dslVersion,
      );
      const issues = codec
        .validate(afterStructure, args.workout.dslVersion)
        .filter((issue) => issue.severity === 'ERROR');
      if (issues.length > 0) throw new Error(issues[0].message);
      beforeSummary = codec.summarize(beforeStructure);
      afterSummary = codec.summarize(afterStructure);
    } catch (error) {
      return {
        ok: false,
        error: `after.text is invalid: ${error instanceof Error ? error.message : String(error)}`,
        beforeLoad: args.workout.expectedLoad,
        afterLoad: null,
      };
    }
    const estimates = await this.loadEstimator.estimateForViewerWorkouts(
      args.userId,
      [
        estimateInput(args.workout, args.draft.before.text, beforeSummary),
        estimateInput(args.workout, args.draft.after.text, afterSummary),
      ],
    );
    const beforeLoad = estimates[0]?.estimatedLoad ?? args.workout.expectedLoad;
    const afterLoad = estimates[1]?.estimatedLoad ?? null;
    const coachingError = validateCoachingChange({
      action: args.action,
      beforeText: args.draft.before.text,
      afterText: args.draft.after.text,
      beforeSummary,
      afterSummary,
      beforeLoad,
      afterLoad,
    });
    if (coachingError) {
      return {
        ok: false,
        error: coachingError,
        beforeLoad,
        afterLoad,
      };
    }
    return { ok: true, beforeLoad, afterLoad };
  }
}

function validateImmutableDraft(args: {
  planId: string;
  workoutId: string;
  before: ReturnType<typeof toAdjustmentWorkout>;
  action: CoachReviewAction;
  targetSchedule: CoachReviewContext['scheduleOpportunities'][number] | null;
  draft: PlanWorkoutAdjustmentDraftData;
}) {
  if (
    args.draft.planId !== args.planId ||
    args.draft.workoutId !== args.workoutId
  ) {
    return 'planId and workoutId must match the target workout.';
  }
  const immutableSides =
    args.action === 'ADD_SESSION'
      ? [args.draft.before]
      : [args.draft.before, args.draft.after];
  for (const side of immutableSides) {
    if (
      side.weekIndex !== args.before.weekIndex ||
      side.dayIndex !== args.before.dayIndex ||
      (side.sessionIndex ?? 1) !== (args.before.sessionIndex ?? 1) ||
      side.sportType !== args.before.sportType ||
      (side.scheduledDate ?? null) !== (args.before.scheduledDate ?? null)
    ) {
      return 'Schedule coordinates and sportType must remain unchanged.';
    }
  }
  if (args.action === 'ADD_SESSION') {
    const target = args.targetSchedule;
    if (
      !target ||
      args.draft.after.weekIndex !== target.weekIndex ||
      args.draft.after.dayIndex !== target.dayIndex ||
      args.draft.after.sportType !== args.before.sportType ||
      args.draft.after.scheduledDate !== target.date
    ) {
      return 'ADD_SESSION after schedule must match an open target date and preserve sportType.';
    }
  }
  if (args.draft.before.text.trim() !== args.before.text.trim()) {
    return 'before.text must exactly match the stored workout.';
  }
  if (args.draft.after.text.trim() === args.before.text.trim()) {
    return 'after.text must contain a material change.';
  }
  return null;
}

function validateCoachingChange(args: {
  action: CoachReviewAction;
  beforeText: string;
  afterText: string;
  beforeSummary: WorkoutSummary;
  afterSummary: WorkoutSummary;
  beforeLoad: number | null;
  afterLoad: number | null;
}) {
  if (
    !['INCREASE_VOLUME', 'INCREASE_INTENSITY'].includes(args.action) &&
    args.beforeLoad != null &&
    args.afterLoad != null &&
    args.afterLoad > args.beforeLoad + 0.5
  ) {
    return 'The adjusted workout must not increase estimated load.';
  }
  const beforeDuration = args.beforeSummary.durationSeconds;
  const afterDuration = args.afterSummary.durationSeconds;
  if (args.action === 'REDUCE_VOLUME') {
    const durationReduced =
      beforeDuration != null &&
      afterDuration != null &&
      afterDuration <= beforeDuration * 0.9;
    const strengthReduced =
      args.beforeSummary.kind === 'STRENGTH' &&
      args.afterSummary.kind === 'STRENGTH' &&
      args.afterSummary.workingSetCount < args.beforeSummary.workingSetCount;
    if (!durationReduced && !strengthReduced) {
      return 'REDUCE_VOLUME requires at least a 10% duration reduction or fewer working sets.';
    }
  }
  if (args.action === 'REDUCE_INTENSITY') {
    const loadReduced =
      args.beforeLoad != null &&
      args.afterLoad != null &&
      args.afterLoad <= args.beforeLoad * 0.95;
    const hardReduced =
      args.beforeSummary.hardSession === true &&
      args.afterSummary.hardSession !== true;
    if (!loadReduced && !hardReduced) {
      return 'REDUCE_INTENSITY must lower estimated load or remove the hard-session classification.';
    }
    if (
      beforeDuration != null &&
      afterDuration != null &&
      afterDuration > beforeDuration * 1.05
    ) {
      return 'REDUCE_INTENSITY must not increase duration.';
    }
  }
  if (args.action === 'RECOVERY') {
    if (args.afterSummary.hardSession === true) {
      return 'RECOVERY must not contain a hard-session prescription.';
    }
    if (
      args.beforeLoad != null &&
      args.afterLoad != null &&
      args.afterLoad >= args.beforeLoad
    ) {
      return 'RECOVERY must reduce estimated load.';
    }
  }
  if (args.action === 'ADD_SESSION') {
    if (args.afterSummary.hardSession === true) {
      return 'ADD_SESSION must be an easy supplemental session.';
    }
    if (
      args.beforeLoad != null &&
      args.afterLoad != null &&
      args.afterLoad > args.beforeLoad * 0.65
    ) {
      return 'ADD_SESSION must not exceed 65% of the missed source load.';
    }
  }
  if (
    args.action === 'REPLACE_NEXT' &&
    args.beforeLoad != null &&
    args.afterLoad != null &&
    args.afterLoad > args.beforeLoad * 1.25
  ) {
    return 'REPLACE_NEXT must not raise target load by more than 25%.';
  }
  if (args.action === 'INCREASE_VOLUME') {
    const durationIncreased =
      beforeDuration != null &&
      afterDuration != null &&
      afterDuration >= beforeDuration * 1.1 &&
      afterDuration <= beforeDuration * 1.25;
    const strengthIncreased =
      args.beforeSummary.kind === 'STRENGTH' &&
      args.afterSummary.kind === 'STRENGTH' &&
      args.afterSummary.workingSetCount > args.beforeSummary.workingSetCount;
    if (!durationIncreased && !strengthIncreased) {
      return 'INCREASE_VOLUME requires a bounded 10–25% duration increase or more working sets.';
    }
    if (args.afterSummary.hardSession && !args.beforeSummary.hardSession) {
      return 'INCREASE_VOLUME must not also make intensity harder.';
    }
  }
  if (args.action === 'INCREASE_INTENSITY') {
    if (
      beforeDuration != null &&
      afterDuration != null &&
      afterDuration > beforeDuration * 1.05
    ) {
      return 'INCREASE_INTENSITY must not increase duration by more than 5%.';
    }
    const loadIncreased =
      args.beforeLoad != null &&
      args.afterLoad != null &&
      args.afterLoad >= args.beforeLoad * 1.05 &&
      args.afterLoad <= args.beforeLoad * 1.2;
    const becameHard =
      args.beforeSummary.hardSession !== true &&
      args.afterSummary.hardSession === true;
    if (!loadIncreased && !becameHard) {
      return 'INCREASE_INTENSITY requires a small measurable intensity progression.';
    }
  }
  if (args.beforeText.trim() === args.afterText.trim()) {
    return 'The adjusted workout must differ from the original.';
  }
  return null;
}

function estimateInput(
  workout: CoachReviewWorkoutEvidence,
  text: string,
  summary: WorkoutSummary,
) {
  return {
    sportType: workout.sportType,
    structureKind: workout.structureKind,
    text,
    durationSeconds: summary.durationSeconds,
    plannedSessionRpe:
      summary.kind === 'STRENGTH'
        ? summary.plannedSessionRpe
        : workout.plannedSessionRpe,
  };
}

function validCoordinates(workout: CoachReviewWorkoutEvidence) {
  return (
    Number.isInteger(workout.weekIndex) &&
    Number(workout.weekIndex) > 0 &&
    Number.isInteger(workout.dayIndex) &&
    Number(workout.dayIndex) >= 1 &&
    Number(workout.dayIndex) <= 7
  );
}

function toAdjustmentWorkout(workout: CoachReviewWorkoutEvidence) {
  return {
    weekIndex: workout.weekIndex!,
    dayIndex: workout.dayIndex!,
    ...(workout.sessionIndex != null
      ? { sessionIndex: workout.sessionIndex }
      : {}),
    ...(workout.name ? { name: workout.name } : {}),
    sportType: workout.sportType,
    text: workout.text,
    ...(workout.notes ? { notes: workout.notes } : {}),
    ...(workout.date ? { scheduledDate: workout.date } : {}),
  };
}

function usageKind(scale: CoachReviewContext['meta']['scale']) {
  if (scale === 'weekly') return $Enums.AiUsageKind.REVIEW_WEEKLY;
  if (scale === 'monthly') return $Enums.AiUsageKind.REVIEW_MONTHLY;
  return $Enums.AiUsageKind.REVIEW_DAILY;
}
