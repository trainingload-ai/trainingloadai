import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { CalendarCleanupService } from './calendar-cleanup.service';
import { CalendarSubscriptionRepository } from './persistence/calendar-subscription.repository';

/**
 * 日历订阅的跨模块写入口。不 import PlanModule，避免 Users → Calendar → Plan → Users 环。
 */
@Module({
  imports: [PrismaModule],
  providers: [CalendarSubscriptionRepository, CalendarCleanupService],
  exports: [CalendarSubscriptionRepository, CalendarCleanupService],
})
export class CalendarCleanupModule {}
