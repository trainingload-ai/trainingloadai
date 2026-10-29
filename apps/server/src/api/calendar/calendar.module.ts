import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { PlanModule } from '@/api/plan/plan.module';
import { CompetitionModule } from '@/api/competition/competition.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CalendarCleanupModule } from './calendar-cleanup.module';
import { CalendarAccountDeletionListener } from './calendar-account-deletion.listener';

@Module({
  imports: [PrismaModule, PlanModule, CompetitionModule, CalendarCleanupModule],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarAccountDeletionListener],
})
export class CalendarModule {}
