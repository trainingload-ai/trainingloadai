import { PlanProjectionReadModule } from './application/plan-projection-read.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { PlanLinkMatcherService } from './plan-link-matcher.service';
import { PlanSummaryService } from './plan-summary.service';
import { CoachContextService } from './coach-context.service';
import { PlanExecutionContextService } from './plan-execution-context.service';
import { WorkoutModule } from '../workout/workout.module';
import { WorkoutPersistenceService } from './workout-persistence.service';
import { LoadReadoutModule } from '../activity/load-readout.module';
import { UsersModule } from '../user/user.module';
import { OAuthModule } from '@/oauth/oauth.module';
import { CompetitionModule } from '../competition/competition.module';
import { PlanImportDraftService } from './plan-import-draft.service';
import { PlanImportDraftController } from './plan-import-draft.controller';
import { PublicPlanImportDraftController } from './public-plan-import-draft.controller';
import { PlanShareService } from './plan-share.service';
import { PlanShareAuthController } from './plan-share-auth.controller';
import { PublicPlanShareController } from './public-plan-share.controller';
import { PMCModule } from '@/training-load/pmc.module';
import { PlanActivityLinkRepository } from './persistence/plan-activity-link.repository';
import { CoachContextRepository } from './persistence/coach-context.repository';
import { PlanShareRepository } from './persistence/plan-share.repository';
import { PlanImportDraftRepository } from './persistence/plan-import-draft.repository';
import { PlanProposalRepository } from './persistence/plan-proposal.repository';
import { PlanQueryService } from './application/plan-query.service';
import { PlanExternalSyncService } from './application/plan-external-sync.service';
import { PlanLifecycleService } from './application/plan-lifecycle.service';
import { PlanWorkoutCommandService } from './application/plan-workout-command.service';
import { PlanActivityLinkService } from './application/plan-activity-link.service';
import { PlanWriteSupport } from './application/plan-write.support';
import { UserQueryModule } from '../user/user-query.module';
import { PlanWorkoutMutabilityPolicy } from './application/plan-workout-mutability.policy';
import { PlanProposalService } from './application/plan-proposal.service';
import { PlanProposalApplyService } from './application/plan-proposal-apply.service';
import { PlanScheduledActivationWorker } from './application/plan-scheduled-activation.worker';
import { NotificationDomainModule } from '@/notification/notification-domain.module';
import { PlanDeliveryReadService } from './application/plan-delivery-read.service';

/**
 * 计划模块。不要在这里 import ReviewModule。
 * 计划完成后的周期 Runtime 通过 plan.finalized 事件解耦。
 */
@Module({
  imports: [
    PrismaModule,
    PlanProjectionReadModule,
    LoadReadoutModule,
    UsersModule,
    UserQueryModule,
    OAuthModule,
    CompetitionModule,
    WorkoutModule,
    PMCModule,
    NotificationDomainModule,
  ],
  controllers: [
    PlanController,
    PlanImportDraftController,
    PublicPlanImportDraftController,
    PlanShareAuthController,
    PublicPlanShareController,
  ],
  providers: [
    PlanActivityLinkRepository,
    CoachContextRepository,
    PlanShareRepository,
    PlanImportDraftRepository,
    PlanProposalRepository,
    PlanWriteSupport,
    PlanService,
    PlanLifecycleService,
    PlanWorkoutCommandService,
    PlanActivityLinkService,
    PlanQueryService,
    PlanExternalSyncService,
    PlanShareService,
    WorkoutPersistenceService,
    PlanLinkMatcherService,
    PlanSummaryService,
    CoachContextService,
    PlanExecutionContextService,
    PlanWorkoutMutabilityPolicy,
    PlanProposalService,
    PlanProposalApplyService,
    PlanScheduledActivationWorker,
    PlanDeliveryReadService,
    PlanImportDraftService,
  ],
  exports: [
    PlanProjectionReadModule,
    PlanService,
    PlanLifecycleService,
    PlanWorkoutCommandService,
    PlanActivityLinkService,
    PlanQueryService,
    PlanExternalSyncService,
    PlanShareService,
    PlanLinkMatcherService,
    PlanSummaryService,
    CoachContextService,
    PlanExecutionContextService,
    WorkoutPersistenceService,
    PlanProposalService,
    PlanProposalApplyService,
    PlanDeliveryReadService,
  ],
})
export class PlanModule {}
