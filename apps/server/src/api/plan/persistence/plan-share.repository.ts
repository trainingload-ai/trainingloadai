import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { planDb, type PlanDb } from './plan-db';

@Injectable()
export class PlanShareRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PlanDb) {
    return planDb(this.prisma, tx);
  }

  findShare<T extends Prisma.PlanShareFindFirstArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanShareFindFirstArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planShare.findFirst(args);
  }

  findShareUnique<T extends Prisma.PlanShareFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanShareFindUniqueArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planShare.findUnique(args);
  }

  findShares<T extends Prisma.PlanShareFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanShareFindManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planShare.findMany(args);
  }

  createShare<T extends Prisma.PlanShareCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanShareCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planShare.create(args);
  }

  updateShareMany<T extends Prisma.PlanShareUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanShareUpdateManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planShare.updateMany(args);
  }

  updateShare<T extends Prisma.PlanShareUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanShareUpdateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planShare.update(args);
  }

  findLineageUnique<T extends Prisma.PlanShareLineageFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanShareLineageFindUniqueArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planShareLineage.findUnique(args);
  }

  findLineageFirst<T extends Prisma.PlanShareLineageFindFirstArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanShareLineageFindFirstArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planShareLineage.findFirst(args);
  }

  findLineages<T extends Prisma.PlanShareLineageFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanShareLineageFindManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planShareLineage.findMany(args);
  }

  createLineage<T extends Prisma.PlanShareLineageCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanShareLineageCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planShareLineage.create(args);
  }

  updateLineage<T extends Prisma.PlanShareLineageUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanShareLineageUpdateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planShareLineage.update(args);
  }
}
