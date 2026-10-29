import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { HealthDataModule } from '@/health-data/health-data.module';
import { LoadReadoutModule } from '@/api/activity/load-readout.module';
import { PMCModule } from '@/training-load/pmc.module';
import { AthleteMemoryModule } from '@/athlete-memory/athlete-memory.module';
import { AthleteStateFeatureFlags } from './athlete-state-feature-flags.service';
import { AthleteStateEvidenceService } from './application/athlete-state-evidence.service';
import { AthleteStateRepository } from './infrastructure/athlete-state.repository';
import { AthleteStateQueries } from './application/athlete-state-queries.service';
import { AthleteStateCommands } from './application/athlete-state-commands.service';
import { AthleteStateMemoryInvalidationListener } from './application/athlete-state-memory-invalidation.listener';

@Module({
  imports: [
    PrismaModule,
    HealthDataModule,
    LoadReadoutModule,
    PMCModule,
    AthleteMemoryModule,
  ],
  providers: [
    AthleteStateFeatureFlags,
    AthleteStateEvidenceService,
    AthleteStateRepository,
    AthleteStateQueries,
    AthleteStateCommands,
    AthleteStateMemoryInvalidationListener,
  ],
  exports: [
    AthleteStateFeatureFlags,
    AthleteStateQueries,
    AthleteStateCommands,
  ],
})
export class AthleteStateModule {}
