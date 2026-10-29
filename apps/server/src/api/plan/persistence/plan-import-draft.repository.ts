import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { planDb, type PlanDb } from './plan-db';

@Injectable()
export class PlanImportDraftRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PlanDb) {
    return planDb(this.prisma, tx);
  }

  findUnique<T extends Prisma.PlanImportDraftFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanImportDraftFindUniqueArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planImportDraft.findUnique(args);
  }

  findFirst<T extends Prisma.PlanImportDraftFindFirstArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanImportDraftFindFirstArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planImportDraft.findFirst(args);
  }

  create<T extends Prisma.PlanImportDraftCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanImportDraftCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planImportDraft.create(args);
  }

  updateMany<T extends Prisma.PlanImportDraftUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanImportDraftUpdateManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planImportDraft.updateMany(args);
  }

  deleteMany<T extends Prisma.PlanImportDraftDeleteManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PlanImportDraftDeleteManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planImportDraft.deleteMany(args);
  }
}
