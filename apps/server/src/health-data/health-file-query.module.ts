import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { HealthDataRepository } from './persistence/health-data.repository';
import { HealthFileQueryService } from './health-file-query.service';

@Module({
  imports: [PrismaModule],
  providers: [HealthDataRepository, HealthFileQueryService],
  exports: [HealthFileQueryService],
})
export class HealthFileQueryModule {}
