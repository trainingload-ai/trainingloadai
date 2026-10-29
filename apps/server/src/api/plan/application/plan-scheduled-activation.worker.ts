import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { CoachContextService } from './coach-context.service';
import { PlanRepository } from '../persistence/plan.repository';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';

const ACTIVATION_POLL_MS = 60_000;

@Injectable()
export class PlanScheduledActivationWorker {
  private readonly logger = new Logger(PlanScheduledActivationWorker.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanRepository,
    private readonly contexts: CoachContextService,
    private readonly notifications: NotificationDomainService,
  ) {}

  @Interval(ACTIVATION_POLL_MS)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.plans.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledActivationAt: { lte: new Date() },
          activationBlockedAt: null,
        },
        select: { id: true, userId: true },
        orderBy: { scheduledActivationAt: 'asc' },
        take: 100,
      });
      for (const candidate of due) {
        try {
          await this.activate(candidate.id, candidate.userId);
        } catch (error) {
          this.logger.error(
            `Scheduled plan activation failed planId=${candidate.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async activate(planId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(
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
          plan.scheduledActivationAt.getTime() > Date.now()
        ) {
          return;
        }

        const source = plan.supersedes;
        if (!source || source.userId !== userId) {
          await this.block(tx, plan, 'SOURCE_PLAN_MISSING');
          return;
        }
        if (source.status === 'CANCELLED' || source.status === 'SUPERSEDED') {
          await this.block(tx, plan, `SOURCE_PLAN_${source.status}`);
          return;
        }
        if (!['ACTIVE', 'PAUSED', 'COMPLETED'].includes(source.status)) {
          await this.block(tx, plan, `SOURCE_PLAN_${source.status}`);
          return;
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
          return;
        }

        const now = new Date();
        if (source.status === 'ACTIVE' || source.status === 'PAUSED') {
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
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30_000,
      },
    );
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
    await this.notifications.ensureNotification(
      {
        userId: plan.userId,
        kind: 'PLAN_ACTIVATION_BLOCKED',
        dedupeKey: `plan-activation-blocked:${plan.id}`,
        title: '训练计划自动接管未完成',
        bodyMarkdown:
          '计划状态发生变化，系统已停止自动重试。请打开计划，让 AI 教练重新评估后再接管。',
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
