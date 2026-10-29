import { Global, Module } from '@nestjs/common';

import {
  THIRD_PARTY_AUTO_EXPORT_ADAPTERS,
  ThirdPartyAutoExportOrchestratorService,
} from './third-party-auto-export-orchestrator.service';

/**
 * Provider-neutral registry shared by Core jobs and deployment-specific
 * integration modules. Core never imports an integration implementation.
 */
@Global()
@Module({
  providers: [
    { provide: THIRD_PARTY_AUTO_EXPORT_ADAPTERS, useValue: [] },
    ThirdPartyAutoExportOrchestratorService,
  ],
  exports: [ThirdPartyAutoExportOrchestratorService],
})
export class ThirdPartyAutoExportModule {}
