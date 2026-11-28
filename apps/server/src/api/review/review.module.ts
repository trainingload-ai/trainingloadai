import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ReviewScheduleController } from './review-schedule.controller';
import { ReviewScheduleService } from './review-schedule.service';
import { TimezoneModule } from '@/timezone/timezone.module';

@Module({
  imports: [PrismaModule, TimezoneModule],
  controllers: [ReviewScheduleController],
  providers: [ReviewScheduleService],
})
export class ReviewApiModule {}
