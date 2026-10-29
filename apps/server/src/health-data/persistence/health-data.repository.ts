import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  prismaModel,
  type PrismaClientSlice,
  type PrismaTx,
} from '@/prisma/prisma-db';

@Injectable()
export class HealthDataRepository {
  constructor(private readonly prisma: PrismaService) {}

  dailyMetrics(tx?: PrismaClientSlice<'userDailyHealthMetric'>) {
    return prismaModel(this.prisma, tx).userDailyHealthMetric;
  }

  samples(tx?: PrismaClientSlice<'externalHealthSample'>) {
    return prismaModel(this.prisma, tx).externalHealthSample;
  }

  providerSessions(tx?: PrismaClientSlice<'externalHealthSession'>) {
    return prismaModel(this.prisma, tx).externalHealthSession;
  }

  providerSegments(tx?: PrismaClientSlice<'externalHealthSessionSegment'>) {
    return prismaModel(this.prisma, tx).externalHealthSessionSegment;
  }

  sessions(tx?: PrismaClientSlice<'canonicalHealthSession'>) {
    return prismaModel(this.prisma, tx).canonicalHealthSession;
  }

  snapshots(tx?: PrismaClientSlice<'canonicalHealthSnapshot'>) {
    return prismaModel(this.prisma, tx).canonicalHealthSnapshot;
  }

  seriesFiles(tx?: PrismaClientSlice<'healthSeriesFile'>) {
    return prismaModel(this.prisma, tx).healthSeriesFile;
  }

  runTransaction<T>(
    fn: (tx: PrismaTx) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    return this.prisma.$transaction(fn, options);
  }

  transaction(operations: Prisma.PrismaPromise<unknown>[]) {
    return this.prisma.$transaction(operations);
  }
}
