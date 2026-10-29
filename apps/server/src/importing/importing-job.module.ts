import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ImportingJobRepository } from './persistence/importing-job.repository';
import { ImportingJobService } from './importing-job.service';

/**
 * 只含 job 表门面，避免 Sync ↔ Importing 环。
 */
@Module({
  imports: [PrismaModule],
  providers: [ImportingJobRepository, ImportingJobService],
  exports: [ImportingJobService],
})
export class ImportingJobModule {}
