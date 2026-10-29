import { Module } from '@nestjs/common';
import { ChartsController } from './charts.controller';
import { ChartsService } from './charts.service';
import { SensorDataModule } from '../../sensor/sensor-data.module';
import { ActivityModule } from '../activity/activity.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { UsersModule } from '../user/user.module';
import { PMCModule } from '@/training-load/pmc.module';

@Module({
  imports: [
    SensorDataModule,
    ActivityModule,
    PrismaModule,
    UsersModule,
    PMCModule,
  ],
  controllers: [ChartsController],
  providers: [ChartsService],
  exports: [ChartsService],
})
export class ChartsModule {}
