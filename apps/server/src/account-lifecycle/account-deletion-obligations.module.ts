import { Global, Module } from '@nestjs/common';

import { ACCOUNT_DELETION_OBLIGATIONS } from './account-deletion-obligations.port';
import { LocalAccountDeletionObligationsService } from './local-account-deletion-obligations.service';

@Global()
@Module({
  providers: [
    LocalAccountDeletionObligationsService,
    {
      provide: ACCOUNT_DELETION_OBLIGATIONS,
      useExisting: LocalAccountDeletionObligationsService,
    },
  ],
  exports: [ACCOUNT_DELETION_OBLIGATIONS],
})
export class AccountDeletionObligationsModule {
  /** Self-host 默认无远端义务；云端实现由 Managed 组合入口装配。 */
}
