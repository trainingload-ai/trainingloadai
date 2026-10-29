import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { OAuthController } from './oauth.controller';
import { OAuthMetadataController } from './oauth-metadata.controller';
import { OAuthBearerService } from './oauth-bearer.service';
import { OAuthHybridAuthGuard } from './oauth-hybrid-auth.guard';
import { OAuthMobileConfigService } from './oauth-mobile-config.service';
import { OAuthClientRepository } from './persistence/oauth-client.repository';
import { UserQueryModule } from '@/api/user/user-query.module';
import { PublicDemoModule } from '@/public-demo/public-demo.module';

@Module({
  imports: [PrismaModule, UserQueryModule, PublicDemoModule],
  controllers: [OAuthController, OAuthMetadataController],
  providers: [
    OAuthBearerService,
    OAuthHybridAuthGuard,
    OAuthMobileConfigService,
    OAuthClientRepository,
  ],
  // Controllers in feature modules reference OAuthHybridAuthGuard directly via
  // @UseGuards. Re-export its Demo dependency as well so Nest can resolve the
  // same PublicDemoTokenService instance in each consuming module context.
  exports: [OAuthBearerService, OAuthHybridAuthGuard, PublicDemoModule],
})
export class OAuthModule {}
