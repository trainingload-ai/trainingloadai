import { Module } from '@nestjs/common';
import { ActivityModule } from '@/api/activity/activity.module';
import { PlanModule } from '@/api/plan/plan.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { PlanTemplateController } from './plan-template.controller';
import { PlanTemplateService } from './plan-template.service';
import { PublicPlanTemplateController } from './public-plan-template.controller';
import { RunningPlanCapabilityService } from './running-plan-capability.service';
import { UserQueryModule } from '@/api/user/user-query.module';
import { CompetitionModule } from '@/api/competition/competition.module';
import { PlanTemplatePreviewRepository } from './persistence/plan-template-preview.repository';

@Module({
  imports: [
    PrismaModule,
    PlanModule,
    ActivityModule,
    UserQueryModule,
    CompetitionModule,
  ],
  controllers: [PublicPlanTemplateController, PlanTemplateController],
  providers: [
    PlanTemplatePreviewRepository,
    PlanTemplateService,
    RunningPlanCapabilityService,
  ],
})
export class PlanTemplateModule {}
