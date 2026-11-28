import { RollingPlanAutomationService } from './application/rolling-plan-automation.service';
import { RollingPlanAuthorizationService } from './application/rolling-plan-authorization.service';
import { AiDataConsentModule } from '@/ai-data-consent/ai-data-consent.module';
import { RollingPlanService } from './application/rolling-plan.service';
import { PlanCalendarRepository } from './persistence/plan-calendar.repository';
import { HealthDataModule } from '@/health-data/health-data.module';
import { UserAnalysisConfigModule } from '@/api/user/user-analysis-config.module';
import { PlanCalendarValidationService } from './application/plan-calendar-validation.service';
import { PlanStartRepository } from './persistence/plan-start.repository';
import { PlanStartService } from './application/plan-start.service';
import { CalendarAdjustmentSyncWorker } from './application/calendar-adjustment-sync.worker';
import { AthleteStateUpdatesModule } from '@/athlete-state/updates/athlete-state-updates.module';
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
 * The durable cycle-review job keeps ReviewModule outside PlanModule.
 */
@Module({
  imports: [
    AiDataConsentModule,
    AthleteStateUpdatesModule,
    HealthDataModule,
    UserAnalysisConfigModule,
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
    PublicPlanShareController,
  ],
  providers: [
    PlanCalendarRepository,
    PlanCalendarValidationService,
    PlanStartRepository,
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
    RollingPlanAuthorizationService,
    PlanStartService,
    CalendarAdjustmentSyncWorker,
    RollingPlanService,
    RollingPlanAutomationService,
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
    PlanStartService,
    RollingPlanService,
    RollingPlanAutomationService,
    PlanProposalService,
    PlanProposalApplyService,
    PlanDeliveryReadService,
  ],
})
export class PlanModule {}
