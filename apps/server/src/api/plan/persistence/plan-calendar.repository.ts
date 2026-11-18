import { Injectable } from '@nestjs/common';
import type { PlanDb } from './plan-db';

const calendarInclude = {
  plan: {
    include: { supersededBy: { select: { status: true, startDate: true } } },
  },
} as const;

@Injectable()
export class PlanCalendarRepository {
  otherWorkouts(
    userId: string,
    planId: string,
    dates: string[],
    range: { from: string; until: string } | undefined,
    tx: PlanDb,
  ) {
    return tx.planWorkout.findMany({
      where: {
        userId,
        OR: [{ planId: null }, { planId: { not: planId } }],
        scheduledDate: range
          ? {
              gte: new Date(`${range.from}T00:00:00Z`),
              lte: new Date(`${range.until}T00:00:00Z`),
            }
          : { in: dates.map((d) => new Date(`${d}T00:00:00Z`)) },
      },
      include: calendarInclude,
    });
  }
  changedDates(userId: string, ids: string[], tx: PlanDb) {
    return tx.planWorkout.findMany({
      where: { userId, id: { in: ids } },
      select: { scheduledDate: true },
    });
  }
  workoutsOnDates(userId: string, dates: string[], tx: PlanDb) {
    return tx.planWorkout.findMany({
      where: {
        userId,
        scheduledDate: { in: dates.map((d) => new Date(`${d}T00:00:00Z`)) },
      },
      include: calendarInclude,
    });
  }
  activePlans(userId: string, excludePlanId: string | undefined, tx: PlanDb) {
    return tx.plan.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'PAUSED', 'SCHEDULED'] },
        ...(excludePlanId ? { id: { not: excludePlanId } } : {}),
      },
      include: { supersededBy: { select: { status: true, startDate: true } } },
    });
  }
}
