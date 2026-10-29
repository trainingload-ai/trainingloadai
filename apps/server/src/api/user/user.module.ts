import { Module } from '@nestjs/common';
import { UsersController } from './user.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { UserService } from './user.service';
import { StorageModule } from '../../storage/storage.module';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionWorker } from './account-deletion.worker';
import { TimezoneModule } from '@/timezone/timezone.module';
import { SyncModule } from '@/sync/sync.module';
import { AuthRateLimitService } from '@/auth/auth-rate-limit.service';
import { RegistrationOtpService } from '@/auth/registration-otp.service';
import { OAuthAuthorizationsService } from './oauth-authorizations.service';
import { ImportingJobModule } from '@/importing/importing-job.module';
import { UserQueryModule } from './user-query.module';
import { CalendarCleanupModule } from '@/api/calendar/calendar-cleanup.module';
import { PlanAccountDeletionModule } from '@/api/plan/plan-account-deletion.module';
import { HealthFileQueryModule } from '@/health-data/health-file-query.module';
import { ExternalProviderIntegrationModule } from '@/integrations/external-provider/external-provider-integration.module';

@Module({
  imports: [
    StorageModule,
    TimezoneModule,
    SyncModule,
    ImportingJobModule,
    UserQueryModule,
    CalendarCleanupModule,
    PlanAccountDeletionModule,
    HealthFileQueryModule,
    ExternalProviderIntegrationModule,
    PrismaModule,
  ],
  controllers: [UsersController],
  providers: [
    UserService,
    AccountDeletionService,
    AccountDeletionWorker,
    AuthRateLimitService,
    RegistrationOtpService,
    OAuthAuthorizationsService,
  ],
  exports: [UserService, AccountDeletionService],
})
export class UsersModule {}
