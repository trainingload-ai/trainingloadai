import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class ExternalOAuthStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  deleteMany<T extends Prisma.ExternalOAuthStateDeleteManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.ExternalOAuthStateDeleteManyArgs>,
  ) {
    return this.prisma.externalOAuthState.deleteMany(args);
  }

  create<T extends Prisma.ExternalOAuthStateCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ExternalOAuthStateCreateArgs>,
  ) {
    return this.prisma.externalOAuthState.create(args);
  }

  findUnique<T extends Prisma.ExternalOAuthStateFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.ExternalOAuthStateFindUniqueArgs>,
  ) {
    return this.prisma.externalOAuthState.findUnique(args);
  }

  updateMany<T extends Prisma.ExternalOAuthStateUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ExternalOAuthStateUpdateManyArgs>,
  ) {
    return this.prisma.externalOAuthState.updateMany(args);
  }
}
