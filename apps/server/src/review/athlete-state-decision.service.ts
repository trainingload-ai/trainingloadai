import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { PlanExecutionContextService } from '@/api/plan/plan-execution-context.service';
import { CoachBranchingService } from '@/api/ai/coach-branching.service';
import type {
  CoachReviewAction,
  CoachReviewJudgment,
} from '@/api/ai/daily-plan-review-judgment';
import { COACH_ASSESSMENT_OUTCOME_PROMPT_VERSION } from '@/api/ai/athlete-state/athlete-state.prompt';
import {
  COACH_ASSESSMENT_DECISION_REQUESTED_EVENT,
  type CoachAssessmentDecisionRequestedEvent,
} from '@/api/ai/athlete-state/coach-assessment.events';
import { adjustmentDraftToWorkoutUpdatePayload } from '@shared/coach-adjustment-decision';
import type { PlanWorkoutAdjustmentDraftData } from '@shared/ai-coach-schema';
import {
  buildReviewAdjustmentMetadata,
  decisionTypeForAction,
} from './coach-review-runtime-v4';
import {
  CoachReviewContextService,
  type CoachReviewContext,
  type CoachReviewWorkoutEvidence,
} from './coach-review-context.service';
import { CoachReviewAdjustmentService } from './coach-review-adjustment.service';

type StateOutcome = {
  kind?: string;
  action?: string;
  title?: string;
  observation?: string;
  reason?: string;
  guidance?: string;
  requiresPlanDecision?: boolean;
  confidence?: number;
};

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));

function outcome(value: unknown): StateOutcome {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as StateOutcome)
    : {};
}

function actionForOutcome(value: string | undefined): CoachReviewAction | null {
  if (value === 'REDUCE_VOLUME') return 'REDUCE_VOLUME';
  if (value === 'REDUCE_INTENSITY') return 'REDUCE_INTENSITY';
  if (value === 'RECOVERY') return 'RECOVERY';
  if (value === 'REPLACE') return 'REPLACE_NEXT';
  if (value === 'MOVE') return 'POSTPONE';
  return null;
}

function nextWeekDay(weekIndex: number | null, dayIndex: number | null) {
  const week = Number(weekIndex);
  const day = Number(dayIndex);
  const offset =
    Number.isFinite(week) && Number.isFinite(day)
      ? Math.max(0, (week - 1) * 7 + (day - 1)) + 1
      : 1;
  return {
    weekIndex: Math.floor(offset / 7) + 1,
    dayIndex: (offset % 7) + 1,
  };
}

/**
 * Converts a background Athlete State intent into the existing, validated
 * Review composer + CoachDecision pipeline. It deliberately lives in Review:
 * AthleteStateModule remains read-only with respect to training plans.
 */
@Injectable()
export class AthleteStateDecisionService {
  private readonly logger = new Logger(AthleteStateDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
    private readonly planExecution: PlanExecutionContextService,
    private readonly contexts: CoachReviewContextService,
    private readonly adjustments: CoachReviewAdjustmentService,
    private readonly branching: CoachBranchingService,
  ) {}

