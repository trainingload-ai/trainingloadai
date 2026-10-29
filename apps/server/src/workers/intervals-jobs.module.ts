import {
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { IntervalsIcuExportService } from '@/api/intervals-icu/intervals-icu-export.service';
import { ExternalProviderIntegrationModule } from '@/integrations/external-provider/external-provider-integration.module';
import { IntervalsIcuIntegrationModule } from '@/integrations/intervals-icu/intervals-icu-integration.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { RuntimeJobSupervisor } from '@/runtime-capabilities/runtime-job-supervisor.service';
import { ThirdPartyActivityExportModule } from '@/sync/third-party-activity-export.module';
import { ThirdPartyAutoExportOrchestratorService } from './third-party-auto-export-orchestrator.service';
import { ThirdPartyAutoExportModule } from './third-party-auto-export.module';

@Injectable()
class IntervalsAutoExportRegistration implements OnModuleInit, OnModuleDestroy {
  private unregisterJob?: () => void;
  private unregisterAdapter?: () => void;

  constructor(
    private readonly orchestrator: ThirdPartyAutoExportOrchestratorService,
    private readonly intervals: IntervalsIcuExportService,
    private readonly capabilities: RuntimeCapabilityService,
    private readonly jobSupervisor: RuntimeJobSupervisor,
  ) {}

  onModuleInit(): void {
    this.unregisterJob = this.jobSupervisor.register({
      id: 'intervals-icu.auto-export',
      enabled: () =>
        this.capabilities.isEnabled('intervals-icu-api-key') &&
        this.capabilities.isEnabled('third-party-sync'),
      start: () => {
        this.unregisterAdapter = this.orchestrator.registerAdapter({
          provider: 'intervalsIcu',
          displayName: 'Intervals.icu',
          export: (args) => this.intervals.exportBatchActivities(args),
        });
      },
      stop: () => {
        this.unregisterAdapter?.();
        this.unregisterAdapter = undefined;
      },
    });
  }

  onModuleDestroy(): void {
    this.unregisterJob?.();
    this.unregisterJob = undefined;
    this.unregisterAdapter?.();
    this.unregisterAdapter = undefined;
  }
}

/** Public-candidate Intervals.icu export adapter used by post-processing jobs. */
@Module({
  imports: [
    PrismaModule,
    IntervalsIcuIntegrationModule,
    ExternalProviderIntegrationModule,
    ThirdPartyActivityExportModule,
    ThirdPartyAutoExportModule,
  ],
  providers: [IntervalsIcuExportService, IntervalsAutoExportRegistration],
})
export class IntervalsJobsModule {}
