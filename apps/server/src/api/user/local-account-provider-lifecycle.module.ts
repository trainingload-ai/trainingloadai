import { Global, Module } from '@nestjs/common';

import { ExternalProviderIntegrationModule } from '@/integrations/external-provider/external-provider-integration.module';
import { PrismaModule } from '@/prisma/prisma.module';
import {
  ACCOUNT_PROVIDER_CLEANUP,
  EXTERNAL_ACCOUNT_DISCONNECT,
} from './account-provider-lifecycle.port';
import { LocalAccountProviderLifecycleService } from './local-account-provider-lifecycle.service';

@Global()
@Module({
  imports: [PrismaModule, ExternalProviderIntegrationModule],
  providers: [
    LocalAccountProviderLifecycleService,
    {
      provide: ACCOUNT_PROVIDER_CLEANUP,
      useExisting: LocalAccountProviderLifecycleService,
    },
    {
      provide: EXTERNAL_ACCOUNT_DISCONNECT,
      useExisting: LocalAccountProviderLifecycleService,
    },
  ],
  exports: [ACCOUNT_PROVIDER_CLEANUP, EXTERNAL_ACCOUNT_DISCONNECT],
})
export class LocalAccountProviderLifecycleModule {}
