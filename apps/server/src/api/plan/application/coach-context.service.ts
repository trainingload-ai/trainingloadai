import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PlanSummaryService } from './plan-summary.service';
import { CoachContextRepository } from '../persistence/coach-context.repository';
import { PlanRepository } from '../persistence/plan.repository';
import {
  PLAN_COMPLETED_EVENT,
  PLAN_FINALIZED_EVENT,
  PlanCompletedEvent,
  PlanFinalizedEvent,
  type PlanProgressLabel,
} from '../events/plan.events';
import type { PlanDb } from '../persistence/plan-db';

type EventSource = 'ai' | 'manual' | 'system';
type ProgressLabel = PlanProgressLabel;

@Injectable()
export class CoachContextService {
  private readonly logger = new Logger(CoachContextService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly planSummary: PlanSummaryService,
    private readonly contexts: CoachContextRepository,
    private readonly plans: PlanRepository,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async ensureContext(args: {
    userId: string;
    planId: string;
    tx?: PlanDb;
    startDate?: Date | null;
    endDate?: Date | null;
    status?: 'SCHEDULED' | 'ACTIVE' | 'SUPERSEDED' | 'FINALIZED' | 'ARCHIVED';
    closedAt?: Date | null;
  }) {
    const existing = await this.contexts.findUnique(
      { where: { planId: args.planId } },
      args.tx,
    );

    if (!existing) {
      return this.contexts.create(
        {
          data: {
            userId: args.userId,
            planId: args.planId,
            status: args.status ?? 'ACTIVE',
            startDate: args.startDate ?? null,
            endDate: args.endDate ?? null,
            closedAt: args.closedAt ?? null,
          },
        },
        args.tx,
      );
    }

    const patch: Record<string, unknown> = {};
    if (args.startDate && !existing.startDate) patch.startDate = args.startDate;
    if (args.endDate) patch.endDate = args.endDate;
    if (args.status && existing.status !== args.status) {
      patch.status = args.status;
    }
    if (args.closedAt !== undefined) patch.closedAt = args.closedAt;

    if (Object.keys(patch).length === 0) return existing;

    return this.contexts.update(
      { where: { id: existing.id }, data: patch },
      args.tx,
    );
  }

  private async nextEventSeq(contextId: string, tx?: PlanDb) {
    const last = await this.contexts.findEventFirst(
      {
        where: { contextId },
        select: { seq: true },
        orderBy: { seq: 'desc' },
      },
      tx,
    );
    return (Number(last?.seq ?? 0) || 0) + 1;
  }

  async appendEvent(args: {
    userId: string;
    planId: string;
    type:
      | 'WORKOUT_COMPLETED'
      | 'WORKOUT_LINKED'
      | 'INCIDENT_REPORTED'
      | 'ADAPTATION_APPLIED'
      | 'REVIEW_DAILY'
      | 'REVIEW_WEEKLY'
      | 'REVIEW_MONTHLY'
      | 'CONTEXT_FINALIZED'
      | 'CONTEXT_SUPERSEDED';
    payload?: unknown;
    source?: EventSource;
    dedupeKey?: string;
    occurredAt?: Date;
    decisionId?: string | null;
    branchId?: string | null;
    commitId?: string | null;
    tx?: PlanDb;
  }) {
    const context = await this.ensureContext({
      userId: args.userId,
      planId: args.planId,
      tx: args.tx,
    });
    const payload = (args.payload ?? {}) as Prisma.InputJsonValue;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const seq = await this.nextEventSeq(context.id, args.tx);
      try {
        const event = await this.contexts.createEvent(
          {
            data: {
              contextId: context.id,
              seq,
              type: args.type,
              payload,
              source: args.source ?? 'system',
              dedupeKey: args.dedupeKey ?? null,
              occurredAt: args.occurredAt ?? new Date(),
              decisionId: args.decisionId ?? null,
              branchId: args.branchId ?? null,
              commitId: args.commitId ?? null,
            },
          },
          args.tx,
        );
        await this.contexts.updateMany(
          {
            where: { id: context.id, headEventSeq: { lt: seq } },
            data: { headEventSeq: seq },
          },
          args.tx,
        );
        const change = args.payload as
          | {
              workoutId?: unknown;
              decisionId?: unknown;
            }
          | undefined;
        if (
          args.type === 'ADAPTATION_APPLIED' &&
          typeof change?.workoutId === 'string' &&
          change.workoutId
        ) {
          // The workout and its obsolete proposals share the writer's transaction.
          // Do not claim these were applied: only the actual applying decision gets APPLIED.
          await this.contexts.supersedeWorkoutDecisions(
            {
              contextId: context.id,
              workoutId: change.workoutId,
              eventSeq: seq,
              appliedDecisionId:
                args.decisionId ??
                (typeof change.decisionId === 'string'
                  ? change.decisionId
                  : null),
            },
            args.tx,
          );
        }
        return event;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const mayConflict =
          msg.includes('t_coach_event_context_id_seq_key') ||
          msg.includes('Unique constraint failed');
        if (!mayConflict || attempt >= 2) throw error;
      }
    }

    return null;
  }

