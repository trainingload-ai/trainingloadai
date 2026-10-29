import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { prismaModel, type PrismaClientSlice } from '@/prisma/prisma-db';

@Injectable()
export class ExternalProviderConnectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  connections(tx?: PrismaClientSlice<'externalProviderConnection'>) {
    return prismaModel(this.prisma, tx).externalProviderConnection;
  }
}
