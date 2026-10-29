import { Global, Module } from '@nestjs/common';
import { SelfHostBootstrapController } from './self-host-bootstrap.controller';
import { SelfHostBootstrapService } from './self-host-bootstrap.service';
import { SelfHostAiConfigurationController } from './self-host-ai-configuration.controller';
import { SelfHostAiConfigurationService } from './self-host-ai-configuration.service';
import { SelfHostOwnerGuard } from './self-host-owner.guard';
import { SelfHostSessionController } from './self-host-session.controller';
import { SelfHostRuntimeInitializer } from './self-host-runtime-initializer.service';
import { ACCOUNT_DELETION_LOCAL_DATA } from '@/account-lifecycle/account-deletion-local-data.port';
import { SelfHostAccountDeletionLocalDataService } from './self-host-account-deletion-local-data.service';
import { UserQueryModule } from '@/api/user/user-query.module';
import { SelfHostTelemetryConsentController } from './self-host-telemetry-consent.controller';
import { SelfHostTelemetryConsentService } from './self-host-telemetry-consent.service';

@Global()
@Module({
  imports: [UserQueryModule],
  controllers: [
    SelfHostBootstrapController,
    SelfHostAiConfigurationController,
    SelfHostTelemetryConsentController,
    SelfHostSessionController,
  ],
  providers: [
    SelfHostBootstrapService,
    SelfHostAiConfigurationService,
    SelfHostTelemetryConsentService,
    SelfHostOwnerGuard,
    SelfHostRuntimeInitializer,
    SelfHostAccountDeletionLocalDataService,
    {
      provide: ACCOUNT_DELETION_LOCAL_DATA,
      useExisting: SelfHostAccountDeletionLocalDataService,
    },
  ],
  exports: [
    SelfHostBootstrapService,
    SelfHostAiConfigurationService,
    ACCOUNT_DELETION_LOCAL_DATA,
  ],
})
export class SelfHostModule {}
