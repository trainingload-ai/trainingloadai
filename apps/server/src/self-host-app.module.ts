import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AppModule } from './app.module';
import { SelfHostAccessModule } from './deployment/self-host-access.module';
import { SelfHostModule } from './self-host/self-host.module';
import { ThirdPartySchedulerModule } from './third-party-scheduler/third-party-scheduler.module';
import { SelfHostWorkersModule } from './workers/workers.module';
import { LocalOnboardingCompletionModule } from './onboarding/local-onboarding-completion.module';
import { LocalAccountProviderLifecycleModule } from './api/user/local-account-provider-lifecycle.module';
import { SelfHostAiOperationPersistenceModule } from './deployment/self-host-ai-operation-persistence.module';
import { DisabledExternalProgramImportModule } from './deployment/disabled-external-program-import.module';

/** 可公开、自托管构建的唯一组合入口。 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    SelfHostAccessModule,
    SelfHostAiOperationPersistenceModule,
    DisabledExternalProgramImportModule,
    LocalOnboardingCompletionModule,
    LocalAccountProviderLifecycleModule,
    SelfHostModule,
    SelfHostWorkersModule,
    ThirdPartySchedulerModule,
    AppModule,
  ],
})
export class SelfHostAppModule {}
