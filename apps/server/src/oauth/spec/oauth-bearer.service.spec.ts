import { describe, expect, it, jest } from '@jest/globals';
import { verifyBearerToken } from 'better-auth/oauth2';

jest.mock('better-auth/oauth2', () => ({
  verifyBearerToken: jest.fn(),
}));

import { OAuthBearerService } from '../oauth-bearer.service';

describe('OAuthBearerService', () => {
  const verifyBearerTokenMock = verifyBearerToken as jest.MockedFunction<
    typeof verifyBearerToken
  >;

  function createService() {
    const prisma = {
      t_user: {
        findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
    };

    return {
      prisma,
      service: new OAuthBearerService(
        prisma as never,
        {
          users: () => prisma.t_user,
        } as never,
      ),
    };
  }

  function request(overrides?: Partial<{ protocol: string; host: string }>) {
    return {
      protocol: overrides?.protocol ?? 'https',
      get: (name: string) => {
        if (name.toLowerCase() === 'host') {
          return overrides?.host ?? 'api.example.test';
        }
        return undefined;
      },
      headers: {},
    } as never;
  }

  it('parses bearer tokens from string or array headers', () => {
    const { service } = createService();

    expect(service.parseBearerToken('Bearer token-1')).toBe('token-1');
    expect(service.parseBearerToken('  bearer   token-2  ')).toBe('token-2');
    expect(service.parseBearerToken(['Bearer token-3', 'Bearer token-4'])).toBe(
      'token-3',
    );
  });

  it('rejects missing, non-bearer, or blank bearer headers', () => {
    const { service } = createService();

    expect(service.parseBearerToken(undefined)).toBeNull();
    expect(service.parseBearerToken('Basic abc')).toBeNull();
    expect(service.parseBearerToken('Bearer   ')).toBeNull();
  });

  it('builds unauthorized headers from request origin by default', () => {
    const { service } = createService();

    expect(service.unauthorizedHeader(request())).toBe(
      'Bearer resource_metadata="https://api.example.test/.well-known/oauth-protected-resource/oauth"',
    );
  });

  it('prefers NEXT_PUBLIC_API_URL when generating unauthorized headers', () => {
    const { service } = createService();
    const previous = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'https://configured.example.test///';

    try {
      expect(service.unauthorizedHeader(request({ protocol: 'http' }))).toBe(
        'Bearer resource_metadata="https://configured.example.test/.well-known/oauth-protected-resource/oauth"',
      );
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_API_URL;
      } else {
        process.env.NEXT_PUBLIC_API_URL = previous;
      }
    }
  });

  it('verifies access tokens and returns the local user identity', async () => {
    const { prisma, service } = createService();
    verifyBearerTokenMock.mockResolvedValueOnce({
      sub: 'user-1',
      azp: 'client-1',
      aud: 'https://api.example.test/oauth',
      scope: 'read:activity write:plan',
    } as never);
    prisma.t_user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.test',
      emailVerified: true,
    });

    await expect(
      service.verifyRequest(request(), 'Bearer access-token', [
        'read:activity',
      ]),
    ).resolves.toEqual({
      user: {
        id: 'user-1',
        name: 'Ada',
        email: 'ada@example.test',
        emailVerified: true,
      },
      clientId: 'client-1',
      audience: 'https://api.example.test/oauth',
      scopes: ['read:activity', 'write:plan'],
    });

    expect(verifyBearerTokenMock).toHaveBeenCalledWith('access-token', {
      jwksUrl: 'https://api.example.test/auth/jwks',
      verifyOptions: {
        issuer: 'https://api.example.test/auth',
        audience: 'https://api.example.test/oauth',
      },
      requiredScopes: ['read:activity'],
    });
    expect(prisma.t_user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        accountDeletionRequestedAt: true,
      },
    });
  });

  it('verifies MCP tokens against the MCP resource audience', async () => {
    const { prisma, service } = createService();
    verifyBearerTokenMock.mockResolvedValueOnce({
      sub: 'user-1',
      aud: 'https://api.example.test/mcp',
      scope: 'activity:read',
    } as never);
    prisma.t_user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      name: null,
      email: null,
      emailVerified: false,
      accountDeletionRequestedAt: null,
    });

    await expect(
      service.verifyRequest(request(), 'Bearer token', {
        resourcePath: '/mcp',
      }),
    ).resolves.toMatchObject({ scopes: ['activity:read'] });

    expect(verifyBearerTokenMock).toHaveBeenCalledWith('token', {
      jwksUrl: 'https://api.example.test/auth/jwks',
      verifyOptions: {
        issuer: 'https://api.example.test/auth',
        audience: 'https://api.example.test/mcp',
      },
    });
  });

  it('builds an MCP insufficient-scope challenge', () => {
    const { service } = createService();

    expect(
      service.unauthorizedHeader(request(), {
        resourcePath: '/mcp',
        error: 'insufficient_scope',
        requiredScopes: ['activity:read'],
      }),
    ).toBe(
      'Bearer resource_metadata="https://api.example.test/.well-known/oauth-protected-resource/mcp", error="insufficient_scope", scope="activity:read"',
    );
  });

  it('reads array scopes and omits clientId when azp is not a string', async () => {
    const { prisma, service } = createService();
    verifyBearerTokenMock.mockResolvedValueOnce({
      sub: 'user-1',
      azp: 123,
      aud: ['aud-1'],
      scopes: ['read', 1, 'write'],
    } as never);
    prisma.t_user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      name: null,
      email: null,
      emailVerified: false,
    });

    await expect(
      service.verifyRequest(request(), 'Bearer token'),
    ).resolves.toEqual({
      user: {
        id: 'user-1',
        name: null,
        email: null,
        emailVerified: false,
      },
      clientId: null,
      audience: ['aud-1'],
      scopes: ['read', 'write'],
    });
  });

  it('returns null when token verification fails or subject is missing', async () => {
    const { prisma, service } = createService();
    verifyBearerTokenMock.mockRejectedValueOnce(new Error('bad token'));

    await expect(
      service.verifyRequest(request(), 'Bearer bad'),
    ).resolves.toBeNull();
    expect(prisma.t_user.findUnique).not.toHaveBeenCalled();

    verifyBearerTokenMock.mockResolvedValueOnce({ aud: 'aud' } as never);
    await expect(
      service.verifyRequest(request(), 'Bearer missing-sub'),
    ).resolves.toBeNull();
    expect(prisma.t_user.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when no local user exists for a verified subject', async () => {
    const { prisma, service } = createService();
    verifyBearerTokenMock.mockResolvedValueOnce({
      sub: 'missing-user',
    } as never);
    prisma.t_user.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.verifyRequest(request(), 'Bearer valid-token'),
    ).resolves.toBeNull();
  });

  it('returns null when account deletion is in progress', async () => {
    const { prisma, service } = createService();
    verifyBearerTokenMock.mockResolvedValueOnce({ sub: 'user-1' } as never);
    prisma.t_user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      name: null,
      email: null,
      emailVerified: false,
      accountDeletionRequestedAt: new Date(),
    });

    await expect(
      service.verifyRequest(request(), 'Bearer valid-token'),
    ).resolves.toBeNull();
  });
});
