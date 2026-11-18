import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PlanDb } from './plan-db';

export const sourceInclude = {
  workouts: {
    orderBy: [{ dayOffset: 'asc' }, { sessionIndex: 'asc' }, { id: 'asc' }],
    include: {
      steps: {
        where: { parentId: null },
        orderBy: { orderIndex: 'asc' },
        include: { children: { orderBy: { orderIndex: 'asc' } } },
      },
      strengthExercises: {
        orderBy: { orderIndex: 'asc' },
        include: { setGroups: { orderBy: { orderIndex: 'asc' } } },
      },
      links: { where: { unlinkedAt: null } },
    },
  },
} satisfies Prisma.PlanInclude;
export type Source = Prisma.PlanGetPayload<{ include: typeof sourceInclude }>;

@Injectable()
export class PlanStartRepository {
  source(planId: string, tx: PlanDb) {
    return tx.plan.findUnique({
      where: { id: planId },
      include: sourceInclude,
    });
  }
  readback(planId: string, tx: PlanDb) {
    return tx.plan.findUniqueOrThrow({
      where: { id: planId },
      include: sourceInclude,
    });
  }
  appliedStart(userId: string, planId: string, sid: string, tx: PlanDb) {
    return tx.planProposalPreview.findFirst({
      where: {
        userId,
        sourcePlanId: planId,
        mode: 'START',
        appliedAt: { not: null },
        proposal: { path: ['binding', 'sid'], equals: sid },
      },
      select: { id: true },
    });
  }
  calendar(
    userId: string,
    planId: string,
    since: Date,
    until: Date,
    tx: PlanDb,
  ) {
    return tx.planWorkout.findMany({
      where: {
        userId,
        OR: [{ planId: null }, { planId: { not: planId } }],
        scheduledDate: { gte: since, lte: until },
      },
      orderBy: { id: 'asc' },
      select: { id: true, revision: true, status: true, scheduledDate: true },
    });
  }
}
