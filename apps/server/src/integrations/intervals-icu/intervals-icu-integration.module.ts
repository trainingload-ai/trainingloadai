import { Module } from '@nestjs/common';
import { IntervalsIcuClient } from './intervals-icu.client';
import { IntervalsIcuCredentialService } from './intervals-icu-credential.service';
import { CREDENTIAL_VAULT } from '@/integrations/external-provider/credential-vault.port';

@Module({
  providers: [
    IntervalsIcuClient,
    IntervalsIcuCredentialService,
    {
      provide: CREDENTIAL_VAULT,
      useExisting: IntervalsIcuCredentialService,
    },
  ],
  exports: [
    IntervalsIcuClient,
    IntervalsIcuCredentialService,
    CREDENTIAL_VAULT,
  ],
})
export class IntervalsIcuIntegrationModule {}
