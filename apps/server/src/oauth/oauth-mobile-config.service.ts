import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { OAuthClientRepository } from './persistence/oauth-client.repository';
import { MOBILE_OAUTH_SCOPES } from './oauth-scopes';

const DEFAULT_MOBILE_CLIENT_ID = 'trainingload-mobile';
const DEFAULT_MOBILE_REDIRECT_URI = 'trainingloadmobileapp://auth/callback';
const MOBILE_CLIENT_NAME = 'Trainingload Mobile';

export type MobileOAuthConfig = {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  resource: string;
  redirectUri: string;
  scopes: string;
};

@Injectable()
export class OAuthMobileConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: OAuthClientRepository,
  ) {}

  findClientName(clientId: string) {
    return this.clients.findUnique({
      where: { clientId },
      select: { name: true },
    });
  }

  async getConfig(args: {
    baseUrl: string;
    requestedRedirectUri?: string;
  }): Promise<MobileOAuthConfig> {
    const baseUrl = args.baseUrl.replace(/\/+$/, '');
    const clientId =
      process.env.OAUTH_MOBILE_CLIENT_ID?.trim() || DEFAULT_MOBILE_CLIENT_ID;
    const allowedRedirectUris = this.getAllowedRedirectUris();
    const redirectUri =
      this.normalizeAllowedRedirectUri(
        args.requestedRedirectUri,
        allowedRedirectUris,
      ) || this.getDefaultRedirectUri();
    const redirectUris = this.getRedirectUris(allowedRedirectUris, redirectUri);
    const scopes = [...MOBILE_OAUTH_SCOPES];

    await this.clients.upsert({
      where: { clientId },
      create: {
        clientId,
        clientSecret: null,
        name: MOBILE_CLIENT_NAME,
        redirectUris,
        scopes,
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        tokenEndpointAuthMethod: 'none',
        public: true,
        requirePKCE: true,
        skipConsent: true,
        disabled: false,
        type: 'native',
      },
      update: {
        name: MOBILE_CLIENT_NAME,
        redirectUris,
        scopes,
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        tokenEndpointAuthMethod: 'none',
        public: true,
        requirePKCE: true,
        skipConsent: true,
        disabled: false,
        type: 'native',
      },
    });

    return {
      clientId,
      authorizationEndpoint: `${baseUrl}/auth/oauth2/authorize`,
      tokenEndpoint: `${baseUrl}/auth/oauth2/token`,
      resource: `${baseUrl}/oauth`,
      redirectUri,
      scopes: scopes.join(' '),
    };
  }

  private getDefaultRedirectUri() {
    return (
      process.env.OAUTH_MOBILE_REDIRECT_URI?.trim() ||
      DEFAULT_MOBILE_REDIRECT_URI
    );
  }

  private getAllowedRedirectUris() {
    return [
      this.getDefaultRedirectUri(),
      ...this.parseCsv(process.env.OAUTH_MOBILE_REDIRECT_URIS),
    ];
  }

  private getRedirectUris(
    allowedRedirectUris: string[],
    activeRedirectUri: string,
  ) {
    return [
      ...new Set(
        [...allowedRedirectUris, activeRedirectUri]
          .map((uri) => uri.trim())
          .filter(Boolean),
      ),
    ];
  }

  private parseCsv(value?: string) {
    return (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeAllowedRedirectUri(
    value?: string,
    allowedRedirectUris: string[] = [],
  ) {
    const trimmed = value?.trim();
    if (!trimmed) return null;

    try {
      const url = new URL(trimmed);
      if (allowedRedirectUris.includes(trimmed)) return trimmed;
      if (process.env.NODE_ENV !== 'production' && url.protocol === 'exp:') {
        return trimmed;
      }
      return null;
    } catch {
      return null;
    }
  }
}