  @OnEvent(COACH_ASSESSMENT_DECISION_REQUESTED_EVENT, {
    suppressErrors: false,
  })
  async handle(event: CoachAssessmentDecisionRequestedEvent) {
    const row = await this.prisma.coachAssessmentCase.findFirst({
      where: {
        id: event.caseId,
        userId: event.userId,
        status: 'DECISION_READY',
        decisionId: null,
      },
      include: { assessment: true },
    });
    if (!row) return;
    const stateOutcome = outcome(row.currentOutcome);
    const action = actionForOutcome(stateOutcome.action);
    if (
      !stateOutcome.requiresPlanDecision ||
      !action ||
      row.assessment.state === 'HIGH_CONCERN'
    ) {
      await this.resolveAsGuidance(
        row.id,
        row.userId,
        row.revision,
        stateOutcome,
      );
      return;
    }
    const claimed = await this.prisma.coachAssessmentCase.updateMany({
      where: {
        id: row.id,
        userId: row.userId,
        revision: row.revision,
        status: 'DECISION_READY',
        decisionId: null,
      },
      data: { status: 'ASSESSING', revision: { increment: 1 } },
    });
    if (claimed.count !== 1) return;

    try {
      const [timezone, locale] = await Promise.all([
        this.users.getPreferredTimezone(row.userId),
        this.users.getPreferredLocale(row.userId),
      ]);
      const execution = await this.planExecution.buildContext({
        userId: row.userId,
        surface: 'COACH_CHAT',
        timezone: timezone ?? row.timezone ?? 'UTC',
      });
      if (!execution.plan) {
        await this.resolveClaimedAsGuidance(row.id, row.userId, stateOutcome);
        return;
      }
      const periodEnd = row.asOf;
      const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);
      const context = await this.contexts.build({
        userId: row.userId,
        lang: locale,
        scale: 'daily',
        periodStart,
        periodEnd,
        context: execution,
      });
      const todayIds = new Set(
        execution.day.plannedWorkouts
          .filter((workout) =>
            ['PLANNED', 'IN_PROGRESS'].includes(String(workout.status)),
          )
          .map((workout) => workout.id),
      );
      // Review's `upcoming` intentionally starts tomorrow. Athlete State is
      // different: a same-day recovery signal must first protect today's
      // actionable prescription, otherwise a recommendation about today's
      // interval session can accidentally rewrite a later easy workout.
      const target =
        context.recent7Days
          .flatMap((day) => day.plannedWorkouts)
          .find((workout) => todayIds.has(workout.id)) ?? context.upcoming[0];
      if (!target) {
        await this.resolveClaimedAsGuidance(row.id, row.userId, stateOutcome);
        return;
      }
      const judgment = this.judgment({
        action,
        target,
        state: row.assessment.state,
        stateOutcome,
      });
      const compositionContext = context.upcoming.some(
        (workout) => workout.id === target.id,
      )
        ? context
        : { ...context, upcoming: [target, ...context.upcoming] };
      const composition =
        action === 'POSTPONE'
          ? null
          : await this.adjustments.compose({
              userId: row.userId,
              lang: locale,
              context: compositionContext,
              judgment,
            });
      if (action !== 'POSTPONE' && !composition?.draft) {
        await this.resolveClaimedAsGuidance(row.id, row.userId, stateOutcome);
        return;
      }
      const branch = row.branchId
        ? { id: row.branchId }
        : (
            await this.branching.openBranch({
              userId: row.userId,
              contextId: execution.contextId,
              openReason: 'athlete_state_assessment',
              sourceNode: {
                assessmentCaseId: row.id,
                assessmentId: row.assessmentId,
                evidenceHash: row.evidenceHash,
              },
            })
          ).branch;
      const bound = await this.prisma.coachAssessmentCase.updateMany({
        where: {
          id: row.id,
          userId: row.userId,
          status: 'ASSESSING',
          decisionId: null,
        },
        data: {
          branchId: branch.id,
          status: 'DECISION_READY',
          revision: { increment: 1 },
        },
      });
      if (bound.count !== 1) return;
      const decisionType = decisionTypeForAction(action);
      if (!decisionType) {
        await this.resolveClaimedAsGuidance(row.id, row.userId, stateOutcome);
        return;
      }
      await this.branching.squashBranch({
        userId: row.userId,
        branchId: branch.id,
        riskTier: 'HIGH',
        decisionType,
        payload: this.payload({
          execution,
          context,
          target,
          action,
          state: row.assessment.state,
          stateOutcome,
          draft: composition?.draft ?? null,
          beforeLoad: composition?.beforeLoad ?? target.expectedLoad,
          afterLoad: composition?.afterLoad ?? null,
          evidenceHash: row.evidenceHash,
        }),
        rationale:
          stateOutcome.reason || stateOutcome.observation || stateOutcome.title,
        confidence:
          typeof stateOutcome.confidence === 'number'
            ? stateOutcome.confidence
            : row.assessment.confidence,
        options: [
          {
            optionKey: 'apply',
            title: locale.toLowerCase().startsWith('zh')
              ? '应用调整'
              : 'Apply adjustment',
            isSelected: true,
          },
          {
            optionKey: 'keep',
            title: locale.toLowerCase().startsWith('zh')
              ? '保持原计划'
              : 'Keep current plan',
            isSelected: false,
          },
        ],
      });
    } catch (error) {
      await this.prisma.coachAssessmentCase.updateMany({
        where: {
          id: row.id,
          userId: row.userId,
          status: { in: ['ASSESSING', 'DECISION_READY'] },
          decisionId: null,
        },
        data: {
          status: 'DECISION_READY',
          followUpAt: new Date(Date.now() + 60 * 60 * 1000),
          revision: { increment: 1 },
        },
      });
      this.logger.warn(
        `Athlete State decision composition failed case=${row.id} error=${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private judgment(args: {
    action: CoachReviewAction;
    target: CoachReviewWorkoutEvidence;
    state: string;
    stateOutcome: StateOutcome;
  }): CoachReviewJudgment {
    const contentAction = args.action !== 'POSTPONE';
    return {
      decision: 'ADJUST',
      presentation: 'DECISION',
      action: args.action,
      targetWorkoutId: args.target.id,
      sourceWorkoutId: args.action === 'REPLACE_NEXT' ? args.target.id : null,
      targetDate: null,
      rationale:
        args.stateOutcome.reason ||
        args.stateOutcome.observation ||
        `Athlete state is ${args.state}.`,
      confidence:
        typeof args.stateOutcome.confidence === 'number'
          ? args.stateOutcome.confidence
          : null,
      evidenceCodes: [`ATHLETE_STATE_${args.state}`, args.action],
      adjustmentIntent: contentAction
        ? {
            magnitude: 'MODERATE',
            preserve: [
              'Preserve the planned sport and session purpose where safe.',
              'Do not add training load.',
            ],
          }
        : null,
    };
  }

  private payload(args: {
    execution: Awaited<ReturnType<PlanExecutionContextService['buildContext']>>;
    context: CoachReviewContext;
    target: CoachReviewWorkoutEvidence;
    action: CoachReviewAction;
    state: string;
    stateOutcome: StateOutcome;
    draft: PlanWorkoutAdjustmentDraftData | null;
    beforeLoad: number | null;
    afterLoad: number | null;
    evidenceHash: string;
  }) {
    const review = {
      promptVersion: COACH_ASSESSMENT_OUTCOME_PROMPT_VERSION,
      scale: 'athlete_state',
      source: 'athlete_state',
      evidenceCodes: [`ATHLETE_STATE_${args.state}`, args.action],
    };
    const adjustment = buildReviewAdjustmentMetadata({
      action: args.action,
      target: args.target,
      rationale:
        args.stateOutcome.reason || args.stateOutcome.observation || '',
      draft: args.draft,
      beforeLoad: args.beforeLoad,
      afterLoad: args.afterLoad,
    });
    const base = {
      planId: args.execution.plan!.id,
      workoutId: args.target.id,
      workoutName: args.target.name || args.target.notes || args.target.text,
      factHash: `${args.evidenceHash}:${args.context.reviewFactHash}`,
      fromWeekIndex: args.target.weekIndex,
      fromDayIndex: args.target.dayIndex,
      review,
      adjustment,
    };
    if (args.action === 'POSTPONE') {
      return {
        ...base,
        ...nextWeekDay(args.target.weekIndex, args.target.dayIndex),
      };
    }
    if (!args.draft) throw new Error('Missing Athlete State adjustment draft');
    return { ...adjustmentDraftToWorkoutUpdatePayload(args.draft), ...base };
  }

  private async resolveAsGuidance(
    caseId: string,
    userId: string,
    revision: number,
    stateOutcome: StateOutcome,
  ) {
    await this.prisma.coachAssessmentCase.updateMany({
      where: { id: caseId, userId, revision, status: 'DECISION_READY' },
      data: {
        status: 'RESOLVED',
        currentOutcome: json({
          ...stateOutcome,
          kind: 'OUTCOME',
          requiresPlanDecision: false,
        }),
        resolvedAt: new Date(),
        revision: { increment: 1 },
      },
    });
  }

  private async resolveClaimedAsGuidance(
    caseId: string,
    userId: string,
    stateOutcome: StateOutcome,
  ) {
    await this.prisma.coachAssessmentCase.updateMany({
      where: { id: caseId, userId, status: 'ASSESSING', decisionId: null },
      data: {
        status: 'RESOLVED',
        currentOutcome: json({
          ...stateOutcome,
          kind: 'OUTCOME',
          requiresPlanDecision: false,
        }),
        resolvedAt: new Date(),
        revision: { increment: 1 },
      },
    });
  }
}
