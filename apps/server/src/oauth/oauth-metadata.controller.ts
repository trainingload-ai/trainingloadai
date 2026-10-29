import { Controller, Get, Req, Res } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';
import { auth } from '@/auth';
import { getDeploymentOAuthMetadataHandlers } from '@/auth/deployment-oauth-metadata';
import { OAuthBearerService } from './oauth-bearer.service';
import { MCP_DEFAULT_SCOPES, MCP_READ_SCOPES } from './oauth-scopes';
import { RequiresRuntimeCapability } from '@/runtime-capabilities/requires-runtime-capability.decorator';

function toWebRequest(req: Request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value != null) {
      headers.set(key, String(value));
    }
  }

  return new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, {
    headers,
    method: req.method,
  });
}

async function sendWebResponse(
  res: Response,
  webResponse: globalThis.Response,
) {
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  return res.status(webResponse.status).send(await webResponse.text());
}

@Controller('.well-known')
@RequiresRuntimeCapability('agent-api')
export class OAuthMetadataController {
  constructor(private readonly bearer: OAuthBearerService) {}

  @Get('oauth-authorization-server')
  @AllowAnonymous()
  async authorizationServer(@Req() req: Request, @Res() res: Response) {
    const handlers = getDeploymentOAuthMetadataHandlers(auth);
    return sendWebResponse(
      res,
      await handlers.authorizationServer(toWebRequest(req)),
    );
  }

  @Get('oauth-authorization-server/auth')
  @AllowAnonymous()
  async authorizationServerWithIssuerPath(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const handlers = getDeploymentOAuthMetadataHandlers(auth);
    return sendWebResponse(
      res,
      await handlers.authorizationServer(toWebRequest(req)),
    );
  }

  @Get('openid-configuration')
  @AllowAnonymous()
  async openIdConfiguration(@Req() req: Request, @Res() res: Response) {
    const handlers = getDeploymentOAuthMetadataHandlers(auth);
    return sendWebResponse(
      res,
      await handlers.openIdConfiguration(toWebRequest(req)),
    );
  }

  @Get('oauth-protected-resource')
  @AllowAnonymous()
  protectedResource(@Req() req: Request, @Res() res: Response) {
    return this.sendProtectedResourceMetadata(req, res, '/mcp');
  }

  @Get('oauth-protected-resource/oauth')
  @AllowAnonymous()
  oauthProtectedResource(@Req() req: Request, @Res() res: Response) {
    return this.sendProtectedResourceMetadata(req, res, '/oauth');
  }

  @Get('oauth-protected-resource/mcp')
  @AllowAnonymous()
  mcpProtectedResource(@Req() req: Request, @Res() res: Response) {
    return this.sendProtectedResourceMetadata(req, res, '/mcp');
  }

  private sendProtectedResourceMetadata(
    req: Request,
    res: Response,
    resourcePath: '/oauth' | '/mcp',
  ) {
    const baseUrl = this.bearer.getBaseUrl(req);
    return res.json({
      resource: this.bearer.getResourceUrl(req, resourcePath),
      authorization_servers: [`${baseUrl}/auth`],
      scopes_supported:
        resourcePath === '/mcp'
          ? [...MCP_READ_SCOPES]
          : [...MCP_DEFAULT_SCOPES],
      bearer_methods_supported: ['header'],
    });
  }
}