  private toProgressLabel(args: {
    completionRate: number;
    complianceRate: number | null;
  }): ProgressLabel {
    const completion = Number(args.completionRate || 0);
    const compliance =
      typeof args.complianceRate === 'number' ? args.complianceRate : null;

    if (completion >= 80 && (compliance == null || compliance >= 90)) {
      return 'UP';
    }
    if (completion < 50 || (compliance != null && compliance < 70)) {
      return 'DOWN';
    }
    return 'STABLE';
  }

  async supersedeContext(args: {
    userId: string;
    planId: string;
    successorPlanId: string;
    effectiveFrom: string;
    source?: EventSource;
    occurredAt?: Date;
    decisionId?: string | null;
    branchId?: string | null;
    tx?: PlanDb;
  }) {
    const occurredAt = args.occurredAt ?? new Date();
    const context = await this.ensureContext({
      userId: args.userId,
      planId: args.planId,
      tx: args.tx,
      status: 'SUPERSEDED',
      closedAt: occurredAt,
    });
    await this.appendEvent({
      userId: args.userId,
      planId: args.planId,
      type: 'CONTEXT_SUPERSEDED',
      source: args.source ?? 'system',
      occurredAt,
      decisionId: args.decisionId ?? null,
      branchId: args.branchId ?? null,
      payload: {
        successorPlanId: args.successorPlanId,
        effectiveFrom: args.effectiveFrom,
      },
      tx: args.tx,
    });
    return context;
  }

  async finalizeContext(args: {
    userId: string;
    planId: string;
    planStatus: 'COMPLETED' | 'CANCELLED';
    source?: EventSource;
    occurredAt?: Date;
    reason?: string | null;
    tx?: PlanDb;
  }) {
    const context = await this.ensureContext({
      userId: args.userId,
      planId: args.planId,
      tx: args.tx,
      status: 'FINALIZED',
      closedAt: args.occurredAt ?? new Date(),
    });

    const plan = await this.plans.findUnique(
      {
        where: { id: args.planId },
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
          goal: true,
        },
      },
      args.tx,
    );
    if (!plan) {
      this.logger.warn(
        `[finalizeContext] plan missing userId=${args.userId} planId=${args.planId}`,
      );
      return null;
    }

    const summary = await this.planSummary.summarize(args.userId, args.planId);
    const progressLabel = this.toProgressLabel({
      completionRate: summary.totals.completionRate,
      complianceRate: summary.totals.complianceRate,
    });
    const adherenceScore = Number(summary.totals.completionRate || 0);

    const markdownLines = [
      `- planId: ${args.planId}`,
      `- status: ${args.planStatus}`,
      `- completionRate: ${summary.totals.completionRate}%`,
      `- complianceRate: ${
        summary.totals.complianceRate == null
          ? 'n/a'
          : `${summary.totals.complianceRate}%`
      }`,
      `- progress: ${progressLabel}`,
    ];

