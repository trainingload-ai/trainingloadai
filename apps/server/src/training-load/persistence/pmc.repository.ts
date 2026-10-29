import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export type PmcListRangeOptions<
  T extends Prisma.PMCDataSelect = Prisma.PMCDataSelect,
> = {
  orderBy?: 'asc' | 'desc';
  take?: number;
  select?: T;
};

export type PmcDailyUpsertRow = {
  date: Date;
  dailyValue: number;
  ctl: number;
  atl: number;
  tsb: number;
  cyclingValue?: number;
  runningValue?: number;
  swimmingValue?: number;
  otherValue?: number;
  activityCount: number;
  totalDuration: number;
};

export type PmcLoadSums = {
  dailyValue: number;
  runningValue: number;
  cyclingValue: number;
  swimmingValue: number;
};

@Injectable()
export class PmcRepository {
  constructor(private readonly prisma: PrismaService) {}

  findFirst<T extends Prisma.PMCDataFindFirstArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PMCDataFindFirstArgs>,
  ) {
    return this.prisma.pMCData.findFirst(args);
  }

  findMany<T extends Prisma.PMCDataFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PMCDataFindManyArgs>,
  ) {
    return this.prisma.pMCData.findMany(args);
  }

  aggregate<T extends Prisma.PMCDataAggregateArgs>(
    args: Prisma.Subset<T, Prisma.PMCDataAggregateArgs>,
  ) {
    return this.prisma.pMCData.aggregate(args);
  }

  upsert<T extends Prisma.PMCDataUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.PMCDataUpsertArgs>,
  ) {
    return this.prisma.pMCData.upsert(args);
  }

  findExtremeFirst<T extends Prisma.PMCExtremeFindFirstArgs>(
    args?: Prisma.SelectSubset<T, Prisma.PMCExtremeFindFirstArgs>,
  ) {
    return this.prisma.pMCExtreme.findFirst(args);
  }

  createExtreme<T extends Prisma.PMCExtremeCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PMCExtremeCreateArgs>,
  ) {
    return this.prisma.pMCExtreme.create(args);
  }

  listRange<T extends Prisma.PMCDataSelect>(
    userId: string,
    start: Date,
    end: Date,
    options?: PmcListRangeOptions<T>,
  ) {
    if (options?.select) {
      return this.prisma.pMCData.findMany({
        where: {
          userId,
          date: { gte: start, lte: end },
        },
        orderBy: { date: options.orderBy ?? 'asc' },
        ...(options.take != null ? { take: options.take } : {}),
        select: options.select,
      });
    }
    return this.prisma.pMCData.findMany({
      where: {
        userId,
        date: { gte: start, lte: end },
      },
      orderBy: { date: options?.orderBy ?? 'asc' },
      ...(options?.take != null ? { take: options.take } : {}),
    });
  }

  async sumLoadBySport(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<PmcLoadSums> {
    const agg = await this.prisma.pMCData.aggregate({
      _sum: {
        dailyValue: true,
        runningValue: true,
        cyclingValue: true,
        swimmingValue: true,
      },
      where: {
        userId,
        date: { gte: start, lte: end },
      },
    });
    return {
      dailyValue: Number(agg._sum.dailyValue ?? 0),
      runningValue: Number(agg._sum.runningValue ?? 0),
      cyclingValue: Number(agg._sum.cyclingValue ?? 0),
      swimmingValue: Number(agg._sum.swimmingValue ?? 0),
    };
  }

  listFitnessWindow(userId: string, start: Date, end: Date) {
    return this.prisma.pMCData.findMany({
      where: {
        userId,
        date: { gte: start, lte: end },
      },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        dailyValue: true,
        CTL: true,
        ATL: true,
        TSB: true,
      },
    });
  }

  listExportRows(userId: string, createdAtLte?: Date) {
    return this.prisma.pMCData.findMany({
      where: {
        userId,
        ...(createdAtLte ? { createdAt: { lte: createdAtLte } } : {}),
      },
      orderBy: { date: 'asc' },
    });
  }

  saveDailySeries(
    userId: string,
    results: PmcDailyUpsertRow[],
    version: string,
  ) {
    const operations = results.map((result) =>
      this.prisma.pMCData.upsert({
        where: {
          userId_date: {
            userId,
            date: result.date,
          },
        },
        update: {
          dailyValue: result.dailyValue,
          CTL: result.ctl,
          ATL: result.atl,
          TSB: result.tsb,
          cyclingValue: result.cyclingValue,
          runningValue: result.runningValue,
          swimmingValue: result.swimmingValue,
          otherValue: result.otherValue,
          activityCount: result.activityCount,
          totalDuration: result.totalDuration,
          version,
          updatedAt: new Date(),
        },
        create: {
          userId,
          date: result.date,
          dailyValue: result.dailyValue,
          CTL: result.ctl,
          ATL: result.atl,
          TSB: result.tsb,
          cyclingValue: result.cyclingValue,
          runningValue: result.runningValue,
          swimmingValue: result.swimmingValue,
          otherValue: result.otherValue,
          activityCount: result.activityCount,
          totalDuration: result.totalDuration,
          version,
        },
      }),
    );
    return this.prisma.$transaction(operations);
  }
}
