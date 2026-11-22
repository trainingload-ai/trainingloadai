import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { prismaModel, type PrismaClientSlice } from '@/prisma/prisma-db';

@Injectable()
export class CalendarSubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaClientSlice<'calendarSubscription'>) {
    return prismaModel(this.prisma, tx).calendarSubscription;
  }

  deleteMany<T extends Prisma.CalendarSubscriptionDeleteManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.CalendarSubscriptionDeleteManyArgs>,
    tx?: PrismaClientSlice<'calendarSubscription'>,
  ) {
    return this.db(tx).deleteMany(args);
  }
}
