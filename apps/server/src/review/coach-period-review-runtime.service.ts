import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { $Enums } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/api/ai/ai.service';
import { AiUsageService } from '@/api/ai/ai-usage.service';
import { CoachBranchingService } from '@/api/ai/coach-branching.service';
import { CoachContextService } from '@/api/plan/coach-context.service';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import { activityCalendarYmdInZone } from '@/api/plan/plan-link-calendar.util';
import {
  PlanExecutionContextService,
  type PlanExecutionContext,
} from '@/api/plan/plan-execution-context.service';
import { UserService } from '@/api/user/user.service';
import { I18nService } from 'nestjs-i18n';
import { isCoachUpstreamConfigured } from '@/api/ai/core/coach-upstream.adapter';
import {
  coachRuntimeOptionTitle,
  coachRuntimeText,
} from './coach-runtime-copy';
import {
  CoachReviewContextService,
  type CoachReviewScale,
} from './coach-review-context.service';
import { CoachReviewAdjustmentService } from './coach-review-adjustment.service';
import {
  ReviewModelCallGuard,
  isReviewModelDeferredError,
  reviewUsageFailureReason,
} from './review-model-call-guard';
import {
  buildReviewAdjustmentMetadata,
  buildCoachReviewFallback,
  classifyUpstreamFailure,
  decisionTypeForAction,
  normalizeCoachReviewJudgment,
  suppressCoachReviewOutput,
  type RuntimeCoachReviewJudgment,
} from './coach-review-runtime-v4';
import { adjustmentDraftToWorkoutUpdatePayload } from '@shared/coach-adjustment-decision';
import type { PlanWorkoutAdjustmentDraftData } from '@shared/ai-coach-schema';
import { PLAN_REVIEW_JUDGMENT_PROMPT_VERSION } from '@/api/ai/core/prompt-contracts/plan-review-judgment.contract';
import { emitAthleteStateReassessRequested } from '@/athlete-state/athlete-state.events';

export type PeriodReviewRuntimeResult = {
  skipped: boolean;
  reason:
    | 'not_period'
    | 'no_active_plan'
    | 'duplicate'
    | 'keep'
    | 'guidance'
    | 'propose'
    | 'error';
  decisionId?: string;
};

