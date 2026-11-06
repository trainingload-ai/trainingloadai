import { ImportingJobModule } from './importing-job.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { SensorFileQueryModule } from '@/sensor/sensor-file-query.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { I18nJsonLoader, I18nModule } from 'nestjs-i18n';

import configuration from '@/config/config';
import { PrismaModule } from '@/prisma/prisma.module';
import { StorageModule } from '@/storage/storage.module';
import { FitActivityDataRepairService } from './fit-activity-data-repair.service';
import { ActivityDataMigrationService } from './activity-data-migration.service';

const messagesPath = [
  path.resolve(process.cwd(), '../../packages/messages/server'),
  path.resolve(process.cwd(), 'packages/messages/server'),
  path.join(__dirname, '../../../messages/server'),
].find(existsSync);

/** Standalone 历史 FIT 活动分析数据修复命令的最小依赖组合。 */
@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../../.env'),
      ],
    }),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loader: I18nJsonLoader,
      loaderOptions: {
        path: messagesPath ?? path.resolve('packages/messages/server'),
      },
    }),
    PrismaModule,
    ImportingJobModule,
    UserQueryModule,
    SensorFileQueryModule,
    StorageModule,
  ],
  providers: [FitActivityDataRepairService, ActivityDataMigrationService],
  exports: [FitActivityDataRepairService, ActivityDataMigrationService],
})
export class ActivityDataMigrationModule {}
