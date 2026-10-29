import { describe, expect, it, jest } from '@jest/globals';
import { OAuthMobileConfigService } from '../oauth-mobile-config.service';
import { OAuthClientRepository } from '../persistence/oauth-client.repository';

describe('OAuthMobileConfigService', () => {
  const ENV_KEYS = [
    'OAUTH_MOBILE_CLIENT_ID',
    'OAUTH_MOBILE_REDIRECT_URI',
    'OAUTH_MOBILE_REDIRECT_URIS',
    'NODE_ENV',
  ] as const;

  function withEnv<T>(
    env: Partial<Record<(typeof ENV_KEYS)[number], string>>,
    fn: () => T,
  ): T {
    const previous = Object.fromEntries(
      ENV_KEYS.map((key) => [key, process.env[key]]),
    ) as Record<(typeof ENV_KEYS)[number], string | undefined>;

    for (const key of ENV_KEYS) {
      if (env[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = env[key];
      }
    }

    try {
      return fn();
    } finally {
      for (const key of ENV_KEYS) {
        if (previous[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
    }
  }

  function createService() {
    const prisma = {
      oauthClient: {
        upsert: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
    };

    return {
      prisma,
      service: new OAuthMobileConfigService(
        prisma as never,
        new OAuthClientRepository(prisma as never),
      ),
    };
  }

  it('upserts the default mobile OAuth client and returns endpoint config', async () => {
    const { prisma, service } = createService();

    const result = await withEnv({}, () =>
      service.getConfig({
        baseUrl: 'https://api.example.test///',
      }),
    );

    expect(result).toEqual({
      clientId: 'trainingload-mobile',
      authorizationEndpoint: 'https://api.example.test/auth/oauth2/authorize',
      tokenEndpoint: 'https://api.example.test/auth/oauth2/token',
      resource: 'https://api.example.test/oauth',
      redirectUri: 'trainingloadmobileapp://auth/callback',
      scopes:
        'openid profile email offline_access profile:read training:read activity:read plan:read health:read competition:read activity:write plan:write review:write',
    });
    expect(prisma.oauthClient.upsert).toHaveBeenCalledWith({
      where: { clientId: 'trainingload-mobile' },
      create: expect.objectContaining({
        clientId: 'trainingload-mobile',
        clientSecret: null,
        name: 'Trainingload Mobile',
        redirectUris: ['trainingloadmobileapp://auth/callback'],
        tokenEndpointAuthMethod: 'none',
        public: true,
        requirePKCE: true,
        skipConsent: true,
        disabled: false,
        type: 'native',
      }),
      update: expect.objectContaining({
        redirectUris: ['trainingloadmobileapp://auth/callback'],
        public: true,
        requirePKCE: true,
      }),
    });
  });

  it('honors configured client id and allowed redirect uri list', async () => {
    const { prisma, service } = createService();

    const result = await withEnv(
      {
        OAUTH_MOBILE_CLIENT_ID: 'custom-mobile',
        OAUTH_MOBILE_REDIRECT_URI: 'trainingloadmobileapp://default/callback',
        OAUTH_MOBILE_REDIRECT_URIS:
          'trainingloadmobileapp://allowed/callback, trainingloadmobileapp://default/callback ',
      },
      () =>
        service.getConfig({
          baseUrl: 'https://api.example.test',
          requestedRedirectUri: ' trainingloadmobileapp://allowed/callback ',
        }),
    );

    expect(result.clientId).toBe('custom-mobile');
    expect(result.redirectUri).toBe('trainingloadmobileapp://allowed/callback');
    expect(prisma.oauthClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: 'custom-mobile' },
        create: expect.objectContaining({
          redirectUris: [
            'trainingloadmobileapp://default/callback',
            'trainingloadmobileapp://allowed/callback',
          ],
        }),
      }),
    );
  });

  it('allows Expo redirect uris outside production and persists the active redirect', async () => {
    const { prisma, service } = createService();

    const result = await withEnv(
      {
        NODE_ENV: 'development',
      },
      () =>
        service.getConfig({
          baseUrl: 'https://api.example.test',
          requestedRedirectUri: 'exp://127.0.0.1:8081/--/auth/callback',
        }),
    );

    expect(result.redirectUri).toBe('exp://127.0.0.1:8081/--/auth/callback');
    expect(prisma.oauthClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          redirectUris: [
            'trainingloadmobileapp://auth/callback',
            'exp://127.0.0.1:8081/--/auth/callback',
          ],
        }),
      }),
    );
  });

  it('rejects unlisted redirects in production and falls back to the default redirect', async () => {
    const { prisma, service } = createService();

    const result = await withEnv(
      {
        NODE_ENV: 'production',
        OAUTH_MOBILE_REDIRECT_URI: 'trainingloadmobileapp://default/callback',
      },
      () =>
        service.getConfig({
          baseUrl: 'https://api.example.test',
          requestedRedirectUri: 'exp://127.0.0.1:8081/--/auth/callback',
        }),
    );

    expect(result.redirectUri).toBe('trainingloadmobileapp://default/callback');
    expect(prisma.oauthClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          redirectUris: ['trainingloadmobileapp://default/callback'],
        }),
      }),
    );
  });
});
