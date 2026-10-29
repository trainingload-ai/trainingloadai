import { Module } from '@nestjs/common';
import { ThirdPartyActivityService } from './third-party-activity.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitySourceLifecycleService } from './activity-source-lifecycle.service';
import { ImportingJobModule } from '@/importing/importing-job.module';

@Module({
  imports: [PrismaModule, ImportingJobModule],
  providers: [ThirdPartyActivityService, ActivitySourceLifecycleService],
  exports: [ThirdPartyActivityService, ActivitySourceLifecycleService],
})
export class SyncModule {}
