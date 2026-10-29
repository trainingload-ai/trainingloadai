import { Module } from '@nestjs/common';

import { ActivityModule } from '@/api/activity/activity.module';
import { PlanModule } from '@/api/plan/plan.module';
import { UsersModule } from '@/api/user/user.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { AnalyzeModule } from '@/analyze/analyze.module';
import { HealthDataModule } from '@/health-data/health-data.module';
import { ImportingModule } from '@/importing';
import { ImportItemWorkerService } from '@/importing/import-item.worker';
import { UserPostProcessWorkerService } from '@/importing/user-post-process.worker';
import { ExternalProviderIntegrationModule } from '@/integrations/external-provider/external-provider-integration.module';
import { IntervalsIcuIntegrationModule } from '@/integrations/intervals-icu/intervals-icu-integration.module';
import { NotificationDomainModule } from '@/notification/notification-domain.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { SensorDataModule } from '@/sensor/sensor-data.module';
import { StorageModule } from '@/storage/storage.module';
import { SyncModule } from '@/sync/sync.module';
import { ThirdPartyActivityExportModule } from '@/sync/third-party-activity-export.module';
import { ActivityRecomputeWorkerService } from './workers/activity-recompute.worker';
import { ThirdPartyAutoExportModule } from './third-party-auto-export.module';

/** Always-on local queue consumers that do not require a remote AI provider. */
@Module({
  imports: [
    PrismaModule,
    UsersModule,
    NotificationDomainModule,
    ImportingModule,
    ActivityModule,
    PlanModule,
    StorageModule,
    AnalyzeModule,
    SyncModule,
    IntervalsIcuIntegrationModule,
    ExternalProviderIntegrationModule,
    HealthDataModule,
    SensorDataModule,
    UserQueryModule,
    ThirdPartyActivityExportModule,
    ThirdPartyAutoExportModule,
  ],
  providers: [
    ActivityRecomputeWorkerService,
    ImportItemWorkerService,
    UserPostProcessWorkerService,
  ],
})
export class CoreJobsModule {}
