import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';
import { OAuthBearerService } from './oauth-bearer.service';
import { OAuthMobileConfigService } from './oauth-mobile-config.service';
import { RequiresRuntimeCapability } from '@/runtime-capabilities/requires-runtime-capability.decorator';

@Controller('oauth')
@RequiresRuntimeCapability('agent-api')
export class OAuthController {
  constructor(
    private readonly bearer: OAuthBearerService,
    private readonly mobileConfig: OAuthMobileConfigService,
  ) {}

  @Get('mobile-config')
  @AllowAnonymous()
  async mobileOAuthConfig(
    @Req() req: Request,
    @Res() res: Response,
    @Query('redirect_uri') redirectUri?: string,
  ) {
    const config = await this.mobileConfig.getConfig({
      baseUrl: this.getBaseUrl(req),
      requestedRedirectUri: redirectUri,
    });
    return res.json(config);
  }

  @Get('clients/:clientId')
  @AllowAnonymous()
  async clientMetadata(@Param('clientId') clientId: string) {
    const client = await this.mobileConfig.findClientName(clientId);

    if (!client) throw new NotFoundException('OAuth client not found');

    return { client };
  }

  @Get('me')
  @AllowAnonymous()
  async me(
    @Headers('authorization') authorization: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const identity = await this.bearer.verifyRequest(req, authorization, [
      'profile:read',
    ]);
    if (!identity) return this.unauthorized(req, res);

    return res.json({
      user: identity.user,
      clientId: identity.clientId,
      audience: identity.audience,
      scopes: identity.scopes,
    });
  }

  private unauthorized(req: Request, res: Response) {
    return res
      .status(401)
      .setHeader('WWW-Authenticate', this.bearer.unauthorizedHeader(req))
      .json({ error: 'unauthorized' });
  }

  private getBaseUrl(req: Request) {
    const configuredBaseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(
      /\/+$/,
      '',
    );
    return configuredBaseUrl || `${req.protocol}://${req.get('host')}`;
  }
}
