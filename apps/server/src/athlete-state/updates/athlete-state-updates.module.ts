import { AthleteStateFitnessFacts } from './athlete-state-fitness-facts.service';
import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { AiDataConsentModule } from '@/ai-data-consent/ai-data-consent.module';
import { AthleteStateUpdateQueueModule } from './athlete-state-update-queue.module';
import { AthleteStateUpdates } from './athlete-state-updates.service';

@Module({
  imports: [PrismaModule, AiDataConsentModule, AthleteStateUpdateQueueModule],
  providers: [AthleteStateUpdates, AthleteStateFitnessFacts],
  exports: [
    AthleteStateFitnessFacts,
    AthleteStateUpdates,
    AthleteStateUpdateQueueModule,
  ],
})
export class AthleteStateUpdatesModule {}
