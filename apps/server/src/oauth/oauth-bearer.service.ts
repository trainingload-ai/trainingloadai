import { Injectable } from '@nestjs/common';
import { verifyBearerToken } from 'better-auth/oauth2';
import type { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { UserQueryService } from '@/api/user/user-query.service';

export type OAuthBearerIdentity = {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    emailVerified: boolean;
  };
  clientId: string | null;
  audience: unknown;
  scopes: string[];
};

export type OAuthBearerVerificationOptions = {
  requiredScopes?: string[];
  resourcePath?: `/${string}`;
};

export type OAuthChallengeOptions = {
  error?: 'invalid_token' | 'insufficient_scope';
  errorDescription?: string;
  requiredScopes?: string[];
  resourcePath?: `/${string}`;
};

export type OAuthBearerVerificationResult =
  | { ok: true; identity: OAuthBearerIdentity }
  | {
      ok: false;
      reason:
        | 'invalid_token'
        | 'insufficient_scope'
        | 'verification_unavailable';
    };

@Injectable()
export class OAuthBearerService {
  constructor(
    private readonly prisma: PrismaService,
    users: UserQueryService,
  ) {
    this.users = users;
  }

  private readonly users: UserQueryService;

  parseBearerToken(header?: string | string[]) {
    const value = Array.isArray(header) ? header[0] : header;
    const trimmed = value?.trim();
    if (!trimmed?.toLowerCase().startsWith('bearer ')) return null;

    const token = trimmed.slice('bearer '.length).trim();
    return token || null;
  }

  async verifyRequest(
    req: Request,
    authorization?: string | string[],
    options: string[] | OAuthBearerVerificationOptions = [],
  ): Promise<OAuthBearerIdentity | null> {
    const result = await this.verifyRequestDetailed(
      req,
      authorization,
      options,
    );
    return result.ok ? result.identity : null;
  }

  async verifyRequestDetailed(
    req: Request,
    authorization?: string | string[],
    options: string[] | OAuthBearerVerificationOptions = [],
  ): Promise<OAuthBearerVerificationResult> {
    const token = this.parseBearerToken(
      authorization ?? req.headers.authorization,
    );
    if (!token) return { ok: false, reason: 'invalid_token' };

    const normalizedOptions = Array.isArray(options)
      ? { requiredScopes: options, resourcePath: '/oauth' as const }
      : options;
    const requiredScopes = normalizedOptions.requiredScopes ?? [];
    const resourceUrl = this.getResourceUrl(
      req,
      normalizedOptions.resourcePath ?? '/oauth',
    );
    const baseUrl = this.getBaseUrl(req);

    let payload: Awaited<ReturnType<typeof verifyBearerToken>>;
    try {
      payload = await verifyBearerToken(token, {
        jwksUrl: `${baseUrl}/auth/jwks`,
        verifyOptions: {
          issuer: `${baseUrl}/auth`,
          audience: resourceUrl,
        },
        ...(requiredScopes.length ? { requiredScopes } : {}),
      });
    } catch (error) {
      return { ok: false, reason: this.verificationFailure(error) };
    }

    const userId = typeof payload.sub === 'string' ? payload.sub : null;
    if (!userId) return { ok: false, reason: 'invalid_token' };

    let user;
    try {
      user = await this.users.users().findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          accountDeletionRequestedAt: true,
        },
      });
    } catch {
      return { ok: false, reason: 'verification_unavailable' };
    }
    if (!user || user.accountDeletionRequestedAt) {
      return { ok: false, reason: 'invalid_token' };
    }

    return {
      ok: true,
      identity: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
        },
        clientId: typeof payload.azp === 'string' ? payload.azp : null,
        audience: payload.aud,
        scopes: this.readScopes(payload),
      },
    };
  }

  unauthorizedHeader(req: Request, options: OAuthChallengeOptions = {}) {
    const resourcePath = options.resourcePath ?? '/oauth';
    const parameters = [
      `resource_metadata="${this.getProtectedResourceMetadataUrl(req, resourcePath)}"`,
    ];
    if (options.error) parameters.push(`error="${options.error}"`);
    if (options.errorDescription) {
      parameters.push(
        `error_description="${this.escapeChallengeValue(options.errorDescription)}"`,
      );
    }
    if (options.requiredScopes?.length) {
      parameters.push(`scope="${options.requiredScopes.join(' ')}"`);
    }
    return `Bearer ${parameters.join(', ')}`;
  }

  getResourceUrl(req: Request, resourcePath: `/${string}` = '/oauth') {
    return `${this.getBaseUrl(req)}${resourcePath}`;
  }

  getProtectedResourceMetadataUrl(
    req: Request,
    resourcePath: `/${string}` = '/oauth',
  ) {
    return `${this.getBaseUrl(req)}/.well-known/oauth-protected-resource${resourcePath}`;
  }

  private readScopes(payload: Awaited<ReturnType<typeof verifyBearerToken>>) {
    if (typeof payload.scope === 'string') {
      return payload.scope.split(/\s+/).filter(Boolean);
    }

    if (Array.isArray(payload.scopes)) {
      return payload.scopes.filter(
        (scope): scope is string => typeof scope === 'string',
      );
    }

    return [];
  }

  getBaseUrl(req: Request) {
    const configuredBaseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(
      /\/+$/,
      '',
    );
    return configuredBaseUrl || `${req.protocol}://${req.get('host')}`;
  }

  private escapeChallengeValue(value: string) {
    return value.replace(/["\\]/g, (character) => `\\${character}`);
  }

  private verificationFailure(
    error: unknown,
  ): 'invalid_token' | 'insufficient_scope' | 'verification_unavailable' {
    const message =
      error instanceof Error
        ? `${error.name} ${error.message}`.toLowerCase()
        : '';
    if (message.includes('scope')) return 'insufficient_scope';
    if (
      /(fetch|network|timeout|timed out|econn|enotfound|jwks.*unavailable|database|prisma)/.test(
        message,
      )
    ) {
      return 'verification_unavailable';
    }
    return 'invalid_token';
  }
}
