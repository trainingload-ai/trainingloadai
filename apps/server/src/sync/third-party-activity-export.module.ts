import { Module } from '@nestjs/common';
import { ActivityModule } from '@/api/activity/activity.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { StorageModule } from '@/storage/storage.module';
import { ThirdPartyActivityExportService } from './third-party-activity-export.service';

/** 第三方平台共用的活动导出文件解析能力。 */
@Module({
  imports: [PrismaModule, StorageModule, ActivityModule],
  providers: [ThirdPartyActivityExportService],
  exports: [ThirdPartyActivityExportService],
})
export class ThirdPartyActivityExportModule {}
