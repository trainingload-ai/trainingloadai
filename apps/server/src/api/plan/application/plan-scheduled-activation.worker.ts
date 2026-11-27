import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { CoachContextService } from './coach-context.service';
import {
  PlanRepository,
  scheduledReplacementReservationWhere,
} from '../persistence/plan.repository';
import { PlanWriteSupport } from './plan-write.support';
import { UserQueryService } from '@/api/user/user-query.service';
import { resolveSupportedLocale } from '@/utils/locale.util';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
import {
  PLAN_WORKOUTS_CHANGED_EVENT,
  PlanWorkoutsChangedEvent,
} from '../events/plan.events';

const ACTIVATION_POLL_MS = 60_000;

@Injectable()
export class PlanScheduledActivationWorker {
  private readonly logger = new Logger(PlanScheduledActivationWorker.name);
  private running = false;
  private reportedCompletionPreview = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanRepository,
    private readonly contexts: CoachContextService,
    private readonly notifications: NotificationDomainService,
    @Optional() private readonly events?: EventEmitter2,
    @Optional() private readonly users?: UserQueryService,
    @Optional() private readonly writer?: PlanWriteSupport,
  ) {}

  @Interval(ACTIVATION_POLL_MS)
  async tick(referenceTime = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      if (this.writer && !this.reportedCompletionPreview) {
        const { due, historical } =
          await this.plans.previewFixedPlanCompletion(referenceTime);
        this.logger.log(
          `Fixed plan completion preflight: ${due} due, ${historical} expired before enablement`,
        );
        this.reportedCompletionPreview = true;
      }
      const due = await this.plans.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledActivationAt: { lte: referenceTime },
          activationBlockedAt: null,
        },
        select: { id: true, userId: true },
        orderBy: { scheduledActivationAt: 'asc' },
        take: 100,
      });
      for (const candidate of due) {
        try {
          await this.activate(candidate.id, candidate.userId, referenceTime);
        } catch (error) {
          this.logger.error(
            `Scheduled plan activation failed planId=${candidate.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
      if (!this.writer) return;
      for (const candidate of await this.plans.findElapsedFixedPlans(
        referenceTime,
      )) {
        try {
          await this.completeExpired(
            candidate.id,
            candidate.userId,
            referenceTime,
          );
        } catch (error) {
          this.logger.error(
            `Fixed plan completion failed planId=${candidate.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async completeExpired(
    planId: string,
    userId: string,
    referenceTime: Date,
  ) {
    const completed = await this.prisma.$transaction(
      async (tx) => {
        await acquireHashtextAdvisoryXactLock(tx, userId);
        const [due] = await this.plans.findElapsedFixedPlans(referenceTime, {
          tx,
          planId,
        });
        if (!due || due.userId !== userId) return null;
        const successor = await this.plans.findFirst(
          {
            where: {
              ...scheduledReplacementReservationWhere(userId),
              supersedesPlanId: planId,
              scheduledActivationAt: { lte: referenceTime },
            },
            select: { scheduledActivationAt: true },
          },
          tx,
        );
        if (
          successor?.scheduledActivationAt &&
          !(
            await this.plans.findElapsedFixedPlans(
              successor.scheduledActivationAt,
              { tx, planId },
            )
          ).length
        ) {
          return null;
        }
        return this.completeFixedPlan(planId, userId, tx);
      },
      { timeout: 30_000 },
    );
    if (completed) {
      await completed.afterCommit?.();
      await this.emitWorkoutsChanged(userId, planId, 'plan_complete');
    }
  }

  private completeFixedPlan(
    planId: string,
    userId: string,
    tx: Prisma.TransactionClient,
  ) {
    return this.writer?.completePlan(
      userId,
      planId,
      undefined,
      undefined,
      { source: 'system', reason: 'fixed_plan_expired' },
      { tx, preserveEndDate: true },
    );
  }

  private async activate(
    planId: string,
    userId: string,
    referenceTime = new Date(),
  ): Promise<void> {
    const activated = await this.prisma.$transaction(
      async (tx) => {
        await acquireHashtextAdvisoryXactLock(tx, userId);
        const plan = await this.plans.findUnique(
          {
            where: { id: planId },
            include: { supersedes: true },
          },
          tx,
        );
        if (
          !plan ||
          plan.userId !== userId ||
          plan.status !== 'SCHEDULED' ||
          plan.activationBlockedAt ||
          !plan.scheduledActivationAt ||
          plan.scheduledActivationAt > referenceTime
        ) {
          return false;
        }

        const source = plan.supersedes;
        if (!source || source.userId !== userId) {
          await this.block(tx, plan, 'SOURCE_PLAN_MISSING');
          return false;
        }
        if (source.status === 'CANCELLED' || source.status === 'SUPERSEDED') {
          await this.block(tx, plan, `SOURCE_PLAN_${source.status}`);
          return false;
        }
        if (!['ACTIVE', 'PAUSED', 'COMPLETED'].includes(source.status)) {
          await this.block(tx, plan, `SOURCE_PLAN_${source.status}`);
          return false;
        }

        const competing = await this.plans.findFirst(
          {
            where: {
              userId,
              status: { in: ['ACTIVE', 'PAUSED'] },
              id: { notIn: [plan.id, source.id] },
            },
            select: { id: true },
          },
          tx,
        );
        if (competing) {
          await this.block(tx, plan, 'ANOTHER_ACTIVE_PLAN');
          return false;
        }

        const completedSource =
          this.writer &&
          source.status === 'ACTIVE' &&
          source.planningMode === 'FIXED' &&
          (
            await this.plans.findElapsedFixedPlans(plan.scheduledActivationAt, {
              tx,
              planId: source.id,
            })
          ).length
            ? await this.completeFixedPlan(source.id, userId, tx)
            : undefined;
        const now = new Date();
        if (
          !completedSource &&
          (source.status === 'ACTIVE' || source.status === 'PAUSED')
        ) {
          if (source.planningMode === 'ROLLING') {
            await this.plans.fenceAutomationJobs?.(
              source.id,
              'SUPERSEDED',
              true,
              tx,
            );
          }
          await this.plans.update(
            {
              where: { id: source.id },
              data: { status: 'SUPERSEDED', supersededAt: now },
            },
            tx,
          );
          await this.contexts.supersedeContext({
            userId,
            planId: source.id,
            successorPlanId: plan.id,
            effectiveFrom:
              plan.startDate?.toISOString().slice(0, 10) ??
              plan.scheduledActivationAt.toISOString().slice(0, 10),
            occurredAt: now,
            tx,
          });
        }

        await this.plans.update(
          {
            where: { id: plan.id },
            data: {
              status: 'ACTIVE',
              activatedAt: now,
              pausedAt: null,
              activationBlockedAt: null,
              activationBlockReason: null,
            },
          },
          tx,
        );
        await this.contexts.ensureContext({
          userId,
          planId: plan.id,
          startDate: plan.startDate,
          endDate: plan.endDate,
          status: 'ACTIVE',
          closedAt: null,
          tx,
        });
        return completedSource
          ? {
              completedSourceId: source.id,
              afterCompletion: completedSource.afterCommit,
            }
          : {};
      },
      {
        // Single-user serialization is enforced by acquireHashtextAdvisoryXactLock(tx, userId);
        // ReadCommitted avoids cross-user PostgreSQL SSI 40001 conflicts.
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 30_000,
      },
    );
    if (activated) {
      await activated.afterCompletion?.();
      if (activated.completedSourceId) {
        await this.emitWorkoutsChanged(
          userId,
          activated.completedSourceId,
          'plan_complete',
        );
      }
      await this.emitWorkoutsChanged(
        userId,
        planId,
        'scheduled_plan_activated',
      );
    }
  }

  private async emitWorkoutsChanged(
    userId: string,
    planId: string,
    reason: string,
  ) {
    if (this.events) {
      await this.events
        .emitAsync(
          PLAN_WORKOUTS_CHANGED_EVENT,
          new PlanWorkoutsChangedEvent(userId, reason, [], planId),
        )
        .catch((error) => {
          this.logger.warn(
            `Plan lifecycle event emit failed planId=${planId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }
  }

  private async block(
    tx: Prisma.TransactionClient,
    plan: {
      id: string;
      userId: string;
      title: string;
      supersedesPlanId: string | null;
    },
    reason: string,
  ): Promise<void> {
    const blockedAt = new Date();
    await this.plans.update(
      {
        where: { id: plan.id },
        data: {
          activationBlockedAt: blockedAt,
          activationBlockReason: reason,
        },
      },
      tx,
    );
    const userRow = this.users
      ? await this.users.users(tx).findUnique({
          where: { id: plan.userId },
          select: { preferredLocale: true },
        })
      : null;
    const locale = resolveSupportedLocale(
      userRow ? String(userRow.preferredLocale ?? '') : 'zh',
    );
    const copyByLocale: Record<
      string,
      { title: string; bodyMarkdown: string }
    > = {
      zh: {
        title: '训练计划自动接管未完成',
        bodyMarkdown:
          '计划状态发生变化，系统已停止自动重试。请打开计划，让 AI 教练重新评估后再接管。',
      },
      'zh-hant': {
        title: '訓練計畫自動接管未完成',
        bodyMarkdown:
          '計畫狀態已變更，系統已停止自動重試。請打開計畫，讓 AI 教練重新評估後再接管。',
      },
      ja: {
        title: 'トレーニングプランの自動引き継ぎが完了しませんでした',
        bodyMarkdown:
          'プランの状態が変更されたため、自動再試行を停止しました。プランを開き、AIコーチに再評価させてから引き継いでください。',
      },
      ko: {
        title: '훈련 계획 자동 전환이 완료되지 않았습니다',
        bodyMarkdown:
          '계획 상태가 변경되어 자동 재시도가 중지되었습니다. 계획을 열고 AI 코치에게 다시 평가받은 후 전환해 주세요.',
      },
    };
    const localizedCopy = copyByLocale[locale] ?? {
      title: 'Scheduled training plan activation blocked',
      bodyMarkdown:
        'Your plan state changed and automatic retries have stopped. Open the plan and ask AI Coach to reassess before activating.',
    };
    await this.notifications.ensureNotification(
      {
        userId: plan.userId,
        kind: 'PLAN_ACTIVATION_BLOCKED',
        dedupeKey: `plan-activation-blocked:${plan.id}`,
        title: localizedCopy.title,
        bodyMarkdown: localizedCopy.bodyMarkdown,
        data: {
          planId: plan.id,
          sourcePlanId: plan.supersedesPlanId,
          reason,
        },
      },
      tx,
    );
    this.logger.warn(
      `Scheduled plan activation blocked planId=${plan.id} reason=${reason}`,
    );
  }
}
