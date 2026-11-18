import { AthleteStateUpdatesModule } from '@/athlete-state/updates/athlete-state-updates.module';
import { HealthObservationService } from './health-observation.service';
import { ImportingJobModule } from '@/importing/importing-job.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { StorageModule } from '@/storage/storage.module';
import { SensorDataModule } from '@/sensor/sensor-data.module';
import { HealthDataIngestService } from './health-data-ingest.service';
import { HealthSeriesStorageService } from './health-series-storage.service';
import { HealthDataController } from './health-data.controller';
import { HealthDataQueryService } from './health-data-query.service';
import { HealthSessionAssociationService } from './health-session-association.service';
import { HealthDataRepository } from './persistence/health-data.repository';
import { HealthFileQueryModule } from './health-file-query.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { TimezoneModule } from '@/timezone/timezone.module';

/**
 * 健康数据摄取、规范化、存储、关联和查询的模块边界。
 * Provider adapter 依赖本模块，不应自行实现合并策略。
 */
@Module({
  imports: [
    AthleteStateUpdatesModule,
    ImportingJobModule,
    PrismaModule,
    StorageModule,
    SensorDataModule,
    HealthFileQueryModule,
    UserQueryModule,
    TimezoneModule,
  ],
  controllers: [HealthDataController],
  providers: [
    HealthObservationService,
    HealthDataRepository,
    HealthDataIngestService,
    HealthDataQueryService,
    HealthSeriesStorageService,
    HealthSessionAssociationService,
  ],
  exports: [
    HealthObservationService,
    HealthDataIngestService,
    HealthDataQueryService,
    HealthSeriesStorageService,
    HealthDataRepository,
    HealthSessionAssociationService,
    HealthFileQueryModule,
  ],
})
export class HealthDataModule {}
