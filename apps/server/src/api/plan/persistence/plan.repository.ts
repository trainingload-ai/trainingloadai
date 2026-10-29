import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { planDb, type PlanDb } from './plan-db';

@Injectable()
export class PlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PlanDb) {
    return planDb(this.prisma, tx);
  }

  findUnique<T extends Prisma.PlanFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanFindUniqueArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).plan.findUnique(args);
  }

  findFirst<T extends Prisma.PlanFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanFindFirstArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).plan.findFirst(args);
  }

  findMany<T extends Prisma.PlanFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanFindManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).plan.findMany(args);
  }

  create<T extends Prisma.PlanCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).plan.create(args);
  }

  update<T extends Prisma.PlanUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanUpdateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).plan.update(args);
  }

  delete<T extends Prisma.PlanDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanDeleteArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).plan.delete(args);
  }

  count<T extends Prisma.PlanCountArgs>(
    args?: Prisma.Subset<T, Prisma.PlanCountArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).plan.count(args);
  }

  findActiveForUser<T extends Prisma.PlanSelect>(
    userId: string,
    select?: Prisma.Subset<T, Prisma.PlanSelect>,
    tx?: PlanDb,
  ) {
    if (select) {
      return this.db(tx).plan.findFirst({
        where: { userId, status: 'ACTIVE' },
        select,
      });
    }
    return this.db(tx).plan.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
  }

  countActive() {
    return this.prisma.plan.count({ where: { status: 'ACTIVE' } });
  }

  countCreatedBetween(start: Date, end: Date) {
    return this.prisma.plan.count({
      where: { createdAt: { gte: start, lt: end } },
    });
  }
}
