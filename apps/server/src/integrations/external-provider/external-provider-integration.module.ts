import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@/prisma/prisma.module';
import { ExternalProviderConnectionService } from './external-provider-connection.service';
import { ExternalProviderOAuthStateService } from './external-provider-oauth-state.service';
import { ExternalOAuthStateRepository } from './persistence/external-oauth-state.repository';
import { ExternalProviderConnectionRepository } from './persistence/external-provider-connection.repository';
import { ExternalProviderWebhookInboxService } from './external-provider-webhook-inbox.service';
import { ExternalProviderWebhookDispatcherService } from './external-provider-webhook-dispatcher.service';
import { ExternalProviderWebhookSignalService } from './external-provider-webhook-signal.service';
import { ExternalProviderStatusQueryService } from './external-provider-status-query.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    ExternalProviderConnectionService,
    ExternalProviderOAuthStateService,
    ExternalOAuthStateRepository,
    ExternalProviderConnectionRepository,
    ExternalProviderWebhookSignalService,
    ExternalProviderWebhookInboxService,
    ExternalProviderWebhookDispatcherService,
    ExternalProviderStatusQueryService,
  ],
  exports: [
    ExternalProviderConnectionService,
    ExternalProviderOAuthStateService,
    ExternalProviderWebhookInboxService,
    ExternalProviderWebhookDispatcherService,
    ExternalProviderStatusQueryService,
  ],
})
export class ExternalProviderIntegrationModule {}
