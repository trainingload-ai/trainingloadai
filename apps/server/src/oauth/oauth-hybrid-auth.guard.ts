import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService, type UserSession } from '@thallesp/nestjs-better-auth';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import {
  OAuthBearerIdentity,
  OAuthBearerService,
} from './oauth-bearer.service';
import { PrismaService } from '@/prisma/prisma.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { SESSION_ONLY_METADATA } from './session-only.decorator';
import {
  PUBLIC_DEMO_READ_ONLY_CODE,
  type PublicDemoCapability,
} from '@shared/public-demo-policy';
import {
  PublicDemoTokenService,
  type PublicDemoIdentity,
} from '@/public-demo/public-demo-token.service';
import { PUBLIC_DEMO_ACCESS_METADATA } from '@/public-demo/allow-public-demo.decorator';
import {
  getDeploymentResourceScopeRules,
  type ResourceScopeRule,
} from './deployment-resource-scope-rules';

type AuthenticatedRequest = Request & {
  session?: UserSession | null;
  user?: UserSession['user'] | OAuthBearerIdentity['user'] | null;
  auth?: {
    user?: OAuthBearerIdentity['user'];
    oauth?: Omit<OAuthBearerIdentity, 'user'>;
  };
  accountAccessCheckedUserId?: string;
  publicDemo?: PublicDemoIdentity & { capability: PublicDemoCapability };
};

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const RESOURCE_SCOPE_RULES: ResourceScopeRule[] = [
  { prefix: '/plans', readScope: 'plan:read', writeScope: 'plan:write' },
  {
    prefix: '/plan-templates',
    readScope: 'plan:read',
    writeScope: 'plan:write',
  },
  {
    prefix: '/plan-shares',
    readScope: 'plan:read',
    writeScope: 'plan:write',
  },
  {
    prefix: '/plan-share-lineages',
    readScope: 'plan:read',
    writeScope: 'plan:write',
  },
  {
    prefix: '/activities',
    readScope: 'activity:read',
    writeScope: 'activity:write',
  },
  {
    prefix: '/calendar/subscription',
    readScope: 'plan:read',
    writeScope: 'plan:write',
  },
  { prefix: '/pmc', readScope: 'training:read' },
  {
    prefix: '/charts',
    readScope: 'training:read',
    writeScope: 'training:read',
  },
  { prefix: '/heart-rate', readScope: 'training:read' },
  { prefix: '/pace', readScope: 'training:read', writeScope: 'training:read' },
  { prefix: '/power', readScope: 'training:read' },
  { prefix: '/workout', readScope: 'plan:read', writeScope: 'plan:write' },
  {
    prefix: '/ai/coach',
    readScope: 'training:read',
    writeScope: 'review:write',
  },
  {
    prefix: '/review/schedules',
    readScope: 'profile:read',
    writeScope: 'review:write',
  },
  {
    prefix: '/notifications',
    readScope: 'profile:read',
    writeScope: 'profile:read',
  },
  { prefix: '/users', readScope: 'profile:read', writeScope: 'profile:read' },
  {
    prefix: '/intervals-icu',
    readScope: 'activity:read',
    writeScope: 'activity:write',
  },
];

