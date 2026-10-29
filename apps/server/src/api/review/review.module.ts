import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ReviewScheduleController } from './review-schedule.controller';
import { ReviewScheduleService } from './review-schedule.service';
import { UserQueryModule } from '@/api/user/user-query.module';

@Module({
  imports: [PrismaModule, UserQueryModule],
  controllers: [ReviewScheduleController],
  providers: [ReviewScheduleService],
})
export class ReviewApiModule {}
