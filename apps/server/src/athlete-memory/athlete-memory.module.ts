import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { UserQueryModule } from '@/api/user/user-query.module';
import { ATHLETE_MEMORY_STORE } from './application/ports/athlete-memory-store';
import { PrismaAthleteMemoryStore } from './infrastructure/persistence/prisma-athlete-memory.store';
import { ApplyMemoryOperationsService } from './application/apply-memory-operations.service';
import { AthleteMemoryQueryService } from './application/athlete-memory-query.service';
import { AmbientMemoryContextService } from './application/ambient-memory-context.service';
import { AthleteMemoryManagementService } from './application/athlete-memory-management.service';
import { AthleteMemoryPreferenceService } from './application/athlete-memory-preference.service';
import { AthleteMemoryController } from './presentation/athlete-memory.controller';
import { AiDataConsentModule } from '@/ai-data-consent/ai-data-consent.module';

@Module({
  imports: [PrismaModule, UserQueryModule, AiDataConsentModule],
  controllers: [AthleteMemoryController],
  providers: [
    PrismaAthleteMemoryStore,
    {
      provide: ATHLETE_MEMORY_STORE,
      useExisting: PrismaAthleteMemoryStore,
    },
    ApplyMemoryOperationsService,
    AthleteMemoryQueryService,
    AmbientMemoryContextService,
    AthleteMemoryManagementService,
    AthleteMemoryPreferenceService,
  ],
  exports: [
    ApplyMemoryOperationsService,
    AthleteMemoryQueryService,
    AthleteMemoryPreferenceService,
  ],
})
export class AthleteMemoryModule {}
