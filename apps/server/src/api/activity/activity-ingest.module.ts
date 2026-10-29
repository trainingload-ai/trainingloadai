import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ActivityIngestService } from './activity-ingest.service';

/**
 * 只含 Activity ingest 门面，给 Importing materializer 用，避免 Importing ↔ ActivityModule 环。
 */
@Module({
  imports: [PrismaModule],
  providers: [ActivityIngestService],
  exports: [ActivityIngestService],
})
export class ActivityIngestModule {}
