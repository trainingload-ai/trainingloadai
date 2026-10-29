import { Module } from '@nestjs/common';
import { CompetitionController } from './competition.controller';
import { CompetitionEventService } from './competition-event.service';
import { CompetitionImpactController } from './competition-impact.controller';
import { CompetitionImpactContextService } from './competition-impact-context.service';
import { CompetitionImpactEvaluator } from './competition-impact.evaluator';
import { CompetitionImpactFallback } from './competition-impact-fallback';
import { CompetitionImpactService } from './competition-impact.service';
import { CompetitionImpactValidator } from './competition-impact.validator';
import { PMCModule } from '@/training-load/pmc.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { SportCatalogModule } from '@/sports/sport-catalog.module';
import { LoadReadoutModule } from '@/api/activity/load-readout.module';
import { CompetitionRepository } from './persistence/competition.repository';
import { CompetitionQueryService } from './application/competition-query.service';
import { AiDataConsentModule } from '@/ai-data-consent/ai-data-consent.module';
import { AiUsageModule } from '@/api/ai/ai-usage.module';
import { TimezoneModule } from '@/timezone/timezone.module';

@Module({
  imports: [
    PrismaModule,
    PMCModule,
    SportCatalogModule,
    LoadReadoutModule,
    AiDataConsentModule,
    AiUsageModule,
    TimezoneModule,
  ],
  controllers: [CompetitionController, CompetitionImpactController],
  providers: [
    CompetitionRepository,
    CompetitionQueryService,
    CompetitionEventService,
    CompetitionImpactContextService,
    CompetitionImpactEvaluator,
    CompetitionImpactFallback,
    CompetitionImpactService,
    CompetitionImpactValidator,
  ],
  exports: [
    CompetitionEventService,
    CompetitionImpactService,
    CompetitionQueryService,
  ],
})
export class CompetitionModule {}
