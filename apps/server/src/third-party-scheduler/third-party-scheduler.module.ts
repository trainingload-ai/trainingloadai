import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { IntervalsIcuModule } from '@/api/intervals-icu/intervals-icu.module';
import { IntervalsIcuScheduledSyncTask } from '@/api/intervals-icu/intervals-icu-scheduled-sync.task';
import { ThirdPartyScheduledTaskRegistry } from './third-party-scheduled-task.registry';
import { ThirdPartySchedulerService } from './third-party-scheduler.service';
import { PersonalIntegrationsModule } from '@/api/personal/personal.module';
import { PersonalWorkerService } from '@/integrations/personal/personal-worker.service';

@Module({
  imports: [
    ConfigModule,
    IntervalsIcuModule,
    PersonalIntegrationsModule,
  ],
  providers: [
    {
      provide: ThirdPartyScheduledTaskRegistry,
      inject: [IntervalsIcuScheduledSyncTask, PersonalWorkerService],
      useFactory: (intervalsIcu: IntervalsIcuScheduledSyncTask, personal: PersonalWorkerService) =>
        new ThirdPartyScheduledTaskRegistry([intervalsIcu, personal]),
    },
    ThirdPartySchedulerService,
  ],
})
export class ThirdPartySchedulerModule {}
