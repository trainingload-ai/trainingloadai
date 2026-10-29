import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { StorageModule } from '@/storage/storage.module';
import { SyncModule } from '@/sync/sync.module';
import { TimezoneModule } from '@/timezone/timezone.module';
import { FileSourceAdapter } from './source-adapters/file-source.adapter';
import { IntervalsIcuIntegrationModule } from '@/integrations/intervals-icu/intervals-icu-integration.module';
import { IntervalsIcuSourceAdapter } from './source-adapters/intervals-icu-source.adapter';
import { SourceAdapterRegistry } from './source-adapters/source-adapter.registry';
import { CanonicalActivityMaterializer } from './canonical-activity.materializer';
import { ImportBatchService } from './import-batch.service';
import { RemoteActivityFileService } from './remote-activity-file.service';
import { SportCatalogModule } from '@/sports/sport-catalog.module';
import { HealthDataModule } from '@/health-data/health-data.module';
import { ThirdPartyActivityProjectorService } from './third-party-activity-projector.service';
import { ActivityAssociationService } from './activity-association.service';
import { ActivityDatasetSelectorService } from './activity-dataset-selector.service';
import { ImportingJobModule } from './importing-job.module';
import { SensorFileQueryModule } from '@/sensor/sensor-file-query.module';
import { ActivityIngestModule } from '@/api/activity/activity-ingest.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { ExternalActivitySourceRouter } from './external-activity-source-router.service';
import { ExternalActivityMirrorService } from './external-activity-mirror.service';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    SyncModule,
    TimezoneModule,
    IntervalsIcuIntegrationModule,
    SportCatalogModule,
    HealthDataModule,
    ImportingJobModule,
    SensorFileQueryModule,
    ActivityIngestModule,
    UserQueryModule,
  ],
  providers: [
    FileSourceAdapter,
    IntervalsIcuSourceAdapter,
    {
      provide: SourceAdapterRegistry,
      inject: [FileSourceAdapter, IntervalsIcuSourceAdapter],
      useFactory: (
        file: FileSourceAdapter,
        intervalsIcu: IntervalsIcuSourceAdapter,
      ) => new SourceAdapterRegistry([file, intervalsIcu]),
    },
    CanonicalActivityMaterializer,
    ImportBatchService,
    RemoteActivityFileService,
    ThirdPartyActivityProjectorService,
    ActivityAssociationService,
    ActivityDatasetSelectorService,
    ExternalActivitySourceRouter,
    ExternalActivityMirrorService,
  ],
  exports: [
    FileSourceAdapter,
    IntervalsIcuSourceAdapter,
    SourceAdapterRegistry,
    CanonicalActivityMaterializer,
    ImportBatchService,
    RemoteActivityFileService,
    ThirdPartyActivityProjectorService,
    ActivityAssociationService,
    ActivityDatasetSelectorService,
    ExternalActivitySourceRouter,
    ExternalActivityMirrorService,
    ImportingJobModule,
  ],
})
export class ImportingModule {}
