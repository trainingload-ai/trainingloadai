import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { OAuthAuthorizationsService } from '../oauth-authorizations.service';

function createService() {
  const tx = {
    oauthConsent: {
      count: jest.fn<() => Promise<number>>(),
      deleteMany: jest.fn<() => Promise<unknown>>(),
    },
    oauthAccessToken: { deleteMany: jest.fn<() => Promise<unknown>>() },
    oauthRefreshToken: { deleteMany: jest.fn<() => Promise<unknown>>() },
  };
  const prisma = {
    oauthConsent: { findMany: jest.fn<() => Promise<unknown[]>>() },
    mcpCapabilityAudit: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  return {
    service: new OAuthAuthorizationsService(prisma as never),
    prisma,
    tx,
  };
}

describe('OAuthAuthorizationsService', () => {
  it('returns safe client metadata without token values', async () => {
    const { service, prisma } = createService();
    prisma.oauthConsent.findMany.mockResolvedValue([
      {
        clientId: 'codex-client',
        scopes: ['profile:read', 'offline_access'],
        createdAt: new Date('2026-08-14T00:00:00.000Z'),
        updatedAt: new Date('2026-08-14T01:00:00.000Z'),
        client: {
          name: 'Codex',
          uri: 'https://developers.openai.com/codex',
          icon: null,
          accessTokens: [{ expiresAt: new Date('2026-08-14T02:00:00.000Z') }],
          refreshTokens: [{ expiresAt: new Date('2026-09-13T00:00:00.000Z') }],
        },
      },
    ]);

    await expect(service.list('user-1')).resolves.toEqual({
      authorizations: [
        {
          clientId: 'codex-client',
          clientName: 'Codex',
          clientUri: 'https://developers.openai.com/codex',
          icon: null,
          scopes: ['offline_access', 'profile:read'],
          authorizedAt: '2026-08-14T00:00:00.000Z',
          updatedAt: '2026-08-14T01:00:00.000Z',
          isMcpClient: true,
          lastMcpUsedAt: null,
          accessTokenExpiresAt: '2026-08-14T02:00:00.000Z',
          refreshTokenExpiresAt: '2026-09-13T00:00:00.000Z',
          active: true,
          renewable: true,
        },
      ],
    });
  });

  it('does not label generic OAuth grants with MCP usage metadata', async () => {
    const { service, prisma } = createService();
    prisma.oauthConsent.findMany.mockResolvedValue([
      {
        clientId: 'login-client',
        scopes: ['openid', 'profile'],
        createdAt: new Date('2026-08-14T00:00:00.000Z'),
        updatedAt: new Date('2026-08-14T01:00:00.000Z'),
        client: {
          name: 'Login client',
          uri: null,
          icon: null,
          accessTokens: [],
          refreshTokens: [],
        },
      },
    ]);

    await expect(service.list('user-1')).resolves.toMatchObject({
      authorizations: [
        {
          isMcpClient: false,
          lastMcpUsedAt: null,
          scopes: ['openid', 'profile'],
        },
      ],
    });
    expect(prisma.mcpCapabilityAudit.findMany).not.toHaveBeenCalled();
  });

  it('revokes access, refresh, and consent records in one transaction', async () => {
    const { service, tx } = createService();
    tx.oauthConsent.count.mockResolvedValue(1);

    await expect(service.revoke('user-1', 'codex-client')).resolves.toEqual({
      revoked: true,
    });
    expect(tx.oauthAccessToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', clientId: 'codex-client' },
    });
    expect(tx.oauthRefreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', clientId: 'codex-client' },
    });
    expect(tx.oauthConsent.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', clientId: 'codex-client' },
    });
  });

  it('does not reveal whether another user authorized the client', async () => {
    const { service, tx } = createService();
    tx.oauthConsent.count.mockResolvedValue(0);
    await expect(
      service.revoke('user-1', 'other-client'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.oauthAccessToken.deleteMany).not.toHaveBeenCalled();
  });
});
