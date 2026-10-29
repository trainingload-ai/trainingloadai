import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { planDb, type PlanDb } from './plan-db';

@Injectable()
export class CoachContextRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PlanDb) {
    return planDb(this.prisma, tx);
  }

  findUnique<T extends Prisma.CoachContextFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.CoachContextFindUniqueArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).coachContext.findUnique(args);
  }

  findFirst<T extends Prisma.CoachContextFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.CoachContextFindFirstArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).coachContext.findFirst(args);
  }

  create<T extends Prisma.CoachContextCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CoachContextCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).coachContext.create(args);
  }

  update<T extends Prisma.CoachContextUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CoachContextUpdateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).coachContext.update(args);
  }

  updateMany<T extends Prisma.CoachContextUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.CoachContextUpdateManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).coachContext.updateMany(args);
  }

  findEvents<T extends Prisma.CoachEventFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.CoachEventFindManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).coachEvent.findMany(args);
  }

  findEventFirst<T extends Prisma.CoachEventFindFirstArgs>(
    args?: Prisma.SelectSubset<T, Prisma.CoachEventFindFirstArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).coachEvent.findFirst(args);
  }

  createEvent<T extends Prisma.CoachEventCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CoachEventCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).coachEvent.create(args);
  }

  /** A workout write makes older proposals for that workout obsolete, including legacy chat drafts. */
  supersedeWorkoutDecisions(
    args: {
      contextId: string;
      workoutId: string;
      eventSeq: number;
      appliedDecisionId?: string | null;
    },
    tx?: PlanDb,
  ) {
    return this.db(tx).coachDecision.updateMany({
      where: {
        contextId: args.contextId,
        state: { in: ['DRAFT', 'PROPOSED', 'APPROVED'] },
        ...(args.appliedDecisionId
          ? { id: { not: args.appliedDecisionId } }
          : {}),
        AND: [
          {
            OR: [
              { baseEventSeq: null },
              { baseEventSeq: { lt: args.eventSeq } },
            ],
          },
          {
            OR: [
              {
                decisionType: {
                  in: [
                    'PLAN_WORKOUT_UPDATE',
                    'PLAN_WORKOUT_POSTPONE',
                    'PLAN_WORKOUT_STATUS',
                  ],
                },
                payload: { path: ['workoutId'], equals: args.workoutId },
              },
              {
                decisionType: 'PLAN_WORKOUT_BATCH_UPDATE',
                payload: {
                  path: ['changes'],
                  array_contains: [{ workoutId: args.workoutId }],
                },
              },
            ],
          },
        ],
      },
      data: { state: 'SUPERSEDED' },
    });
  }

  upsertSummary<T extends Prisma.CoachSummaryUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.CoachSummaryUpsertArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).coachSummary.upsert(args);
  }

  findSummaryUnique<T extends Prisma.CoachSummaryFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.CoachSummaryFindUniqueArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).coachSummary.findUnique(args);
  }
}
