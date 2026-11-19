import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

/** Read the same catalog within a workout authorization/write transaction. */
export function readWorkoutSportDefinitions(
  tx: Prisma.TransactionClient,
  codes: string[],
) {
  return tx.sportDefinition.findMany({
    where: { code: { in: codes } },
    select: { code: true, family: true, defaultWorkoutStructureKind: true },
  });
}

/** Transaction-scoped catalog read used by the standalone maintenance auditor. */
export function readImportSportCatalog(tx: Prisma.TransactionClient) {
  return Promise.all([
    tx.sportDefinition.findMany({
      select: { code: true, family: true, active: true },
    }),
    tx.providerSportMapping.findMany({
      where: { active: true, direction: { in: ['IMPORT', 'BOTH'] } },
    }),
  ]);
}

@Injectable()
export class SportCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSports<T extends Prisma.SportDefinitionFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.SportDefinitionFindManyArgs>,
  ) {
    return this.prisma.sportDefinition.findMany(args);
  }

  findSportUnique<T extends Prisma.SportDefinitionFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.SportDefinitionFindUniqueArgs>,
  ) {
    return this.prisma.sportDefinition.findUnique(args);
  }

  findSportFirst<T extends Prisma.SportDefinitionFindFirstArgs>(
    args?: Prisma.SelectSubset<T, Prisma.SportDefinitionFindFirstArgs>,
  ) {
    return this.prisma.sportDefinition.findFirst(args);
  }

  findMappingFirst<T extends Prisma.ProviderSportMappingFindFirstArgs>(
    args?: Prisma.SelectSubset<T, Prisma.ProviderSportMappingFindFirstArgs>,
  ) {
    return this.prisma.providerSportMapping.findFirst(args);
  }
}
