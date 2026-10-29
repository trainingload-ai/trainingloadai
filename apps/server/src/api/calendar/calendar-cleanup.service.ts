import { Injectable } from '@nestjs/common';
import type { PrismaClientSlice } from '@/prisma/prisma-db';
import { CalendarSubscriptionRepository } from './persistence/calendar-subscription.repository';

/** 账号删除等跨模块写路径：吊销 ICS token，不把 calendar 表泄漏给调用方。 */
@Injectable()
export class CalendarCleanupService {
  constructor(
    private readonly subscriptions: CalendarSubscriptionRepository,
  ) {}

  deleteAllForUser(
    userId: string,
    tx?: PrismaClientSlice<'calendarSubscription'>,
  ) {
    return this.subscriptions.deleteMany({ where: { userId } }, tx);
  }
}