@Injectable()
export class CoachPeriodReviewRuntimeService {
  private readonly logger = new Logger(CoachPeriodReviewRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planExecution: PlanExecutionContextService,
    private readonly coachContext: CoachContextService,
    private readonly branching: CoachBranchingService,
    private readonly aiService: AiService,
    private readonly aiUsage: AiUsageService,
    private readonly userService: UserService,
    private readonly i18n: I18nService,
    private readonly planQuery: PlanQueryService,
    private readonly reviewContext: CoachReviewContextService,
    private readonly adjustments: CoachReviewAdjustmentService,
    private readonly modelGuard: ReviewModelCallGuard,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async runForJob(args: {
    type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    userId: string;
    digestId: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<PeriodReviewRuntimeResult> {
    const scale = scaleOf(args.type);
    if (!scale) return { skipped: true, reason: 'not_period' };
    const timezone = await this.userService.getPreferredTimezone(args.userId);
    const anchorDate =
      activityCalendarYmdInZone(
        new Date(args.periodEnd.getTime() - 1),
        timezone ?? 'UTC',
      ) ?? args.periodEnd.toISOString().slice(0, 10);
    const execution = await this.planExecution.buildContext({
      userId: args.userId,
      surface: 'HOME_TODAY',
      timezone,
      anchorDate,
    });
    if (!execution.plan || execution.plan.status !== 'ACTIVE') {
      return { skipped: true, reason: 'no_active_plan' };
    }
    const lang = await this.userService.getPreferredLocale(args.userId);
    const context = await this.reviewContext.build({
      userId: args.userId,
      lang,
      scale,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      context: execution,
    });
    const eventType = scale === 'weekly' ? 'REVIEW_WEEKLY' : 'REVIEW_MONTHLY';
    const openReason =
      scale === 'weekly' ? 'runtime_week_review' : 'runtime_month_review';
    const digestKey = `${scale}-runtime:${args.digestId}`;
    const recentReviews = await this.planQuery.findRecentReviewEvents({
      userId: args.userId,
      planId: execution.plan.id,
      type: eventType,
    });
    if (
      recentReviews.some((row) => {
        if (row.dedupeKey === digestKey) return true;
        return asRecord(row.payload)?.factHash === context.reviewFactHash;
      })
    ) {
      return { skipped: true, reason: 'duplicate' };
    }
    await this.supersedeStaleProposals({
      userId: args.userId,
      contextId: execution.contextId,
      factHash: context.reviewFactHash,
      openReason,
    });
    if (
      await this.findPendingProposal({
        userId: args.userId,
        contextId: execution.contextId,
        factHash: context.reviewFactHash,
        openReason,
      })
    ) {
      return { skipped: true, reason: 'duplicate' };
    }

    const fallbackCopy = fallbackCopyForScale(this.i18n, lang, scale);
    const judgment = normalizeCoachReviewJudgment({
      context,
      judgment: await this.judge({
        userId: args.userId,
        lang,
        scale,
        context,
        fallbackCopy,
      }),
    });
    let finalJudgment = judgment;
    let draft: PlanWorkoutAdjustmentDraftData | null = null;
    let composition: {
      attempts: number;
      failure: string | null;
      beforeLoad: number | null;
      afterLoad: number | null;
    } | null = null;
    if (
      judgment.decision === 'ADJUST' &&
      ['PLAN_WORKOUT_UPDATE', 'PLAN_WORKOUT_ADD'].includes(
        decisionTypeForAction(judgment.action) ?? '',
      )
    ) {
      const result = await this.adjustments.compose({
        userId: args.userId,
        lang,
        context,
        judgment,
      });
      draft = result.draft;
      composition = result;
      if (!draft) {
        finalJudgment = suppressCoachReviewOutput(
          judgment,
          'ADJUSTMENT_GENERATION_FAILED',
        );
      }
    }

    let decisionId: string | null = null;
    let branchId: string | null = null;
    const decisionType = decisionTypeForAction(finalJudgment.action);
    if (finalJudgment.decision === 'ADJUST' && decisionType) {
      const opened = await this.branching.openBranch({
        userId: args.userId,
        planId: execution.plan.id,
        openReason,
        sourceNode: {
          page: openReason,
          digestId: args.digestId,
          anchorDate,
          factHash: context.reviewFactHash,
          scale,
        },
      });
      branchId = opened.branch.id;
      const payload = buildDecisionPayload({
        execution,
        context,
        judgment: finalJudgment,
        draft,
        composition,
        scale,
      });
      const squashed = await this.branching.squashBranch({
        userId: args.userId,
        branchId,
        riskTier: 'HIGH',
        decisionType,
        payload,
        rationale: finalJudgment.rationale,
        confidence: finalJudgment.confidence ?? undefined,
        options: [
          {
            optionKey: 'apply',
            title: coachRuntimeOptionTitle(this.i18n, lang, decisionType, true),
            isSelected: true,
          },
          {
            optionKey: 'keep',
            title: coachRuntimeOptionTitle(
              this.i18n,
              lang,
              decisionType,
              false,
            ),
            isSelected: false,
          },
        ],
      });
      decisionId = squashed.decision.id;
    }

    await this.coachContext.appendEvent({
      userId: args.userId,
      planId: execution.plan.id,
      type: eventType,
      source: 'system',
      dedupeKey: digestKey,
      decisionId,
      branchId,
      payload: {
        digestId: args.digestId,
        outcome:
          finalJudgment.decision === 'ADJUST'
            ? 'PROPOSE'
            : finalJudgment.presentation === 'GUIDANCE'
              ? 'KEEP_WITH_GUIDANCE'
              : 'KEEP_SILENT',
        decision: finalJudgment.decision,
        presentation: finalJudgment.presentation,
        action: finalJudgment.action,
        source: finalJudgment.source,
        promptVersion: PLAN_REVIEW_JUDGMENT_PROMPT_VERSION,
        factHash: context.reviewFactHash,
        anchorDate,
        scale,
        rationale: finalJudgment.rationale,
        targetWorkoutId: finalJudgment.targetWorkoutId,
        sourceWorkoutId: finalJudgment.sourceWorkoutId,
        targetDate: finalJudgment.targetDate,
        confidence: finalJudgment.confidence,
        evidenceCodes: finalJudgment.evidenceCodes,
        upstreamFailureCode: finalJudgment.upstreamFailureCode,
        adjustmentGeneration: composition
          ? composition.failure
            ? 'adjustment_generation_failed'
            : 'validated'
          : null,
        composition,
      },
    });
    await emitAthleteStateReassessRequested(this.events, {
      userId: args.userId,
      triggerType: `REVIEW_${scale.toUpperCase()}`,
      triggerRef: args.digestId,
    });
    return finalJudgment.decision === 'ADJUST'
      ? {
          skipped: false,
          reason: 'propose',
          decisionId: decisionId ?? undefined,
        }
      : {
          skipped: false,
          reason:
            finalJudgment.presentation === 'GUIDANCE' ? 'guidance' : 'keep',
        };
  }

  private async judge(args: {
    userId: string;
    lang: string;
    scale: CoachReviewScale;
    context: Awaited<ReturnType<CoachReviewContextService['build']>>;
    fallbackCopy: { keep: string; propose: string };
  }): Promise<RuntimeCoachReviewJudgment> {
    if (!runtimeEnabled()) {
      return buildCoachReviewFallback(
        args.context,
        args.fallbackCopy,
        'RUNTIME_V4_DISABLED',
      );
    }
    if (!isCoachUpstreamConfigured()) {
      return buildCoachReviewFallback(
        args.context,
        args.fallbackCopy,
        'UPSTREAM_NOT_CONFIGURED',
      );
    }
    try {
      const result = await this.modelGuard.run(
        `judgment:${args.scale}`,
        (signal) =>
          this.aiService.generatePlanReviewJudgment({
            userId: args.userId,
            lang: args.lang,
            scale: args.scale,
            context: args.context,
            signal,
          }),
        { failureReason: reviewUsageFailureReason },
      );
      if (!result.replayed) {
        await this.aiUsage.recordUsageEvent({
          userId: args.userId,
          operationId: result.operationId,
          callKey: `${result.operationId}:background-aggregate`,
          kind:
            args.scale === 'weekly'
              ? $Enums.AiUsageKind.REVIEW_WEEKLY
              : $Enums.AiUsageKind.REVIEW_MONTHLY,
          provider: result.provider,
          model: result.model,
          usage: result.usage,
          sid: `coach-${args.scale}-review-runtime-v4`,
        });
      }
      return {
        decision: result.decision,
        presentation: result.presentation,
        action: result.action,
        targetWorkoutId: result.targetWorkoutId,
        sourceWorkoutId: result.sourceWorkoutId,
        targetDate: result.targetDate,
        rationale: result.rationale || args.fallbackCopy.keep,
        confidence: result.confidence,
        evidenceCodes: result.evidenceCodes,
        adjustmentIntent: result.adjustmentIntent,
        source: 'llm',
        upstreamFailureCode: null,
      };
    } catch (error) {
      // The run was stopped after consecutive model failures: let the worker
      // defer the job instead of persisting a fallback judgment for today.
      if (isReviewModelDeferredError(error)) throw error;
      const failureCode = classifyUpstreamFailure(error);
      this.logger.warn(
        `[${args.scale}-runtime-v4] LLM judgment failed code=${failureCode}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return buildCoachReviewFallback(
        args.context,
        args.fallbackCopy,
        failureCode,
      );
    }
  }

  private async findPendingProposal(args: {
    userId: string;
    contextId: string | null;
    factHash: string;
    openReason: string;
  }) {
    if (!args.contextId) return null;
    const pending = await this.prisma.coachDecision.findMany({
      where: {
        contextId: args.contextId,
        context: { userId: args.userId },
        state: 'PROPOSED',
        branch: { openReason: args.openReason },
      },
      select: { id: true, payload: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    return (
      pending.find(
        (row) => asRecord(row.payload)?.factHash === args.factHash,
      ) ?? null
    );
  }

  private async supersedeStaleProposals(args: {
    userId: string;
    contextId: string | null;
    factHash: string;
    openReason: string;
  }) {
    if (!args.contextId) return;
    const pending = await this.prisma.coachDecision.findMany({
      where: {
        contextId: args.contextId,
        context: { userId: args.userId },
        state: 'PROPOSED',
        branch: { openReason: args.openReason },
      },
      select: { id: true, payload: true },
    });
    for (const row of pending) {
      if (asRecord(row.payload)?.factHash === args.factHash) continue;
      await this.branching.rejectDecision({
        userId: args.userId,
        decisionId: row.id,
        reason: `superseded_by_new_${args.openReason}`,
      });
    }
  }
}

function buildDecisionPayload(args: {
  execution: PlanExecutionContext;
  context: Awaited<ReturnType<CoachReviewContextService['build']>>;
  judgment: RuntimeCoachReviewJudgment;
  draft: PlanWorkoutAdjustmentDraftData | null;
  composition: {
    beforeLoad: number | null;
    afterLoad: number | null;
  } | null;
  scale: CoachReviewScale;
}) {
  const reviewed = args.context.recent7Days.flatMap(
    (day) => day.plannedWorkouts,
  );
  const target =
    args.context.upcoming.find(
      (workout) => workout.id === args.judgment.targetWorkoutId,
    ) ??
    reviewed.find(
      (workout) =>
        workout.id ===
        (args.judgment.targetWorkoutId ?? args.judgment.sourceWorkoutId),
    );
  if (!target) throw new Error('Missing period review target workout');
  const base = {
    planId: args.execution.plan!.id,
    workoutId: target.id,
    workoutName: target.name || target.notes || target.text,
    factHash: args.context.reviewFactHash,
    fromWeekIndex: target.weekIndex,
    fromDayIndex: target.dayIndex,
    review: {
      promptVersion: PLAN_REVIEW_JUDGMENT_PROMPT_VERSION,
      scale: args.scale,
      evidenceCodes: args.judgment.evidenceCodes,
      source: args.judgment.source,
    },
    adjustment: buildReviewAdjustmentMetadata({
      action: args.judgment.action!,
      target,
      rationale: args.judgment.rationale,
      draft: args.draft,
      beforeLoad: args.composition?.beforeLoad ?? target.expectedLoad,
      afterLoad: args.composition?.afterLoad ?? null,
      targetDate: args.judgment.targetDate,
    }),
  };
  if (args.judgment.action === 'SKIP') return { ...base, status: 'SKIPPED' };
  if (args.judgment.action === 'POSTPONE') {
    const next = nextWeekDay(target.weekIndex, target.dayIndex);
    return { ...base, weekIndex: next.weekIndex, dayIndex: next.dayIndex };
  }
  if (args.judgment.action === 'RESCHEDULE_MISSED') {
    const destination = args.context.scheduleOpportunities.find(
      (row) => row.date === args.judgment.targetDate,
    );
    if (!destination) throw new Error('Missing reschedule destination');
    return {
      ...base,
      weekIndex: destination.weekIndex,
      dayIndex: destination.dayIndex,
      targetDate: destination.date,
    };
  }
  if (!args.draft) throw new Error('Missing composed workout adjustment');
  if (args.judgment.action === 'ADD_SESSION') {
    return {
      planId: args.execution.plan!.id,
      sourceWorkoutId: target.id,
      workoutName: args.draft.after.name || target.name || target.text,
      factHash: args.context.reviewFactHash,
      review: base.review,
      adjustment: base.adjustment,
      dto: {
        weekIndex: args.draft.after.weekIndex,
        dayIndex: args.draft.after.dayIndex,
        sessionIndex: args.draft.after.sessionIndex ?? 1,
        sportType: args.draft.after.sportType,
        text: args.draft.after.text,
        notes: args.draft.after.notes,
        name: args.draft.after.name,
      },
    };
  }
  return {
    ...adjustmentDraftToWorkoutUpdatePayload(args.draft),
    ...base,
  };
}

function fallbackCopyForScale(
  i18n: I18nService,
  lang: string,
  scale: CoachReviewScale,
) {
  return {
    keep: coachRuntimeText(
      i18n,
      lang,
      scale === 'monthly' ? 'monthlyFallbackKeep' : 'weeklyFallbackKeep',
    ),
    propose: coachRuntimeText(
      i18n,
      lang,
      scale === 'monthly' ? 'monthlyFallbackPropose' : 'weeklyFallbackPropose',
    ),
  };
}

function scaleOf(type: 'DAILY' | 'WEEKLY' | 'MONTHLY') {
  if (type === 'WEEKLY') return 'weekly' as const;
  if (type === 'MONTHLY') return 'monthly' as const;
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

function runtimeEnabled() {
  return (
    String(process.env.COACH_REVIEW_RUNTIME_V4_ENABLED ?? 'true')
      .trim()
      .toLowerCase() !== 'false'
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
