import { Injectable } from '@nestjs/common';
import type { PlanDb } from './plan-db';
import { scheduledReplacementReservationWhere } from './plan.repository';

const calendarInclude = {
  plan: {
    include: {
      supersedes: { select: { userId: true, status: true } },
      supersededBy: {
        select: {
          userId: true,
          status: true,
          startDate: true,
          scheduledActivationAt: true,
          activationBlockedAt: true,
        },
      },
    },
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
        AND: [
          {
            OR: [
              {
                scheduledDate: {
                  in: dates.map((d) => new Date(`${d}T00:00:00Z`)),
                },
              },
              ...(range
                ? [
                    {
                      scheduledDate: {
                        gte: new Date(`${range.from}T00:00:00Z`),
                        lte: new Date(`${range.until}T00:00:00Z`),
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
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
        OR: [
          { status: { in: ['ACTIVE', 'PAUSED'] } },
          scheduledReplacementReservationWhere(userId),
        ],
        ...(excludePlanId ? { id: { not: excludePlanId } } : {}),
      },
      include: calendarInclude.plan.include,
    });
  }
}
