import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUnique<T extends Prisma.NotificationFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationFindUniqueArgs>,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).notification.findUnique(args);
  }

  findMany<T extends Prisma.NotificationFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.NotificationFindManyArgs>,
  ) {
    return this.prisma.notification.findMany(args);
  }

  create<T extends Prisma.NotificationCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationCreateArgs>,
  ) {
    return this.prisma.notification.create(args);
  }

  upsert<T extends Prisma.NotificationUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationUpsertArgs>,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).notification.upsert(args);
  }

  updateMany<T extends Prisma.NotificationUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationUpdateManyArgs>,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.prisma).notification.updateMany(args);
  }

  count<T extends Prisma.NotificationCountArgs>(
    args?: Prisma.Subset<T, Prisma.NotificationCountArgs>,
  ) {
    return this.prisma.notification.count(args);
  }

  transaction(operations: Prisma.PrismaPromise<unknown>[]) {
    return this.prisma.$transaction(operations);
  }
}
