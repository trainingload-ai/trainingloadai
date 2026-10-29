import { Module } from '@nestjs/common';
import { ActivityModule } from '@/api/activity/activity.module';
import { PMCModule } from '@/training-load/pmc.module';
import { PlanModule } from '@/api/plan/plan.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { TrainingInsightQueryService } from './training-insight-query.service';

@Module({
  imports: [ActivityModule, PMCModule, PlanModule, UserQueryModule],
  providers: [TrainingInsightQueryService],
  exports: [TrainingInsightQueryService],
})
export class TrainingInsightModule {}
