import { Global, Module } from '@nestjs/common';

import { FEATURE_ACCESS_POLICY } from '@/access/feature-access-policy.port';
import { AccountDeletionObligationsModule } from '@/account-lifecycle/account-deletion-obligations.module';
import { SelfHostFeatureAccessPolicy } from './self-host-feature-access-policy.service';

/** Self-host composition: local lifecycle plus operator-funded feature access. */
@Global()
@Module({
  imports: [AccountDeletionObligationsModule],
  providers: [
    SelfHostFeatureAccessPolicy,
    { provide: FEATURE_ACCESS_POLICY, useExisting: SelfHostFeatureAccessPolicy },
  ],
  exports: [FEATURE_ACCESS_POLICY],
})
export class SelfHostAccessModule {}
