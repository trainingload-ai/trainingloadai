import { Module } from '@nestjs/common';
import { SensorDataService } from './sensor-data.service';
import { StorageModule } from '../storage/storage.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { HealthFileQueryModule } from '@/health-data/health-file-query.module';
import { SensorFileQueryModule } from './sensor-file-query.module';
import { StorageObjectGarbageCollectorService } from './parquet-garbage-collector.service';

@Module({
  imports: [
    StorageModule,
    PrismaModule,
    HealthFileQueryModule,
    SensorFileQueryModule,
  ],
  providers: [SensorDataService, StorageObjectGarbageCollectorService],
  exports: [
    SensorDataService,
    StorageObjectGarbageCollectorService,
    SensorFileQueryModule,
  ],
})
export class SensorDataModule {}
