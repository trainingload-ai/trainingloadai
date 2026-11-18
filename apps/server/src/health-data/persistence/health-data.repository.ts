import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { acquireHashtextAdvisoryXactLock } from '@/prisma/hashtext-advisory-lock';
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

  observations(tx?: PrismaClientSlice<'externalHealthObservation'>) {
    return prismaModel(this.prisma,tx).externalHealthObservation;
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
    options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    return this.prisma.$transaction(fn, options);
  }

  /** Serialize source registration with publication for the same athlete. */
  runDailyPublicationTransaction<T>(userId: string, fn: (tx: PrismaTx) => Promise<T>) {
    return this.runTransaction(async (tx) => {
      await acquireHashtextAdvisoryXactLock(tx, `health-daily-user|${userId}`);
      return fn(tx);
    });
  }

  transaction(operations: Prisma.PrismaPromise<unknown>[]) {
    return this.prisma.$transaction(operations);
  }
}
