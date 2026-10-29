import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createHmac } from 'crypto';
import { MCP_READ_SCOPES } from '@/oauth/oauth-scopes';

export type OAuthAuthorizationView = {
  clientId: string;
  clientName: string;
  clientUri: string | null;
  icon: string | null;
  scopes: string[];
  authorizedAt: string;
  updatedAt: string;
  isMcpClient: boolean;
  lastMcpUsedAt: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  active: boolean;
  renewable: boolean;
};

@Injectable()
export class OAuthAuthorizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
  ): Promise<{ authorizations: OAuthAuthorizationView[] }> {
    const now = new Date();
    const consents = await this.prisma.oauthConsent.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        clientId: true,
        scopes: true,
        createdAt: true,
        updatedAt: true,
        client: {
          select: {
            name: true,
            uri: true,
            icon: true,
            accessTokens: {
              where: { userId, expiresAt: { gt: now } },
              orderBy: { expiresAt: 'desc' },
              take: 1,
              select: { expiresAt: true },
            },
            refreshTokens: {
              where: { userId, revoked: null, expiresAt: { gt: now } },
              orderBy: { expiresAt: 'desc' },
              take: 1,
              select: { expiresAt: true },
            },
          },
        },
      },
    });

    const grouped = new Map<string, OAuthAuthorizationView>();
    for (const consent of consents) {
      const accessTokenExpiresAt =
        consent.client.accessTokens[0]?.expiresAt ?? null;
      const refreshTokenExpiresAt =
        consent.client.refreshTokens[0]?.expiresAt ?? null;
      const existing = grouped.get(consent.clientId);
      if (existing) {
        existing.scopes = Array.from(
          new Set([...existing.scopes, ...consent.scopes]),
        ).sort();
        existing.isMcpClient = existing.scopes.some((scope) =>
          MCP_READ_SCOPES.includes(scope as (typeof MCP_READ_SCOPES)[number]),
        );
        continue;
      }

      grouped.set(consent.clientId, {
        clientId: consent.clientId,
        clientName: consent.client.name?.trim() || 'OAuth application',
        clientUri: consent.client.uri,
        icon: consent.client.icon,
        scopes: [...consent.scopes].sort(),
        authorizedAt: consent.createdAt.toISOString(),
        updatedAt: consent.updatedAt.toISOString(),
        isMcpClient: consent.scopes.some((scope) =>
          MCP_READ_SCOPES.includes(scope as (typeof MCP_READ_SCOPES)[number]),
        ),
        lastMcpUsedAt: null,
        accessTokenExpiresAt: accessTokenExpiresAt?.toISOString() ?? null,
        refreshTokenExpiresAt: refreshTokenExpiresAt?.toISOString() ?? null,
        active: Boolean(accessTokenExpiresAt || refreshTokenExpiresAt),
        renewable: Boolean(refreshTokenExpiresAt),
      });
    }

    const authorizations = Array.from(grouped.values());
    const secret =
      process.env.MCP_AUDIT_SECRET ??
      process.env.BETTER_AUTH_SECRET ??
      (process.env.NODE_ENV === 'production'
        ? null
        : 'trainingload-mcp-development-audit-secret');
    if (secret) {
      const userFingerprint = this.fingerprint(userId, secret);
      const mcpAuthorizations = authorizations.filter(
        (authorization) => authorization.isMcpClient,
      );
      const byFingerprint = new Map(
        mcpAuthorizations.map((authorization) => [
          this.fingerprint(authorization.clientId, secret),
          authorization,
        ]),
      );
      if (byFingerprint.size > 0) {
        const latest = await this.prisma.mcpCapabilityAudit.findMany({
          where: {
            userFingerprint,
            clientFingerprint: { in: [...byFingerprint.keys()] },
          },
          orderBy: [{ clientFingerprint: 'asc' }, { occurredAt: 'desc' }],
          distinct: ['clientFingerprint'],
          select: { clientFingerprint: true, occurredAt: true },
        });
        for (const audit of latest) {
          const authorization = byFingerprint.get(audit.clientFingerprint);
          if (authorization) {
            authorization.lastMcpUsedAt = audit.occurredAt.toISOString();
          }
        }
      }
    }
    return { authorizations };
  }

  async revoke(userId: string, clientId: string): Promise<{ revoked: true }> {
    const normalizedClientId = clientId.trim();
    if (!normalizedClientId)
      throw new NotFoundException('OAuth authorization not found');

    await this.prisma.$transaction(async (tx) => {
      const consentCount = await tx.oauthConsent.count({
        where: { userId, clientId: normalizedClientId },
      });
      if (consentCount === 0) {
        throw new NotFoundException('OAuth authorization not found');
      }

      // Delete active access first, then refresh grants and consent. This makes
      // revocation immediate and prevents the client from minting new tokens.
      await tx.oauthAccessToken.deleteMany({
        where: { userId, clientId: normalizedClientId },
      });
      await tx.oauthRefreshToken.deleteMany({
        where: { userId, clientId: normalizedClientId },
      });
      await tx.oauthConsent.deleteMany({
        where: { userId, clientId: normalizedClientId },
      });
    });

    return { revoked: true };
  }

  private fingerprint(value: string, secret: string) {
    return createHmac('sha256', secret).update(value).digest('hex');
  }
}
