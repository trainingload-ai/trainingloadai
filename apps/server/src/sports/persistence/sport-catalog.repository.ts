import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

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
