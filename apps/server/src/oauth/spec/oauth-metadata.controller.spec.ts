import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));
jest.mock('better-auth/oauth2', () => ({
  verifyAccessToken: jest.fn(),
}));
jest.mock('@/auth', () => ({ auth: {} }));

import { OAuthMetadataController } from '../oauth-metadata.controller';

describe('OAuthMetadataController', () => {
  const request = {
    protocol: 'https',
    get: (name: string) =>
      name.toLowerCase() === 'host' ? 'api.example.test' : undefined,
  } as never;

  function response() {
    const res = { json: jest.fn() };
    res.json.mockReturnValue(res);
    return res;
  }

  function controller() {
    const bearer = {
      getBaseUrl: () => 'https://api.example.test',
      getResourceUrl: (_req: unknown, resourcePath: string) =>
        `https://api.example.test${resourcePath}`,
    };
    return new OAuthMetadataController(bearer as never);
  }

  it('uses MCP metadata for the root compatibility endpoint', () => {
    const res = response();

    controller().protectedResource(request, res as never);

    expect(res.json).toHaveBeenCalledWith({
      resource: 'https://api.example.test/mcp',
      authorization_servers: ['https://api.example.test/auth'],
      scopes_supported: [
        'profile:read',
        'training:read',
        'activity:read',
        'plan:read',
        'health:read',
        'competition:read',
      ],
      bearer_methods_supported: ['header'],
    });
  });

  it('publishes a dedicated OAuth REST resource document', () => {
    const res = response();

    controller().oauthProtectedResource(request, res as never);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'https://api.example.test/oauth' }),
    );
  });
});
