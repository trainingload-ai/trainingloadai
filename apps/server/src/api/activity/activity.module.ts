import { Module } from '@nestjs/common';
import { PlanModule } from '@/api/plan/plan.module';
import { ActivityController } from './activity.controller';
import { ActivityTimelineController } from './activity-timeline.controller';
import { ActivityImportDraftService } from './activity-import-draft.service';
import { ActivityService } from './activity.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../../storage/storage.module';
import { SensorDataModule } from '../../sensor/sensor-data.module';
import { PowerModule } from '@/power/power.module';
import { HeartRateModule } from '@/heart-rate/heart-rate.module';
import { AnalyzeModule } from '@/analyze/analyze.module';
import { PMCModule } from '@/training-load/pmc.module';
import { UsersModule } from '../user/user.module';
import { PaceModule } from '../pace/pace.module';
import { ImportingModule } from '@/importing';
import { ActivityAiReviewModule } from './activity-ai-review.module';
import { AiUsageModule } from '../ai/ai-usage.module';
import { ActivityMapThumbJobService } from './activity-map-thumb-job.service';
import { LoadReadoutModule } from './load-readout.module';
import { TimezoneModule } from '@/timezone/timezone.module';
import { OAuthModule } from '@/oauth/oauth.module';
import { StrengthActivityService } from './strength-activity.service';
import { ActivityMetricsModule } from './activity-metrics.module';
import { ActivityMapDerivationService } from './activity-map-derivation.service';
import { ActivityQueryService } from './activity-query.service';
import { UserQueryModule } from '@/api/user/user-query.module';
import { RunningPlanBaselineQueryService } from './running-plan-baseline-query.service';
import { WeatherModule } from '@/weather/weather.module';
import { ActivitySeriesQueryService } from './activity-series-query.service';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    SensorDataModule,
    PowerModule,
    AnalyzeModule,
    ActivityMetricsModule,
    HeartRateModule,
    PMCModule,
    UsersModule,
    UserQueryModule,
    PaceModule,
    ImportingModule,
    PlanModule,
    LoadReadoutModule,
    TimezoneModule,
    OAuthModule,
    AiUsageModule,
    ActivityAiReviewModule,
    WeatherModule,
  ],
  // 静态 /activities/timeline 必须先于旧的 /activities/:hashId 动态路由注册。
  controllers: [ActivityTimelineController, ActivityController],
  providers: [
    ActivitySeriesQueryService,
    ActivityService,
    ActivityImportDraftService,
    ActivityMapThumbJobService,
    ActivityMapDerivationService,
    ActivityQueryService,
    StrengthActivityService,
    RunningPlanBaselineQueryService,
  ],
  exports: [
    ActivitySeriesQueryService,
    ActivityService,
    ActivityImportDraftService,
    ActivityAiReviewModule,
    ActivityMapThumbJobService,
    ActivityMapDerivationService,
    ActivityQueryService,
    StrengthActivityService,
    RunningPlanBaselineQueryService,
    LoadReadoutModule,
  ],
})
export class ActivityModule {}