@Injectable()
export class OAuthHybridAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly bearer: OAuthBearerService,
    private readonly publicDemo: PublicDemoTokenService,
    private readonly prisma: PrismaService,
    users: UserQueryService,
  ) {
    this.users = users;
  }

  private readonly users: UserQueryService;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.publicDemo) {
      this.assertPublicDemoAccess(context);
      return true;
    }

    // A Demo guest session intentionally wins over any cross-subdomain browser
    // session. Otherwise a signed-in user visiting demo.trainingload.ai could
    // silently see or mutate their own account while the UI says "Demo".
    // Public endpoints (including guest-session refresh) skip this branch so an
    // expired Demo cookie cannot prevent a new capability from being issued.
    if (!this.isPublic(context)) {
      const publicDemo = await this.publicDemo.verifyRequest(request);
      if (publicDemo) {
        const capability = this.assertPublicDemoAccess(context);
        const user = await this.users.users().findUnique({
          where: { id: publicDemo.dataOwnerUserId },
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
          },
        });
        if (!user) throw new UnauthorizedException('UNAUTHORIZED');
        request.publicDemo = { ...publicDemo, capability };
        request.session = null;
        request.auth = undefined;
        request.user = user;
        await this.assertAccountAccess(request, user.id);
        return true;
      }
    }

    const attachedUserId = request.session?.user?.id || request.auth?.user?.id;
    if (attachedUserId) {
      await this.assertAccountAccess(request, attachedUserId);
      return true;
    }

    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers ?? {}),
    });

    request.session = session;
    request.user = session?.user ?? null;

    if (this.isPublic(context)) return true;
    if (session) {
      await this.assertAccountAccess(request, session.user.id);
      return true;
    }

    if (this.isSessionOnly(context)) {
      throw new UnauthorizedException('BROWSER_SESSION_REQUIRED');
    }

    const identity = await this.bearer.verifyRequest(request);
    if (identity) {
      this.assertBearerAccess(request, identity);
      request.auth = {
        user: identity.user,
        oauth: {
          clientId: identity.clientId,
          audience: identity.audience,
          scopes: identity.scopes,
        },
      };
      request.session = this.toOAuthSession(identity);
      request.user = request.session.user;
      await this.assertAccountAccess(request, identity.user.id);
      return true;
    }

    if (this.isOptional(context)) return true;

    throw new UnauthorizedException('UNAUTHORIZED');
  }

  private async assertAccountAccess(
    request: AuthenticatedRequest,
    userId: string,
  ) {
    if (request.accountAccessCheckedUserId === userId) return;
    const user = await this.users.users().findUnique({
      where: { id: userId },
      select: { accountDeletionRequestedAt: true },
    });
    if (!user) throw new UnauthorizedException('UNAUTHORIZED');
    if (user.accountDeletionRequestedAt) {
      throw new ForbiddenException({
        code: 'ACCOUNT_DELETION_IN_PROGRESS',
        message: 'ACCOUNT_DELETION_IN_PROGRESS',
      });
    }
    request.accountAccessCheckedUserId = userId;
  }

  private isPublic(context: ExecutionContext) {
    return this.reflector.getAllAndOverride<boolean>('PUBLIC', [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  private isOptional(context: ExecutionContext) {
    return this.reflector.getAllAndOverride<boolean>('OPTIONAL', [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  private isSessionOnly(context: ExecutionContext) {
    return this.reflector.getAllAndOverride<boolean>(SESSION_ONLY_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  private assertBearerAccess(
    request: AuthenticatedRequest,
    identity: OAuthBearerIdentity,
  ) {
    const path = request.path || request.url || '';
    const rule = [
      ...RESOURCE_SCOPE_RULES,
      ...getDeploymentResourceScopeRules(),
    ].find(({ prefix }) =>
      path.startsWith(prefix),
    );
    if (!rule) return;

    const isRead = READ_METHODS.has(request.method.toUpperCase());
    const requiredScope = isRead ? rule.readScope : rule.writeScope;

    if (!requiredScope) {
      throw new ForbiddenException(
        'OAuth bearer tokens cannot write this resource',
      );
    }

    const requiredScopes = Array.isArray(requiredScope)
      ? requiredScope
      : [requiredScope];
    if (!requiredScopes.some((scope) => identity.scopes.includes(scope))) {
      throw new ForbiddenException(
        `OAuth scope required: ${requiredScopes.join(' or ')}`,
      );
    }
  }

  private assertPublicDemoAccess(
    context: ExecutionContext,
  ): PublicDemoCapability {
    const capability = this.reflector.getAllAndOverride<PublicDemoCapability>(
      PUBLIC_DEMO_ACCESS_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (capability) return capability;
    throw new ForbiddenException({
      code: PUBLIC_DEMO_READ_ONLY_CODE,
      message: PUBLIC_DEMO_READ_ONLY_CODE,
    });
  }

  private toOAuthSession(identity: OAuthBearerIdentity): UserSession {
    const now = new Date();
    return {
      user: {
        ...identity.user,
        emailVerified: identity.user.emailVerified,
        image: null,
        createdAt: now,
        updatedAt: now,
      },
      session: {
        id: `oauth:${identity.clientId ?? 'mobile'}`,
        token: '',
        userId: identity.user.id,
        expiresAt: now,
        createdAt: now,
        updatedAt: now,
      },
    } as UserSession;
  }
}
