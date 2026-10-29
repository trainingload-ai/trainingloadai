/**
 * 周期 Runtime：计划 COMPLETED 且 finalize 之后，提案「开启下一计划」。
 *
 * 不能 Nest 注入进 PlanModule（会环）。监听 plan.finalized，
 * 这里再 openBranch(allowFinalized) + squash open_next。
 * CANCELLED 不提案。实例策略未授权也不提案。不受 AI_REVIEW_MODE.planReview 通知开关限制。
 * apply 时不改已完成计划，只记 ADAPTATION_APPLIED。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@/prisma/prisma.service';
import { CoachBranchingService } from '@/api/ai/coach-branching.service';
import { UserService } from '@/api/user/user.service';
import { I18nService } from 'nestjs-i18n';
import {
  PLAN_FINALIZED_EVENT,
  type PlanFinalizedEvent,
} from '@/api/plan/events/plan.events';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import { coachRuntimeText } from './coach-runtime-copy';
import {
  FEATURE_ACCESS_POLICY,
  type FeatureAccessPolicy,
} from '@/access/feature-access-policy.port';

export type CycleReviewRuntimeResult = {
  skipped: boolean;
  reason:
    | 'not_completed'
    | 'not_allowed'
    | 'no_context'
    | 'no_summary'
    | 'duplicate'
    | 'successor_exists'
    | 'propose';
  decisionId?: string;
};

const OPEN_REASON = 'runtime_cycle_review';

@Injectable()
export class CoachCycleReviewRuntimeService {
  private readonly logger = new Logger(CoachCycleReviewRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly branching: CoachBranchingService,
    private readonly userService: UserService,
    @Inject(FEATURE_ACCESS_POLICY)
    private readonly featureAccess: FeatureAccessPolicy,
    private readonly i18n: I18nService,
    private readonly planQuery: PlanQueryService,
  ) {}

  @OnEvent(PLAN_FINALIZED_EVENT)
  async handlePlanFinalized(event: PlanFinalizedEvent) {
    try {
      await this.runAfterFinalize(event);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[cycle-runtime] plan.finalized failed userId=${event.userId} planId=${event.planId}: ${msg}`,
      );
    }
  }

  /** 已完成计划：打开 FINALIZED 上的短分支，提案 PLAN_LIFECYCLE / open_next。 */
  async runAfterFinalize(args: {
    userId: string;
    planId: string;
    planStatus: 'COMPLETED' | 'CANCELLED';
  }): Promise<CycleReviewRuntimeResult> {
    if (args.planStatus !== 'COMPLETED') {
      return { skipped: true, reason: 'not_completed' };
    }

    const access = await this.featureAccess.evaluate(args.userId, [
      'ai.planAdvice',
    ]);
    if (!access.features['ai.planAdvice'].allowed) {
      return { skipped: true, reason: 'not_allowed' };
    }

    if (
      !(
        await this.planQuery.findNextCycleEligiblePlanIds(args.userId, [
          args.planId,
        ])
      ).length
    ) {
      return { skipped: true, reason: 'successor_exists' };
    }

    const context = await this.planQuery.findContextByPlan(
      args.userId,
      args.planId,
    );
    if (!context) {
      return { skipped: true, reason: 'no_context' };
    }

    const pending = await this.prisma.coachDecision.findFirst({
      where: {
        contextId: context.id,
        state: 'PROPOSED',
        decisionType: 'PLAN_LIFECYCLE',
        branch: { openReason: OPEN_REASON },
      },
      select: { id: true },
    });
    if (pending) {
      return { skipped: true, reason: 'duplicate' };
    }

    const summary = await this.prisma.coachSummary.findUnique({
      where: { contextId: context.id },
      select: {
        id: true,
        markdown: true,
        progressLabel: true,
        planId: true,
        keyDrivers: true,
      },
    });
    if (!summary) {
      return { skipped: true, reason: 'no_summary' };
    }

    const plan = await this.planQuery.findPlanTitle(args.planId);
    const lang = await this.userService.getPreferredLocale(args.userId);
    const planTitle =
      plan?.title?.trim() ||
      coachRuntimeText(this.i18n, lang, 'cycleFallbackPlanTitle');
    const completionRate = completionRateFrom(summary.keyDrivers);
    const completionRateLabel = completionRate ?? '—';
    const rationale = coachRuntimeText(this.i18n, lang, 'cycleRationale', {
      planTitle,
      completionRate: completionRateLabel,
    });
    const nextPlanPrompt = coachRuntimeText(
      this.i18n,
      lang,
      'cycleNextPlanPrompt',
      {
        planTitle,
        completionRate: completionRateLabel,
      },
    );

    const opened = await this.branching.openBranch({
      userId: args.userId,
      planId: args.planId,
      openReason: OPEN_REASON,
      allowFinalized: true,
      sourceNode: {
        page: OPEN_REASON,
        planId: args.planId,
        summaryId: summary.id,
      },
    });
    const squashed = await this.branching.squashBranch({
      userId: args.userId,
      branchId: opened.branch.id,
      riskTier: 'HIGH',
      decisionType: 'PLAN_LIFECYCLE',
      payload: {
        planId: args.planId,
        action: 'open_next',
        summaryId: summary.id,
        summaryMarkdown: summary.markdown,
        planTitle,
        completionRate,
        progressLabel: summary.progressLabel,
        nextPlanPrompt,
      },
      rationale,
      options: [
        {
          optionKey: 'apply',
          title: coachRuntimeText(this.i18n, lang, 'optionStartNextPlan'),
          isSelected: true,
        },
        {
          optionKey: 'keep',
          title: coachRuntimeText(this.i18n, lang, 'optionNotNow'),
          isSelected: false,
        },
      ],
    });

    this.logger.log(
      `[cycle-runtime] proposed open_next userId=${args.userId} planId=${args.planId} decisionId=${squashed.decision.id}`,
    );

    return {
      skipped: false,
      reason: 'propose',
      decisionId: squashed.decision.id,
    };
  }
}

function completionRateFrom(keyDrivers: unknown): number | null {
  if (
    !keyDrivers ||
    typeof keyDrivers !== 'object' ||
    Array.isArray(keyDrivers)
  ) {
    return null;
  }
  const value = Number((keyDrivers as Record<string, unknown>).completionRate);
  return Number.isFinite(value) ? value : null;
}
