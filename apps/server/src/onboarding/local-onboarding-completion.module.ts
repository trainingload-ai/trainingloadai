import { Global, Module } from '@nestjs/common';

import { UserQueryModule } from '@/api/user/user-query.module';
import { LocalOnboardingCompletionService } from './local-onboarding-completion.service';
import { ONBOARDING_COMPLETION } from './onboarding-completion.port';

@Global()
@Module({
  imports: [UserQueryModule],
  providers: [
    LocalOnboardingCompletionService,
    {
      provide: ONBOARDING_COMPLETION,
      useExisting: LocalOnboardingCompletionService,
    },
  ],
  exports: [ONBOARDING_COMPLETION],
})
export class LocalOnboardingCompletionModule {}
