import { Module } from '@nestjs/common';
import { PaceController } from './pace.controller';
import { PaceService } from './pace.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { UsersModule } from '../user/user.module';
import { SensorDataModule } from '@/sensor/sensor-data.module';
import { LoadReadoutModule } from '../activity/load-readout.module';

@Module({
  imports: [PrismaModule, SensorDataModule, UsersModule, LoadReadoutModule],
  controllers: [PaceController],
  providers: [PaceService],
  exports: [PaceService],
})
export class PaceModule {}
