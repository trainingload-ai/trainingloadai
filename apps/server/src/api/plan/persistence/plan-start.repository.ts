import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PlanDb } from './plan-db';

export const sourceInclude = {
  supersededBy: { select: { id: true, status: true, startDate: true } },
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
  async source(
    planId: string,
    tx: PlanDb,
    window?: { from: string; to: string },
  ) {
    const scalar = window
      ? await tx.plan.findUnique({
          where: { id: planId },
          select: { planningMode: true },
        })
      : null;
    return tx.plan.findUnique({
      where: { id: planId },
      include:
        scalar?.planningMode === 'ROLLING' && window
          ? {
              ...sourceInclude,
              workouts: {
                ...sourceInclude.workouts,
                where: {
                  scheduledDate: {
                    gte: new Date(window.from),
                    lte: new Date(window.to),
                  },
                },
              },
            }
          : sourceInclude,
    });
  }
  async readback(
    planId: string,
    tx: PlanDb,
    window?: { from: string; to: string },
  ) {
    const plan = await this.source(planId, tx, window);
    if (!plan) throw new Error('Plan readback failed');
    return plan;
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
      select: {
        id: true,
        revision: true,
        status: true,
        scheduledDate: true,
        plannedDurationSeconds: true,
        plannedSessionRpe: true,
        plan: {
          select: {
            status: true,
            startDate: true,
            endDate: true,
            generationMetadata: true,
            supersededBy: { select: { status: true, startDate: true } },
          },
        },
      },
    });
  }
}
