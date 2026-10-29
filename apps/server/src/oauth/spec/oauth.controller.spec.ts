import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  Public: () => () => undefined,
  AllowAnonymous: () => () => undefined,
}));
jest.mock('better-auth/oauth2', () => ({
  verifyBearerToken: jest.fn(),
}));

import { OAuthController } from '../oauth.controller';

describe('OAuthController', () => {
  function request(overrides?: Partial<{ protocol: string; host: string }>) {
    return {
      protocol: overrides?.protocol ?? 'https',
      get: (name: string) => {
        if (name.toLowerCase() === 'host') {
          return overrides?.host ?? 'api.example.test';
        }
        return undefined;
      },
    } as never;
  }

  function response() {
    const res = {
      json: jest.fn(),
      status: jest.fn(),
      setHeader: jest.fn(),
    };
    res.json.mockReturnValue(res);
    res.status.mockReturnValue(res);
    res.setHeader.mockReturnValue(res);
    return res;
  }

  function createController() {
    const bearer = {
      verifyRequest: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      unauthorizedHeader: jest.fn<(...args: unknown[]) => string>(),
    };
    const mobileConfig = {
      getConfig: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findClientName: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };

    return {
      bearer,
      mobileConfig,
      controller: new OAuthController(bearer as never, mobileConfig as never),
    };
  }

  it('returns mobile OAuth config using the request base URL and requested redirect', async () => {
    const { controller, mobileConfig } = createController();
    const res = response();
    const config = {
      clientId: 'trainingload-mobile',
      authorizationEndpoint: 'https://api.example.test/auth/oauth2/authorize',
    };
    mobileConfig.getConfig.mockResolvedValueOnce(config);

    await expect(
      controller.mobileOAuthConfig(
        request({ host: 'api.example.test' }),
        res as never,
        'trainingloadmobileapp://auth/callback',
      ),
    ).resolves.toBe(res);

    expect(mobileConfig.getConfig).toHaveBeenCalledWith({
      baseUrl: 'https://api.example.test',
      requestedRedirectUri: 'trainingloadmobileapp://auth/callback',
    });
    expect(res.json).toHaveBeenCalledWith(config);
  });

  it('prefers NEXT_PUBLIC_API_URL when building mobile config base URL', async () => {
    const { controller, mobileConfig } = createController();
    const res = response();
    const previous = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'https://configured.example.test///';
    mobileConfig.getConfig.mockResolvedValueOnce({ ok: true });

    try {
      await controller.mobileOAuthConfig(
        request({ protocol: 'http' }),
        res as never,
      );

      expect(mobileConfig.getConfig).toHaveBeenCalledWith({
        baseUrl: 'https://configured.example.test',
        requestedRedirectUri: undefined,
      });
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_API_URL;
      } else {
        process.env.NEXT_PUBLIC_API_URL = previous;
      }
    }
  });

  it('returns registered OAuth client display metadata', async () => {
    const { controller, mobileConfig } = createController();
    const client = {
      name: 'Codex',
    };
    mobileConfig.findClientName.mockResolvedValueOnce(client);

    await expect(controller.clientMetadata('codex-client')).resolves.toEqual({
      client,
    });

    expect(mobileConfig.findClientName).toHaveBeenCalledWith('codex-client');
  });

  it('rejects unknown OAuth clients', async () => {
    const { controller, mobileConfig } = createController();
    mobileConfig.findClientName.mockResolvedValueOnce(null);

    await expect(controller.clientMetadata('missing-client')).rejects.toThrow(
      'OAuth client not found',
    );
  });

  it('returns the verified OAuth identity from /oauth/me', async () => {
    const { bearer, controller } = createController();
    const req = request();
    const res = response();
    const identity = {
      user: {
        id: 'user-1',
        name: 'Ada',
        email: 'ada@example.test',
        emailVerified: true,
      },
      clientId: 'client-1',
      audience: 'https://api.example.test/oauth',
      scopes: ['profile:read'],
    };
    bearer.verifyRequest.mockResolvedValueOnce(identity);

    await expect(
      controller.me('Bearer token', req, res as never),
    ).resolves.toBe(res);

    expect(bearer.verifyRequest).toHaveBeenCalledWith(req, 'Bearer token', [
      'profile:read',
    ]);
    expect(res.json).toHaveBeenCalledWith(identity);
  });

  it('returns 401 with WWW-Authenticate when /oauth/me verification fails', async () => {
    const { bearer, controller } = createController();
    const req = request();
    const res = response();
    bearer.verifyRequest.mockResolvedValueOnce(null);
    bearer.unauthorizedHeader.mockReturnValueOnce(
      'Bearer authorization_uri="https://api.example.test/auth/oauth2/authorize"',
    );

    await expect(controller.me('Bearer bad', req, res as never)).resolves.toBe(
      res,
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer authorization_uri="https://api.example.test/auth/oauth2/authorize"',
    );
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized' });
  });
});
