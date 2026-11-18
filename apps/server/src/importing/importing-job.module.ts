import { Module } from '@nestjs/common';
import { UserQueryModule } from '@/api/user/user-query.module';
import { ExternalProviderIntegrationModule } from '@/integrations/external-provider/external-provider-integration.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { ImportingJobRepository } from './persistence/importing-job.repository';
import { ImportingJobService } from './importing-job.service';

/**
 * 只含 job 表门面，避免 Sync ↔ Importing 环。
 */
@Module({
  imports: [PrismaModule, UserQueryModule, ExternalProviderIntegrationModule],
  providers: [ImportingJobRepository, ImportingJobService],
  exports: [ImportingJobService],
})
export class ImportingJobModule {}
