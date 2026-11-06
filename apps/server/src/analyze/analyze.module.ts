import { Module } from '@nestjs/common';
import { SensorDataModule } from '../sensor/sensor-data.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivityRecomputeExecutorService } from './activity-recompute-executor.service';
import { AnalyzeFitnessOrchestratorService } from './analyze-fitness-orchestrator.service';
import { ActivityRecomputeJobService } from './activity-recompute-job.service';
import { UserFitnessInvalidateListener } from './user-fitness-invalidate.listener';
import { UsersModule } from '../api/user/user.module';
import { AnalyzeCoreModule } from './analyze-core.module';
import { ActivityMetricsModule } from '@/api/activity/activity-metrics.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { LoadReadoutModule } from '@/api/activity/load-readout.module';
import { ActivityDependencyFingerprintService } from './activity-dependency-fingerprint.service';
import { ActivityImpactResolver } from './activity-impact-resolver';
import { ActivityAnalysisLeaseService } from './activity-analysis-lease.service';
import { FitnessTimelineObservationService } from './fitness-timeline-observation.service';
import { ActivityFitnessContextResolverService } from './activity-fitness-context-resolver.service';
import { ChronologicalActivityReplayService } from './chronological-activity-replay.service';
import { ActivityTimelineRepairService } from './activity-timeline-repair.service';
import { PMCModule } from '@/training-load/pmc.module';
import { ImportingJobModule } from '@/importing/importing-job.module';
import { ActivityInputFingerprintService } from './activity-input-fingerprint.service';

@Module({
  imports: [
    SensorDataModule,
    PrismaModule,
    UsersModule,
    UserQueryModule,
    AnalyzeCoreModule,
    ActivityMetricsModule,
    LoadReadoutModule,
    PMCModule,
    ImportingJobModule,
  ],
  controllers: [],
  providers: [
    AnalyzeFitnessOrchestratorService,
    ActivityRecomputeJobService,
    UserFitnessInvalidateListener,
    ActivityRecomputeExecutorService,
    ActivityDependencyFingerprintService,
    ActivityInputFingerprintService,
    ActivityImpactResolver,
    ActivityAnalysisLeaseService,
    FitnessTimelineObservationService,
    ActivityFitnessContextResolverService,
    ChronologicalActivityReplayService,
    ActivityTimelineRepairService,
  ],
  exports: [
    AnalyzeFitnessOrchestratorService,
    ActivityRecomputeJobService,
    ActivityRecomputeExecutorService,
    ChronologicalActivityReplayService,
    ActivityTimelineRepairService,
    AnalyzeCoreModule,
  ],
})
export class AnalyzeModule {}
