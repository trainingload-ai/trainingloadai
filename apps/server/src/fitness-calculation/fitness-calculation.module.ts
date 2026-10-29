import { HealthFileQueryModule } from '@/health-data/health-file-query.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { SensorDataModule } from '@/sensor/sensor-data.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { FitnessEvidenceReader } from './fitness-evidence.reader';
import { FitnessCalculationService } from './fitness-calculation.service';
@Module({
  imports: [
    PrismaModule,
    SensorDataModule,
    UserQueryModule,
    HealthFileQueryModule,
  ],
  providers: [FitnessEvidenceReader, FitnessCalculationService],
  exports: [FitnessEvidenceReader, FitnessCalculationService],
})
export class FitnessCalculationModule {}