    await this.contexts.upsertSummary(
      {
        where: { contextId: context.id },
        create: {
          contextId: context.id,
          userId: args.userId,
          planId: args.planId,
          periodStart: plan.startDate ?? null,
          periodEnd: plan.endDate ?? null,
          adherenceScore,
          progressLabel,
          keyDrivers: {
            completionRate: summary.totals.completionRate,
            complianceRate: summary.totals.complianceRate,
            doneCount: summary.totals.doneCount,
            workoutCount: summary.totals.workoutCount,
          },
          riskFlags: {
            skippedCount: summary.totals.skippedCount,
            movedCount: summary.totals.movedCount,
          },
          nextCycleSuggestion: {
            suggestedProgressLabel: progressLabel,
          },
          markdown: markdownLines.join('\n'),
        },
        update: {
          periodStart: plan.startDate ?? null,
          periodEnd: plan.endDate ?? null,
          adherenceScore,
          progressLabel,
          keyDrivers: {
            completionRate: summary.totals.completionRate,
            complianceRate: summary.totals.complianceRate,
            doneCount: summary.totals.doneCount,
            workoutCount: summary.totals.workoutCount,
          },
          riskFlags: {
            skippedCount: summary.totals.skippedCount,
            movedCount: summary.totals.movedCount,
          },
          nextCycleSuggestion: {
            suggestedProgressLabel: progressLabel,
          },
          markdown: markdownLines.join('\n'),
        },
      },
      args.tx,
    );

    await this.appendEvent({
      userId: args.userId,
      planId: args.planId,
      type: 'CONTEXT_FINALIZED',
      source: args.source ?? 'system',
      occurredAt: args.occurredAt ?? new Date(),
      payload: {
        status: args.planStatus,
        completionRate: summary.totals.completionRate,
        complianceRate: summary.totals.complianceRate,
        progressLabel,
        reason: args.reason ?? null,
      },
      tx: args.tx,
    });

    await this.ensureContext({
      userId: args.userId,
      planId: args.planId,
      tx: args.tx,
      status: 'FINALIZED',
      closedAt: args.occurredAt ?? new Date(),
    });

    const afterCommit = () =>
      this.emitAfterFinalize({
        userId: args.userId,
        planId: args.planId,
        planStatus: args.planStatus,
        planTitle: plan.title,
        periodStart: plan.startDate,
        periodEnd: plan.endDate,
        summary,
        progressLabel,
      });
    if (!args.tx) await afterCommit();

    return {
      progressLabel,
      adherenceScore,
      afterCommit: args.tx ? afterCommit : undefined,
    };
  }

  private async emitAfterFinalize(args: {
    userId: string;
    planId: string;
    planStatus: 'COMPLETED' | 'CANCELLED';
    planTitle: string;
    periodStart: Date | null;
    periodEnd: Date | null;
    summary: {
      totals: {
        completionRate: number;
        complianceRate: number | null;
        doneCount: number;
        workoutCount: number;
        skippedCount: number;
        movedCount: number;
      };
    };
    progressLabel: ProgressLabel;
  }) {
    if (!this.events) return;
    try {
      await this.events.emitAsync(
        PLAN_FINALIZED_EVENT,
        new PlanFinalizedEvent(args.userId, args.planId, args.planStatus),
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[finalizeContext] plan.finalized listeners failed userId=${args.userId} planId=${args.planId}: ${msg}`,
      );
    }

    if (args.planStatus !== 'COMPLETED') return;
    try {
      await this.events.emitAsync(
        PLAN_COMPLETED_EVENT,
        new PlanCompletedEvent(
          args.userId,
          args.planId,
          args.planTitle,
          args.periodStart,
          args.periodEnd,
          args.summary.totals.completionRate,
          args.summary.totals.complianceRate,
          args.summary.totals.doneCount,
          args.summary.totals.workoutCount,
          args.summary.totals.skippedCount,
          args.summary.totals.movedCount,
          args.progressLabel,
        ),
      );
    } catch (error) {
      this.logger.error(
        `[finalizeContext] plan.completed listeners failed userId=${args.userId} planId=${args.planId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
