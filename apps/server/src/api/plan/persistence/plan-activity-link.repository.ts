import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { planDb, type PlanDb } from './plan-db';

@Injectable()
export class PlanActivityLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PlanDb) {
    return planDb(this.prisma, tx);
  }

  findUnique<T extends Prisma.PlanWorkoutActivityLinkFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutActivityLinkFindUniqueArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutActivityLink.findUnique(args);
  }

  findFirst<T extends Prisma.PlanWorkoutActivityLinkFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutActivityLinkFindFirstArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutActivityLink.findFirst(args);
  }

  findMany<T extends Prisma.PlanWorkoutActivityLinkFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanWorkoutActivityLinkFindManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutActivityLink.findMany(args);
  }

  create<T extends Prisma.PlanWorkoutActivityLinkCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutActivityLinkCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutActivityLink.create(args);
  }

  update<T extends Prisma.PlanWorkoutActivityLinkUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutActivityLinkUpdateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutActivityLink.update(args);
  }

  updateMany<T extends Prisma.PlanWorkoutActivityLinkUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutActivityLinkUpdateManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutActivityLink.updateMany(args);
  }

  findSteps<T extends Prisma.PlanWorkoutStepFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanWorkoutStepFindManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutStep.findMany(args);
  }

  createSteps<T extends Prisma.PlanWorkoutStepCreateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutStepCreateManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutStep.createMany(args);
  }

  createStep<T extends Prisma.PlanWorkoutStepCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutStepCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutStep.create(args);
  }

  deleteSteps<T extends Prisma.PlanWorkoutStepDeleteManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanWorkoutStepDeleteManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutStep.deleteMany(args);
  }

  findMapping<T extends Prisma.PlanWorkoutExternalMappingFindFirstArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanWorkoutExternalMappingFindFirstArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutExternalMapping.findFirst(args);
  }

  findMappingUnique<T extends Prisma.PlanWorkoutExternalMappingFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutExternalMappingFindUniqueArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutExternalMapping.findUnique(args);
  }

  findMappings<T extends Prisma.PlanWorkoutExternalMappingFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanWorkoutExternalMappingFindManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutExternalMapping.findMany(args);
  }

  updateMapping<T extends Prisma.PlanWorkoutExternalMappingUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutExternalMappingUpdateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutExternalMapping.update(args);
  }

  updateManyMappings<
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

  upsertMapping<T extends Prisma.PlanWorkoutExternalMappingUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutExternalMappingUpsertArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutExternalMapping.upsert(args);
  }

  createMapping<T extends Prisma.PlanWorkoutExternalMappingCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanWorkoutExternalMappingCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planWorkoutExternalMapping.create(args);
  }
}
