import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ExternalProviderIntegrationModule } from '@/integrations/external-provider/external-provider-integration.module';
import { ImportingModule } from '@/importing/importing.module';
import { HealthDataModule } from '@/health-data/health-data.module';
import { StorageModule } from '@/storage/storage.module';
import { SyncModule } from '@/sync/sync.module';
import { PlanModule } from '@/api/plan/plan.module';
import { UsersModule } from '@/api/user/user.module';
import { GarminPersonalClient } from '@/integrations/garmin-personal/garmin-personal.client';
import { CorosMcpClient } from '@/integrations/coros-mcp/coros-mcp.client';
import { PersonalConnectionService } from '@/integrations/personal/personal-connection.service';
import { PersonalSyncService } from '@/integrations/personal/personal-sync.service';
import { PersonalWriteService } from '@/integrations/personal/personal-write.service';
import { PersonalWorkerService } from '@/integrations/personal/personal-worker.service';
import { SelfHostOwnerGuard } from '@/self-host/self-host-owner.guard';
import {
  CorosPersonalController,
  CorosOAuthCallbackController,
  GarminPersonalController,
} from './personal.controller';

/** Only installed by SelfHostAppModule; never enabled by a general Cloud flag. */
@Module({
  imports: [
    PrismaModule,
    ExternalProviderIntegrationModule,
    ImportingModule,
    HealthDataModule,
    StorageModule,
    SyncModule,
    PlanModule,
    UsersModule,
  ],
  controllers: [
    GarminPersonalController,
    CorosPersonalController,
    CorosOAuthCallbackController,
  ],
  providers: [
    SelfHostOwnerGuard,
    GarminPersonalClient,
    CorosMcpClient,
    PersonalConnectionService,
    PersonalSyncService,
    PersonalWriteService,
    PersonalWorkerService,
  ],
  exports: [PersonalWorkerService],
})
export class PersonalIntegrationsModule {}
