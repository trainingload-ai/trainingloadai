import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ImportingModule } from '@/importing';
import { ActivityModule } from '@/api/activity/activity.module';
import { PlanModule } from '@/api/plan/plan.module';
import { WorkoutModule } from '@/api/workout/workout.module';
import { StorageModule } from '@/storage/storage.module';
import { HealthDataModule } from '@/health-data/health-data.module';
import { UsersModule } from '@/api/user/user.module';
import { ThirdPartyActivityExportModule } from '@/sync/third-party-activity-export.module';
import { IntervalsIcuIntegrationModule } from '@/integrations/intervals-icu/intervals-icu-integration.module';
import { NotificationDomainModule } from '@/notification/notification-domain.module';
import { IntervalsIcuController } from './intervals-icu.controller';
import { IntervalsIcuWebhookController } from './intervals-icu-webhook.controller';
import { IntervalsIcuScheduledSyncTask } from './intervals-icu-scheduled-sync.task';
import { IntervalsIcuExportService } from './intervals-icu-export.service';
import { IntervalsIcuPlanSyncService } from './intervals-icu-plan-sync.service';
import { IntervalsIcuService } from './intervals-icu.service';
import { IntervalsIcuWebhookService } from './intervals-icu-webhook.service';
import { SportCatalogModule } from '@/sports/sport-catalog.module';
import { ExternalProviderIntegrationModule } from '@/integrations/external-provider/external-provider-integration.module';
import { IntervalsIcuWebhookWorker } from './intervals-icu-webhook.worker';
import { SyncModule } from '@/sync/sync.module';

/** Intervals.icu：连接、同步、webhook、导出与计划课双向同步。 */
@Module({
  imports: [
    PrismaModule,
    ImportingModule,
    ActivityModule,
    PlanModule,
    WorkoutModule,
    StorageModule,
    HealthDataModule,
    UsersModule,
    IntervalsIcuIntegrationModule,
    NotificationDomainModule,
    SportCatalogModule,
    ExternalProviderIntegrationModule,
    SyncModule,
    ThirdPartyActivityExportModule,
  ],
  controllers: [IntervalsIcuController, IntervalsIcuWebhookController],
  providers: [
    IntervalsIcuService,
    IntervalsIcuWebhookService,
    IntervalsIcuWebhookWorker,
    IntervalsIcuScheduledSyncTask,
    IntervalsIcuExportService,
    IntervalsIcuPlanSyncService,
  ],
  exports: [
    IntervalsIcuService,
    IntervalsIcuPlanSyncService,
    IntervalsIcuScheduledSyncTask,
  ],
})
export class IntervalsIcuModule {}
