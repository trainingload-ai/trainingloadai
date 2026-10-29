import { Module } from '@nestjs/common';
import { HeartRateController } from './heart-rate.controller';
import { HeartRateService } from './heart-rate.service';
import { SensorDataModule } from '../sensor/sensor-data.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../api/user/user.module';
import { LoadReadoutModule } from '@/api/activity/load-readout.module';
import { EpocCurveService } from './epoc-curve.service';

@Module({
  imports: [SensorDataModule, PrismaModule, UsersModule, LoadReadoutModule],
  controllers: [HeartRateController],
  providers: [HeartRateService, EpocCurveService],
  exports: [HeartRateService],
})
export class HeartRateModule {}
