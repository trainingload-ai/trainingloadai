import type { PrismaService } from '@/prisma/prisma.service';
import type { PrismaTx } from '@/prisma/prisma-db';

export type PlanDb = PrismaTx;

export function planDb(prisma: PrismaService, tx?: PlanDb): PrismaService {
  return (tx ?? prisma) as PrismaService;
}
