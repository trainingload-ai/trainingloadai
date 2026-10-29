import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { IntervalsIcuModule } from '@/api/intervals-icu/intervals-icu.module';
import { IntervalsIcuScheduledSyncTask } from '@/api/intervals-icu/intervals-icu-scheduled-sync.task';
import { ThirdPartyScheduledTaskRegistry } from './third-party-scheduled-task.registry';
import { ThirdPartySchedulerService } from './third-party-scheduler.service';

@Module({
  imports: [
    ConfigModule,
    IntervalsIcuModule,
  ],
  providers: [
    {
      provide: ThirdPartyScheduledTaskRegistry,
      inject: [IntervalsIcuScheduledSyncTask],
      useFactory: (intervalsIcu: IntervalsIcuScheduledSyncTask) =>
        new ThirdPartyScheduledTaskRegistry([intervalsIcu]),
    },
    ThirdPartySchedulerService,
  ],
})
export class ThirdPartySchedulerModule {}
