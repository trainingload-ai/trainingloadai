import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import type { PrismaTx } from '@/prisma/prisma-db';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import { CoachBranchingService } from '@/api/ai/coach-branching.service';
import { UserService } from '@/api/user/user.service';
import { I18nService } from 'nestjs-i18n';
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
    | 'lease_lost'
    | 'propose';
  decisionId?: string;
};

const OPEN_REASON = 'runtime_cycle_review';
const CYCLE_REVIEW_POLL_MS = 5_000;
const CYCLE_REVIEW_LEASE_MS = 60_000;

type CycleReviewTarget = {
  userId: string;
  planId: string;
  planStatus: 'COMPLETED' | 'CANCELLED';
};

type ClaimedCycleReview = {
  contextId: string;
  userId: string;
  planId: string;
  attempts: number;
  claimToken: string;
};

@Injectable()
export class CoachCycleReviewRuntimeService {
  private readonly logger = new Logger(CoachCycleReviewRuntimeService.name);
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly branching: CoachBranchingService,
    private readonly userService: UserService,
    @Inject(FEATURE_ACCESS_POLICY)
    private readonly featureAccess: FeatureAccessPolicy,
    private readonly i18n: I18nService,
    private readonly planQuery: PlanQueryService,
  ) {}

  @Interval(CYCLE_REVIEW_POLL_MS)
  async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      for (let processed = 0; processed < 10; processed += 1) {
        const job = await this.claimNext();
        if (!job) return;
        try {
          await this.runAfterFinalize({ ...job, planStatus: 'COMPLETED' }, job);
        } catch (error) {
          const lastError = (
            error instanceof Error ? error.message : String(error)
          ).slice(0, 1000);
          await this.prisma.coachCycleReviewJob.updateMany({
            where: {
              contextId: job.contextId,
              claimToken: job.claimToken,
              completedAt: null,
            },
            data: {
              claimToken: null,
              leaseExpiresAt: null,
              availableAt: new Date(
                Date.now() + 10_000 * 2 ** Math.min(job.attempts - 1, 6),
              ),
              lastError,
            },
          });
          this.logger.warn(
            `Cycle review failed for plan ${job.planId}: ${lastError}`,
          );
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async claimNext(now = new Date()) {
    const claimToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + CYCLE_REVIEW_LEASE_MS);
    const [job] = await this.prisma.$queryRaw<ClaimedCycleReview[]>`
      WITH picked AS (
        SELECT context_id FROM t_coach_cycle_review_job
        WHERE completed_at IS NULL
          AND available_at <= (${now}::timestamptz AT TIME ZONE 'UTC')
          AND (lease_expires_at IS NULL OR lease_expires_at <= (${now}::timestamptz AT TIME ZONE 'UTC'))
        ORDER BY available_at, context_id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE t_coach_cycle_review_job j
      SET claim_token = ${claimToken},
          lease_expires_at = (${leaseExpiresAt}::timestamptz AT TIME ZONE 'UTC'),
          attempts = j.attempts + 1
      FROM picked
      JOIN t_coach_context c ON c.id = picked.context_id
      WHERE j.context_id = picked.context_id
      RETURNING j.context_id AS "contextId", c.user_id AS "userId",
        c.plan_id AS "planId", j.attempts, j.claim_token AS "claimToken"
    `;
    return job;
  }

  async runAfterFinalize(
    args: CycleReviewTarget,
    claim?: Pick<ClaimedCycleReview, 'contextId' | 'claimToken'>,
  ): Promise<CycleReviewRuntimeResult> {
    if (args.planStatus !== 'COMPLETED') {
      return { skipped: true, reason: 'not_completed' };
    }

    const lang = await this.userService.getPreferredLocale(args.userId);
    const access = await this.featureAccess.evaluate(args.userId, [
      'ai.planAdvice',
    ]);
    const allowed = access.features['ai.planAdvice'].allowed;
    const result = await this.prisma.$transaction(
      async (tx): Promise<CycleReviewRuntimeResult> => {
        await acquireHashtextAdvisoryXactLock(tx, args.userId);
        if (claim) {
          const completed = await tx.coachCycleReviewJob.updateMany({
            where: {
              contextId: claim.contextId,
              context: { userId: args.userId, planId: args.planId },
              claimToken: claim.claimToken,
              completedAt: null,
              leaseExpiresAt: { gt: new Date() },
            },
            data: {
              completedAt: new Date(),
              claimToken: null,
              leaseExpiresAt: null,
              lastError: null,
            },
          });
          if (completed.count !== 1)
            return { skipped: true, reason: 'lease_lost' };
        }
        if (!allowed) return { skipped: true, reason: 'not_allowed' };
        return this.publishNextPlanProposal(args, lang, tx);
      },
    );
    if (result.decisionId) {
      this.logger.log(
        `[cycle-runtime] proposed open_next userId=${args.userId} planId=${args.planId} decisionId=${result.decisionId}`,
      );
    }
    return result;
  }

  private async publishNextPlanProposal(
    args: CycleReviewTarget,
    lang: Awaited<ReturnType<UserService['getPreferredLocale']>>,
    tx: PrismaTx,
  ): Promise<CycleReviewRuntimeResult> {
    if (
      !(
        await this.planQuery.findNextCycleEligiblePlanIds(
          args.userId,
          [args.planId],
          tx,
        )
      ).length
    ) {
      return { skipped: true, reason: 'successor_exists' };
    }

    const context = await this.planQuery.findContextByPlan(
      args.userId,
      args.planId,
      tx,
    );
    if (!context) {
      return { skipped: true, reason: 'no_context' };
    }

    const existing = await tx.coachDecision.findFirst({
      where: {
        contextId: context.id,
        decisionType: 'PLAN_LIFECYCLE',
        branch: { openReason: OPEN_REASON },
      },
      select: { id: true },
    });
    if (existing) {
      return { skipped: true, reason: 'duplicate' };
    }

    const summary = await tx.coachSummary.findUnique({
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

    const plan = await this.planQuery.findPlanTitle(args.planId, tx);
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

    const opened = await this.branching.openBranch(
      {
        userId: args.userId,
        planId: args.planId,
        contextId: context.id,
        openReason: OPEN_REASON,
        allowFinalized: true,
        sourceNode: {
          page: OPEN_REASON,
          planId: args.planId,
          summaryId: summary.id,
        },
      },
      tx,
    );
    const squashed = await this.branching.squashBranch(
      {
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
      },
      tx,
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
