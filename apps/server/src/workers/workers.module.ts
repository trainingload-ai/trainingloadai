import { Module } from '@nestjs/common';

import { AiJobsModule } from './ai-jobs.module';
import { CoreJobsModule } from './core-jobs.module';
import { IntervalsJobsModule } from './intervals-jobs.module';
import { MapJobsModule } from './map-jobs.module';

/** Self-host composition of public-candidate job groups. */
@Module({
  imports: [CoreJobsModule, AiJobsModule, IntervalsJobsModule, MapJobsModule],
})
export class SelfHostWorkersModule {}
