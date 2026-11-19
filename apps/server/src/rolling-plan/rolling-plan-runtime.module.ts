import { Module } from '@nestjs/common';
import { PlanModule } from '@/api/plan/plan.module';
import { AiModule } from '@/api/ai/ai.module';
import { ReviewModule } from '@/review/review.module';
import { NotificationDomainModule } from '@/notification/notification-domain.module';
import { RollingPlanRuntimeService } from './rolling-plan-runtime.service';
import { RollingPlanCandidateService } from './rolling-plan-candidate.service';

@Module({
  imports: [PlanModule, AiModule, ReviewModule, NotificationDomainModule],
  providers: [RollingPlanCandidateService, RollingPlanRuntimeService],
  exports: [RollingPlanRuntimeService],
})
export class RollingPlanRuntimeModule {}
