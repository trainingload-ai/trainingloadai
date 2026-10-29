import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { TimezoneInferenceService } from './timezone-inference.service';
import { UserTimezoneInitializerService } from './user-timezone-initializer.service';
import { LoadReadoutModule } from '@/api/activity/load-readout.module';
import { AthleteClockService } from './athlete-clock.service';

@Module({
  imports: [PrismaModule, UserQueryModule, LoadReadoutModule],
  providers: [
    AthleteClockService,
    TimezoneInferenceService,
    UserTimezoneInitializerService,
  ],
  exports: [
    AthleteClockService,
    TimezoneInferenceService,
    UserTimezoneInitializerService,
  ],
})
export class TimezoneModule {}
