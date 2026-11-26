import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { CalendarCleanupService } from './calendar-cleanup.service';
import { CalendarSubscriptionRepository } from './persistence/calendar-subscription.repository';

/** Account deletion still removes legacy calendar subscriptions. */
@Module({
  imports: [PrismaModule],
  providers: [CalendarSubscriptionRepository, CalendarCleanupService],
  exports: [CalendarCleanupService],
})
export class CalendarCleanupModule {}
