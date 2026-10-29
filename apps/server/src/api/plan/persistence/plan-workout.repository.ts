import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { planDb, type PlanDb } from './plan-db';

@Injectable()
export class PlanWorkoutRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PlanDb) {
    return planDb(this.prisma, tx);
  }

  findUnique<T extends Prisma.PlanWorkoutFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutFindUniqueArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkout.findUnique(args);
  }

  findFirst<T extends Prisma.PlanWorkoutFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutFindFirstArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkout.findFirst(args);
  }

  findMany<T extends Prisma.PlanWorkoutFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanWorkoutFindManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkout.findMany(args);
  }

  create<T extends Prisma.PlanWorkoutCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkout.create(args);
  }

  update<T extends Prisma.PlanWorkoutUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutUpdateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkout.update(args);
  }

  delete<T extends Prisma.PlanWorkoutDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutDeleteArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkout.delete(args);
  }

  updateMany<T extends Prisma.PlanWorkoutUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutUpdateManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkout.updateMany(args);
  }

  deleteMany<T extends Prisma.PlanWorkoutDeleteManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanWorkoutDeleteManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkout.deleteMany(args);
  }

  findSteps<T extends Prisma.PlanWorkoutStepFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanWorkoutStepFindManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutStep.findMany(args);
  }

  updateStep<T extends Prisma.PlanWorkoutStepUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutStepUpdateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutStep.update(args);
  }

  updateExternalMappings<
    T extends Prisma.PlanWorkoutExternalMappingUpdateManyArgs,
  >(
    args: Prisma.SelectSubset<
      T,
      Prisma.PlanWorkoutExternalMappingUpdateManyArgs
    >,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutExternalMapping.updateMany(args);
  }

  deleteExercises<T extends Prisma.PlanWorkoutExerciseDeleteManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanWorkoutExerciseDeleteManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutExercise.deleteMany(args);
  }

  createExercise<T extends Prisma.PlanWorkoutExerciseCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutExerciseCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutExercise.create(args);
  }

  createSetGroup<T extends Prisma.PlanWorkoutSetGroupCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutSetGroupCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutSetGroup.create(args);
  }

  findSetGroups<T extends Prisma.PlanWorkoutSetGroupFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanWorkoutSetGroupFindManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutSetGroup.findMany(args);
  }

  async markDoneIfApplicable(
    workoutId: string,
    eventTime: Date | null,
    tx: PlanDb,
  ): Promise<boolean> {
    const workout = await this.findUnique(
      {
        where: { id: workoutId },
        select: {
          status: true,
          plan: { select: { status: true } },
        },
      },
      tx,
    );
    if (!workout) return false;
    const planStatus = workout.plan?.status;
    if (planStatus !== 'ACTIVE' && planStatus !== 'PAUSED') return false;
    if (workout.status !== 'PLANNED' && workout.status !== 'IN_PROGRESS') {
      return false;
    }
    await this.update(
      {
        where: { id: workoutId },
        data: {
          status: 'DONE',
          completedAt: eventTime ?? new Date(),
        },
      },
      tx,
    );
    return true;
  }
}
