import { Module } from '@nestjs/common';
import { powerService } from './power.service';
import { SensorDataModule } from '@/sensor/sensor-data.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { PowerController } from './power.controller';
import { UsersModule } from '@/api/user/user.module';
import { LoadReadoutModule } from '@/api/activity/load-readout.module';

@Module({
  imports: [SensorDataModule, PrismaModule, UsersModule, LoadReadoutModule],
  controllers: [PowerController],
  providers: [powerService],
  exports: [powerService],
})
export class PowerModule {}
