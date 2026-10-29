import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class OAuthClientRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUnique<T extends Prisma.oauthClientFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.oauthClientFindUniqueArgs>,
  ) {
    return this.prisma.oauthClient.findUnique(args);
  }

  upsert<T extends Prisma.oauthClientUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.oauthClientUpsertArgs>,
  ) {
    return this.prisma.oauthClient.upsert(args);
  }
}
