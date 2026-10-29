import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class ReviewDigestRepository {
  constructor(private readonly prisma: PrismaService) {}

  digests() {
    return this.prisma.reviewDigest;
  }

  snapshots() {
    return this.prisma.reviewDigestSnapshot;
  }

  totalsBySport() {
    return this.prisma.reviewDigestTotalsBySport;
  }

  highlightActivities() {
    return this.prisma.reviewDigestHighlightActivity;
  }

  transaction(operations: Prisma.PrismaPromise<unknown>[]) {
    return this.prisma.$transaction(operations);
  }
}
