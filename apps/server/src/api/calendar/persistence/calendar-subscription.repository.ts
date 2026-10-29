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

  findFirst<T extends Prisma.CalendarSubscriptionFindFirstArgs>(
    args?: Prisma.SelectSubset<T, Prisma.CalendarSubscriptionFindFirstArgs>,
  ) {
    return this.db().findFirst(args);
  }

  findUnique<T extends Prisma.CalendarSubscriptionFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.CalendarSubscriptionFindUniqueArgs>,
  ) {
    return this.db().findUnique(args);
  }

  create<T extends Prisma.CalendarSubscriptionCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CalendarSubscriptionCreateArgs>,
  ) {
    return this.db().create(args);
  }

  update<T extends Prisma.CalendarSubscriptionUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CalendarSubscriptionUpdateArgs>,
  ) {
    return this.db().update(args);
  }

  updateMany<T extends Prisma.CalendarSubscriptionUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.CalendarSubscriptionUpdateManyArgs>,
  ) {
    return this.db().updateMany(args);
  }

  deleteMany<T extends Prisma.CalendarSubscriptionDeleteManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.CalendarSubscriptionDeleteManyArgs>,
    tx?: PrismaClientSlice<'calendarSubscription'>,
  ) {
    return this.db(tx).deleteMany(args);
  }
}
