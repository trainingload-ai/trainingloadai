import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  PLAN_WORKOUTS_CHANGED_EVENT,
  PlanWorkoutsChangedEvent,
} from '../events/plan.events';

const RETRY_INTERVAL_MS = 60_000;
const CLAIM_TIMEOUT_MS = 5 * RETRY_INTERVAL_MS;

@Injectable()
export class CalendarAdjustmentSyncWorker {
  private readonly logger = new Logger(CalendarAdjustmentSyncWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  private pending(now: Date): Prisma.PlanProposalPreviewWhereInput {
    return {
      calendarReceipt: { not: Prisma.DbNull },
      calendarSyncSentAt: null,
      OR: [
        { calendarSyncClaimedAt: null },
        {
          calendarSyncClaimedAt: {
            lte: new Date(now.getTime() - CLAIM_TIMEOUT_MS),
          },
        },
      ],
    };
  }

  @Interval(RETRY_INTERVAL_MS)
  async drain() {
    const rows = await this.prisma.planProposalPreview.findMany({
      where: this.pending(new Date()),
      orderBy: { appliedAt: 'asc' },
      select: { id: true, userId: true, sourcePlanId: true },
      take: 25,
    });
    for (const row of rows)
      await this.dispatch(row.id, row.userId, row.sourcePlanId);
  }

  async dispatch(versionId: string, userId: string, planId: string) {
    const now = new Date();
    try {
      const claimed = await this.prisma.planProposalPreview.updateMany({
        where: {
          id: versionId,
          userId,
          sourcePlanId: planId,
          ...this.pending(now),
        },
        data: { calendarSyncClaimedAt: now },
      });
      if (!claimed.count) return;
      try {
        await this.events.emitAsync(
          PLAN_WORKOUTS_CHANGED_EVENT,
          new PlanWorkoutsChangedEvent(
            userId,
            'calendar_adjustment',
            [],
            planId,
            versionId,
          ),
        );
        await this.prisma.planProposalPreview.updateMany({
          where: { id: versionId, calendarSyncClaimedAt: now },
          data: { calendarSyncSentAt: new Date(), calendarSyncClaimedAt: null },
        });
      } catch (error) {
        await this.prisma.planProposalPreview.updateMany({
          where: { id: versionId, calendarSyncClaimedAt: now },
          data: { calendarSyncClaimedAt: null },
        });
        throw error;
      }
    } catch (error) {
      this.logger.warn(
        `Calendar sync will retry for version ${versionId}: ${String(error)}`,
      );
    }
  }
}
