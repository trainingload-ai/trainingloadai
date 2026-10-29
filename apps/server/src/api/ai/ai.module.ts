import { FitnessCalculationModule } from '@/fitness-calculation/fitness-calculation.module';
import { FitnessAssessmentApplyService } from './fitness-assessment-apply.service';
import { FitnessAssessmentFollowupService } from './fitness-assessment-followup.service';
import { NotificationDomainModule } from '@/notification/notification-domain.module';
import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { PrismaModule } from '@/prisma/prisma.module';
import { ActivityModule } from '../activity/activity.module';
import { UsersModule } from '../user/user.module';
import { CoachToolsService } from './core/coach-tools.service';
import { CoachActionService } from './core/coach-action.service';
import { PaceModule } from '../pace/pace.module';
import { PlanModule } from '../plan/plan.module';
import { PMCModule } from '@/training-load/pmc.module';
import { AiUsageModule } from './ai-usage.module';
import { ReviewDigestQueryModule } from '@/review/review-digest-query.module';
import { AiCoachMutationBootstrap } from './ai-coach-mutation-bootstrap.service';
import { CoachBranchingService } from './coach-branching.service';
import { CoachBranchingController } from './coach-branching.controller';
import { OAuthModule } from '@/oauth/oauth.module';
import { AiPlanExecutionAdviceService } from './ai-plan-execution-advice.service';
import { CompetitionModule } from '../competition/competition.module';
import { WeatherModule } from '@/weather/weather.module';
import { UserQueryModule } from '../user/user-query.module';
import { AiDataConsentModule } from '@/ai-data-consent/ai-data-consent.module';
import { ExternalProviderIntegrationModule } from '@/integrations/external-provider/external-provider-integration.module';
import { WorkoutModule } from '../workout/workout.module';
import { CoachStateContextService } from './coach-state-context.service';
import { CoachRunStore } from './coach-run-store.service';
import { AthleteMemoryModule } from '@/athlete-memory/athlete-memory.module';
import { CoachMemoryExtractionEnqueuer } from './memory/coach-memory-extraction-enqueuer.service';
import { MemoryJudgeService } from './memory/memory-judge.service';
import { AiCoachMemoryExtractionWorker } from './memory/ai-coach-memory-extraction.worker';
import { AthleteStateModule } from '@/athlete-state/athlete-state.module';
import { AthleteStateModelService } from './athlete-state/athlete-state-model.service';
import { CoachAssessmentCaseQueryService } from './athlete-state/coach-assessment-case-query.service';
import { CoachAssessmentCaseService } from './athlete-state/coach-assessment-case.service';
import { CoachAssessmentOrchestratorService } from './athlete-state/coach-assessment-orchestrator.service';
import { CoachAssessmentFollowupService } from './athlete-state/coach-assessment-followup.service';
import { TrainingInsightModule } from '@/training-insights/training-insight.module';
import { CuratedCoachConversationWriterService } from './curated-coach-conversation-writer.service';
import { WEB_EVIDENCE_GATEWAY } from './core/web-evidence.gateway';
import { DeepSeekWebEvidenceAdapter } from './infrastructure/deepseek-web-evidence.adapter';
import { ProviderWebEvidenceAdapter } from './infrastructure/provider-web-evidence.adapter';
import { AiOperationsController } from './ai-operations.controller';
import { ImportingJobModule } from '@/importing/importing-job.module';
import { TrainingDataCoverageQueryService } from './core/training-data-coverage-query.service';
import { TodaySuggestionConstraintProjector } from './today-suggestion/today-suggestion-constraint.projector';
import { TodaySuggestionAgentService } from './today-suggestion/today-suggestion-agent.service';
import { TodaySuggestionDeliveryPolicy } from './today-suggestion/today-suggestion-delivery-policy';
import { TodaySuggestionEngagementService } from './today-suggestion/today-suggestion-engagement.service';
import { TodaySuggestionOrchestratorService } from './today-suggestion/today-suggestion-orchestrator.service';
import { TodaySuggestionWorkoutService } from './today-suggestion/today-suggestion-workout.service';
import { TodaySuggestionReminderService } from './today-suggestion/today-suggestion-reminder.service';
import { TodaySuggestionWorkoutGeneratorService } from './today-suggestion/today-suggestion-workout-generator.service';

@Module({
  imports: [
    PrismaModule,
    FitnessCalculationModule,
    NotificationDomainModule,
    ActivityModule,
    UsersModule,
    UserQueryModule,
    AiDataConsentModule,
    PaceModule,
    PlanModule,
    PMCModule,
    OAuthModule,
    CompetitionModule,
    WeatherModule,
    AiUsageModule,
    ReviewDigestQueryModule,
    ExternalProviderIntegrationModule,
    WorkoutModule,
    AthleteMemoryModule,
    AthleteStateModule,
    TrainingInsightModule,
    ImportingJobModule,
  ],
  controllers: [AiController, CoachBranchingController, AiOperationsController],
  providers: [
    DeepSeekWebEvidenceAdapter,
    ProviderWebEvidenceAdapter,
    {
      provide: WEB_EVIDENCE_GATEWAY,
      useExisting: ProviderWebEvidenceAdapter,
    },
    CoachRunStore,
    TrainingDataCoverageQueryService,
    AiService,
    FitnessAssessmentApplyService,
    FitnessAssessmentFollowupService,
    CoachToolsService,
    CoachActionService,
    AiCoachMutationBootstrap,
    CoachBranchingService,
    CoachStateContextService,
    TodaySuggestionConstraintProjector,
    TodaySuggestionAgentService,
    TodaySuggestionDeliveryPolicy,
    TodaySuggestionEngagementService,
    TodaySuggestionOrchestratorService,
    TodaySuggestionWorkoutService,
    TodaySuggestionWorkoutGeneratorService,
    TodaySuggestionReminderService,
    AiPlanExecutionAdviceService,
    CoachMemoryExtractionEnqueuer,
    MemoryJudgeService,
    AiCoachMemoryExtractionWorker,
    AthleteStateModelService,
    CoachAssessmentCaseQueryService,
    CoachAssessmentCaseService,
    CoachAssessmentOrchestratorService,
    CoachAssessmentFollowupService,
    CuratedCoachConversationWriterService,
  ],
  exports: [
    FitnessAssessmentFollowupService,
    AiService,
    AiUsageModule,
    CoachBranchingService,
    CuratedCoachConversationWriterService,
  ],
})
export class AiModule {}
