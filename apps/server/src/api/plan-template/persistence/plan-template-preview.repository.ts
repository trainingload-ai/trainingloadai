import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

type PlanTemplatePreviewDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PlanTemplatePreviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient): PlanTemplatePreviewDb {
    return tx ?? this.prisma;
  }

  create<T extends Prisma.PlanTemplatePreviewCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanTemplatePreviewCreateArgs>,
    tx?: Prisma.TransactionClient,
  ) {
    return this.db(tx).planTemplatePreview.create(args);
  }

  findFirst<T extends Prisma.PlanTemplatePreviewFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanTemplatePreviewFindFirstArgs>,
    tx?: Prisma.TransactionClient,
  ) {
    return this.db(tx).planTemplatePreview.findFirst(args);
  }

  findUnique<T extends Prisma.PlanTemplatePreviewFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanTemplatePreviewFindUniqueArgs>,
    tx?: Prisma.TransactionClient,
  ) {
    return this.db(tx).planTemplatePreview.findUnique(args);
  }

  update<T extends Prisma.PlanTemplatePreviewUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanTemplatePreviewUpdateArgs>,
    tx?: Prisma.TransactionClient,
  ) {
    return this.db(tx).planTemplatePreview.update(args);
  }

  updateMany<T extends Prisma.PlanTemplatePreviewUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlanTemplatePreviewUpdateManyArgs>,
    tx?: Prisma.TransactionClient,
  ) {
    return this.db(tx).planTemplatePreview.updateMany(args);
  }
}
