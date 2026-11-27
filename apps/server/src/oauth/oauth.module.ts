import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { OAuthController } from './oauth.controller';
import { OAuthMetadataController } from './oauth-metadata.controller';
import { OAuthBearerService } from './oauth-bearer.service';
import { OAuthHybridAuthGuard } from './oauth-hybrid-auth.guard';
import { OAuthMobileConfigService } from './oauth-mobile-config.service';
import { OAuthClientRepository } from './persistence/oauth-client.repository';
import { UserQueryModule } from '@/api/user/user-query.module';

@Module({
  imports: [PrismaModule, UserQueryModule],
  controllers: [OAuthController, OAuthMetadataController],
  providers: [
    OAuthBearerService,
    OAuthHybridAuthGuard,
    OAuthMobileConfigService,
    OAuthClientRepository,
  ],
  exports: [OAuthBearerService, OAuthHybridAuthGuard],
})
export class OAuthModule {}
