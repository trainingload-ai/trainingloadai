import type { PrismaService } from '@/prisma/prisma.service';
import type { PrismaTx } from '@/prisma/prisma-db';

export type CompetitionDb = PrismaTx;

export function competitionDb(
  prisma: PrismaService,
  tx?: CompetitionDb,
): PrismaService {
  return (tx ?? prisma) as PrismaService;
}
