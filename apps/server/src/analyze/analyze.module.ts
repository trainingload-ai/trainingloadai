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

@Module({
  imports: [
    SensorDataModule,
    PrismaModule,
    UsersModule,
    UserQueryModule,
    AnalyzeCoreModule,
    ActivityMetricsModule,
  ],
  controllers: [],
  providers: [
    AnalyzeFitnessOrchestratorService,
    ActivityRecomputeJobService,
    UserFitnessInvalidateListener,
    ActivityRecomputeExecutorService,
  ],
  exports: [
    AnalyzeFitnessOrchestratorService,
    ActivityRecomputeJobService,
    ActivityRecomputeExecutorService,
    AnalyzeCoreModule,
  ],
})
export class AnalyzeModule {}
