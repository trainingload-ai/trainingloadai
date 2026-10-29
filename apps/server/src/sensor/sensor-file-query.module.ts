import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { SensorFileRepository } from './persistence/sensor-file.repository';
import { SensorFileQueryService } from './sensor-file-query.service';

@Module({
  imports: [PrismaModule],
  providers: [SensorFileRepository, SensorFileQueryService],
  exports: [SensorFileQueryService],
})
export class SensorFileQueryModule {}
