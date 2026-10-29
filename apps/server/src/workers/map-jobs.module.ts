import { Module } from '@nestjs/common';

import { ActivityModule } from '@/api/activity/activity.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { SensorDataModule } from '@/sensor/sensor-data.module';
import { StorageModule } from '@/storage/storage.module';
import { ActivityMapThumbWorkerService } from './workers/activity-map-thumb.worker';

/** Map thumbnail consumers; provider capability is checked before timer setup. */
@Module({
  imports: [PrismaModule, ActivityModule, StorageModule, SensorDataModule],
  providers: [ActivityMapThumbWorkerService],
})
export class MapJobsModule {}
