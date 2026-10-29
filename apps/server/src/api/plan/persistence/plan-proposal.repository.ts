import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { planDb, type PlanDb } from './plan-db';

@Injectable()
export class PlanProposalRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PlanDb) {
    return planDb(this.prisma, tx);
  }

  findUnique<T extends Prisma.PlanProposalPreviewFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanProposalPreviewFindUniqueArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planProposalPreview.findUnique(args);
  }

  create<T extends Prisma.PlanProposalPreviewCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanProposalPreviewCreateArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planProposalPreview.create(args);
  }

  updateMany<T extends Prisma.PlanProposalPreviewUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanProposalPreviewUpdateManyArgs>,
    tx?: PlanDb,
  ) {
    return this.db(tx).planProposalPreview.updateMany(args);
  }
}
