import { AthleteStateUpdatesModule } from './updates/athlete-state-updates.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { AthleteStateFeatureFlags } from './athlete-state-feature-flags.service';
import { AthleteStateRepository } from './infrastructure/athlete-state.repository';
import { AthleteStateQueries } from './application/athlete-state-queries.service';
import { AthleteStateCommands } from './application/athlete-state-commands.service';
import { AthleteStateMemoryInvalidationListener } from './application/athlete-state-memory-invalidation.listener';

@Module({
  imports: [AthleteStateUpdatesModule, PrismaModule],
  providers: [
    AthleteStateFeatureFlags,
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
