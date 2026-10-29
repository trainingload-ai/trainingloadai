import { Module } from '@nestjs/common';

import { ActivityModule } from '@/api/activity/activity.module';
import { PlanModule } from '@/api/plan/plan.module';
import { CompetitionModule } from '@/api/competition/competition.module';
import { HealthDataModule } from '@/health-data/health-data.module';
import { PMCModule } from '@/training-load/pmc.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { StorageModule } from '@/storage/storage.module';
import { SensorFileQueryModule } from '@/sensor/sensor-file-query.module';
import { ImportingJobModule } from '@/importing/importing-job.module';
import { UserQueryModule } from '@/api/user/user-query.module';

import { UserDataExportArchiveService } from './user-data-export-archive.service';
import { UserDataExportController } from './user-data-export.controller';
import { UserDataExportService } from './user-data-export.service';
import { UserDataExportWorker } from './user-data-export.worker';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    PlanModule,
    CompetitionModule,
    HealthDataModule,
    PMCModule,
    SensorFileQueryModule,
    ImportingJobModule,
    UserQueryModule,
    ActivityModule,
  ],
  controllers: [UserDataExportController],
  providers: [
    UserDataExportService,
    UserDataExportArchiveService,
    UserDataExportWorker,
  ],
  exports: [UserDataExportService],
})
export class UserDataExportModule {}
