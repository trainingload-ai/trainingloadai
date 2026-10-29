import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: class {},
}));
jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn((headers) => ({ converted: headers })),
}));
jest.mock('better-auth/oauth2', () => ({
  verifyAccessToken: jest.fn(),
}));

import { fromNodeHeaders } from 'better-auth/node';
import { OAuthHybridAuthGuard } from '../oauth-hybrid-auth.guard';
import { PUBLIC_DEMO_ACCESS_METADATA } from '@/public-demo/allow-public-demo.decorator';

describe('OAuthHybridAuthGuard', () => {
  function context(request: Record<string, unknown>) {
    const handler = function handler() {};
    const klass = class Controller {};
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => handler,
      getClass: () => klass,
    } as never;
  }

  function createGuard(flags?: {
    public?: boolean;
    optional?: boolean;
    sessionOnly?: boolean;
    publicDemoCapability?: string;
  }) {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === 'PUBLIC') return flags?.public ?? false;
        if (key === 'OPTIONAL') return flags?.optional ?? false;
        if (key === 'SESSION_ONLY') return flags?.sessionOnly ?? false;
        if (key === PUBLIC_DEMO_ACCESS_METADATA)
          return flags?.publicDemoCapability;
        return false;
      }),
    };
    const auth = {
      api: {
        getSession: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
    };
    const bearer = {
      verifyRequest: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const publicDemo = {
      verifyRequest: jest.fn<(...args: unknown[]) => unknown>(() => null),
    };
    const prisma = {
      t_user: {
        findUnique: jest.fn<
          (...args: unknown[]) => Promise<Record<string, unknown> | null>
        >(async () => ({ accountDeletionRequestedAt: null })),
      },
    };

    return {
      auth,
      bearer,
      publicDemo,
      prisma,
      guard: new OAuthHybridAuthGuard(
        reflector as never,
        auth as never,
        bearer as never,
        publicDemo as never,
        prisma as never,
        { users: () => prisma.t_user } as never,
      ),
    };
  }

  it('allows requests that already have a session user after checking deletion state', async () => {
    const { auth, bearer, guard, prisma } = createGuard();
    const req = {
      session: { user: { id: 'user-1' } },
      headers: {},
    };

    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(auth.api.getSession).not.toHaveBeenCalled();
    expect(bearer.verifyRequest).not.toHaveBeenCalled();
    expect(prisma.t_user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { accountDeletionRequestedAt: true },
    });
  });

  it('gives an allowed Demo capability precedence over an attached browser session', async () => {
    const { auth, bearer, guard, prisma, publicDemo } = createGuard({
      publicDemoCapability: 'plans:read',
    });
    publicDemo.verifyRequest.mockReturnValueOnce({
      kind: 'public-demo',
      subject: 'demo_guest',
      dataOwnerUserId: 'demo-user',
      datasetVersion: 'demo-v1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    prisma.t_user.findUnique
      .mockResolvedValueOnce({
        id: 'demo-user',
        name: 'Trainingload Demo',
        email: 'demo@example.test',
        emailVerified: true,
      })
      .mockResolvedValueOnce({ accountDeletionRequestedAt: null });
    const req = {
      session: { user: { id: 'real-user' } },
      headers: { cookie: 'trainingload.public-demo=capability' },
      method: 'GET',
      path: '/plans',
    };

    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req).toMatchObject({
      publicDemo: {
        subject: 'demo_guest',
        dataOwnerUserId: 'demo-user',
        datasetVersion: 'demo-v1',
        capability: 'plans:read',
      },
      session: null,
      user: { id: 'demo-user' },
    });
    expect(auth.api.getSession).not.toHaveBeenCalled();
    expect(bearer.verifyRequest).not.toHaveBeenCalled();
  });

  it('rejects an unannotated Demo endpoint even when it is GET and a browser session is attached', async () => {
    const { guard, prisma, publicDemo } = createGuard();
    publicDemo.verifyRequest.mockReturnValueOnce({
      kind: 'public-demo',
      subject: 'demo_guest',
      dataOwnerUserId: 'demo-user',
      datasetVersion: 'demo-v1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    await expect(
      guard.canActivate(
        context({
          session: { user: { id: 'real-user' } },
          headers: { cookie: 'trainingload.public-demo=capability' },
          method: 'GET',
          path: '/new-endpoint-that-was-not-reviewed',
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'DEMO_READ_ONLY', message: 'DEMO_READ_ONLY' },
    });
    expect(prisma.t_user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects every authenticated request after deletion is accepted', async () => {
    const { guard, prisma } = createGuard();
    prisma.t_user.findUnique.mockResolvedValueOnce({
      accountDeletionRequestedAt: new Date(),
    });

    await expect(
      guard.canActivate(
        context({
          session: { user: { id: 'user-1' } },
          headers: {},
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('loads session from better-auth and allows authenticated session requests', async () => {
    const { auth, bearer, guard } = createGuard();
    const req = {
      headers: { authorization: 'Bearer ignored' },
    };
    const session = {
      user: { id: 'user-1', email: 'ada@example.test' },
      session: { id: 'session-1' },
    };
    auth.api.getSession.mockResolvedValueOnce(session);

    await expect(guard.canActivate(context(req))).resolves.toBe(true);

    expect(fromNodeHeaders).toHaveBeenCalledWith(req.headers);
    expect(auth.api.getSession).toHaveBeenCalledWith({
      headers: { converted: req.headers },
    });
    expect(req).toMatchObject({
      session,
      user: session.user,
    });
    expect(bearer.verifyRequest).not.toHaveBeenCalled();
  });

  it('allows a browser session but never falls back to OAuth bearer on a session-only route', async () => {
    const withSession = createGuard({ sessionOnly: true });
    withSession.auth.api.getSession.mockResolvedValueOnce({
      user: { id: 'user-1', email: 'ada@example.test' },
      session: { id: 'session-1' },
    });

    await expect(
      withSession.guard.canActivate(
        context({
          headers: {},
          method: 'POST',
          path: '/sensitive-action',
        }),
      ),
    ).resolves.toBe(true);

    const bearerOnly = createGuard({ sessionOnly: true });
    bearerOnly.auth.api.getSession.mockResolvedValueOnce(null);
    bearerOnly.bearer.verifyRequest.mockResolvedValueOnce({
      user: { id: 'user-1' },
      scopes: ['profile:write'],
    });

    await expect(
      bearerOnly.guard.canActivate(
        context({
          headers: { authorization: 'Bearer oauth-token' },
          method: 'POST',
          path: '/sensitive-action',
        }),
      ),
    ).rejects.toMatchObject({ message: 'BROWSER_SESSION_REQUIRED' });
    expect(bearerOnly.bearer.verifyRequest).not.toHaveBeenCalled();
  });

  it('allows public and optional routes without identity', async () => {
    const publicGuard = createGuard({ public: true });
    publicGuard.auth.api.getSession.mockResolvedValueOnce(null);

    await expect(
      publicGuard.guard.canActivate(context({ headers: {} })),
    ).resolves.toBe(true);
    expect(publicGuard.bearer.verifyRequest).not.toHaveBeenCalled();

    const optionalGuard = createGuard({ optional: true });
    optionalGuard.auth.api.getSession.mockResolvedValueOnce(null);
    optionalGuard.bearer.verifyRequest.mockResolvedValueOnce(null);

    await expect(
      optionalGuard.guard.canActivate(context({ headers: {} })),
    ).resolves.toBe(true);
  });

  it('accepts bearer identity, enforces read scopes, and injects oauth session state', async () => {
    const { auth, bearer, guard } = createGuard();
    const req: {
      headers: { authorization: string };
      method: string;
      path: string;
      auth?: unknown;
      session?: {
        user: Record<string, unknown>;
        session: Record<string, unknown>;
      };
      user?: unknown;
    } = {
      headers: { authorization: 'Bearer token' },
      method: 'GET',
      path: '/plans',
    };
    const identity = {
      user: {
        id: 'user-1',
        name: 'Ada',
        email: 'ada@example.test',
        emailVerified: true,
      },
      clientId: 'client-1',
      audience: 'https://api.example.test/oauth',
      scopes: ['plan:read'],
    };
    auth.api.getSession.mockResolvedValueOnce(null);
    bearer.verifyRequest.mockResolvedValueOnce(identity);

    await expect(guard.canActivate(context(req))).resolves.toBe(true);

    expect(bearer.verifyRequest).toHaveBeenCalledWith(req);
    expect(req.auth).toEqual({
      user: identity.user,
      oauth: {
        clientId: 'client-1',
        audience: 'https://api.example.test/oauth',
        scopes: ['plan:read'],
      },
    });
    expect(req.session?.user).toMatchObject({
      id: 'user-1',
      email: 'ada@example.test',
      image: null,
    });
    expect(req.session?.session).toMatchObject({
      id: 'oauth:client-1',
      token: '',
      userId: 'user-1',
    });
    expect(req.user).toBe(req.session?.user);
  });

  it('rejects bearer requests that lack the required resource scope', async () => {
    const { auth, bearer, guard } = createGuard();
    auth.api.getSession.mockResolvedValueOnce(null);
    bearer.verifyRequest.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        name: null,
        email: null,
        emailVerified: false,
      },
      clientId: null,
      audience: null,
      scopes: ['plan:read'],
    });

    await expect(
      guard.canActivate(
        context({
          headers: { authorization: 'Bearer token' },
          method: 'POST',
          path: '/plans',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws unauthorized when neither session nor bearer identity exists', async () => {
    const { auth, bearer, guard } = createGuard();
    auth.api.getSession.mockResolvedValueOnce(null);
    bearer.verifyRequest.mockResolvedValueOnce(null);

    await expect(
      guard.canActivate(
        context({ headers: {}, method: 'GET', path: '/plans' }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
