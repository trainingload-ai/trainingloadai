import { Module } from '@nestjs/common';
import { AnalyzeCoreModule } from '@/analyze/analyze-core.module';
import { HeartRateModule } from '@/heart-rate/heart-rate.module';
import { PowerModule } from '@/power/power.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { SensorDataModule } from '@/sensor/sensor-data.module';
import { UsersModule } from '@/api/user/user.module';
import { ActivityMetricsPipelineService } from './metrics/activity-metrics-pipeline.service';
import { ActivityMetricsOrchestratorService } from './metrics/orchestrator.service';
import { ActivityMetricsPreloaderService } from './metrics/preloader.service';
import { ActivityPeakMetricWriterService } from './metrics/shared/peak-metric-writer.service';
import { ActivityPerformanceTTWriterService } from './metrics/shared/performance-tt-writer.service';
import { BindFitnessMetricsTask } from './metrics/tasks/bind-fitness-metrics.task';
import { CalculatedPowerSummaryTask } from './metrics/tasks/calculated-power-summary.task';
import { CaloriesTask } from './metrics/tasks/calories.task';
import { DerivedMetricsTask } from './metrics/tasks/derived-metrics.task';
import { EstimatedPowerMetricsTask } from './metrics/tasks/estimated-power-metrics.task';
import { HeartRateBaseTask } from './metrics/tasks/heart-rate-base.task';
import { HeartRateTrimpTask } from './metrics/tasks/heart-rate-trimp.task';
import { HeartRateZonesTask } from './metrics/tasks/heart-rate-zones.task';
import { MaxMeanHeartRateTask } from './metrics/tasks/max-mean-heart-rate.task';
import { MaxMeanPowerTask } from './metrics/tasks/max-mean-power.task';
import { PaceBaseTask } from './metrics/tasks/pace-base.task';
import { PaceGovssTask } from './metrics/tasks/pace-govss.task';
import { PaceZonesTask } from './metrics/tasks/pace-zones.task';
import { PeakPaceTask } from './metrics/tasks/peak-pace.task';
import { PowerBaseTask } from './metrics/tasks/power-base.task';
import { PowerCogganBikeTask } from './metrics/tasks/power-coggan-bike.task';
import { PowerZonesTask } from './metrics/tasks/power-zones.task';
import { RecordsBootstrapTask } from './metrics/tasks/records-bootstrap.task';
import { TrainingEffectTask } from './metrics/tasks/training-effect.task';
import { Vo2MaxTask } from './metrics/tasks/vo2max.task';
import { SwimScoreTask } from './metrics/tasks/swim-score.task';
import { LthrObservationTask } from './metrics/tasks/lthr-observation.task';
import { ActivityStatisticsTask } from './metrics/tasks/activity-statistics.task';

const METRICS_TASKS = [
  BindFitnessMetricsTask,
  CalculatedPowerSummaryTask,
  CaloriesTask,
  DerivedMetricsTask,
  EstimatedPowerMetricsTask,
  HeartRateBaseTask,
  HeartRateTrimpTask,
  HeartRateZonesTask,
  MaxMeanHeartRateTask,
  MaxMeanPowerTask,
  PaceBaseTask,
  PaceGovssTask,
  PaceZonesTask,
  PeakPaceTask,
  PowerBaseTask,
  PowerCogganBikeTask,
  PowerZonesTask,
  RecordsBootstrapTask,
  TrainingEffectTask,
  SwimScoreTask,
  LthrObservationTask,
  ActivityStatisticsTask,
  Vo2MaxTask,
];

/** Activity metrics 的内部实现模块，仅导出窄 pipeline 入口。 */
@Module({
  imports: [
    AnalyzeCoreModule,
    HeartRateModule,
    PowerModule,
    PrismaModule,
    SensorDataModule,
    UsersModule,
  ],
  providers: [
    ActivityMetricsPipelineService,
    ActivityMetricsOrchestratorService,
    ActivityMetricsPreloaderService,
    ActivityPeakMetricWriterService,
    ActivityPerformanceTTWriterService,
    ...METRICS_TASKS,
  ],
  exports: [ActivityMetricsPipelineService],
})
export class ActivityMetricsModule {}
