import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import { checkLocalBrowserRequest } from '@/self-host/self-host-local-access-policy';

type SelfHostLocalOwnerPluginOptions = {
  getOwnerUserId: () => Promise<string | null>;
};

export function selfHostLocalOwner(
  options: SelfHostLocalOwnerPluginOptions,
): BetterAuthPlugin {
  return {
    id: 'self-host-local-owner',
    endpoints: {
      selfHostLocalOwner: createAuthEndpoint(
        '/self-host/local-owner',
        {
          method: 'POST',
          body: z.object({}),
          requireHeaders: true,
        },
        async (ctx) => {
          const access = checkLocalBrowserRequest(ctx.headers);
          if ('reason' in access) {
            throw new APIError(
              access.reason === 'LOCAL_ACCESS_DISABLED'
                ? 'NOT_FOUND'
                : 'FORBIDDEN',
              {
                code:
                  access.reason === 'LOCAL_ACCESS_DISABLED'
                    ? 'SELF_HOST_LOCAL_ACCESS_DISABLED'
                    : 'SELF_HOST_LOCAL_ACCESS_FORBIDDEN',
                message:
                  access.reason === 'LOCAL_ACCESS_DISABLED'
                    ? 'SELF_HOST_LOCAL_ACCESS_DISABLED'
                    : 'SELF_HOST_LOCAL_ACCESS_FORBIDDEN',
              },
            );
          }

          const ownerUserId = await options.getOwnerUserId();
          if (!ownerUserId) {
            throw new APIError('CONFLICT', {
              code: 'SELF_HOST_BOOTSTRAP_REQUIRED',
              message: 'SELF_HOST_BOOTSTRAP_REQUIRED',
            });
          }
          const user =
            await ctx.context.internalAdapter.findUserById(ownerUserId);
          if (!user) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              code: 'SELF_HOST_OWNER_MISSING',
              message: 'SELF_HOST_OWNER_MISSING',
            });
          }
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
            false,
          );
          await setSessionCookie(ctx, { session, user }, false);
          return ctx.json({
            state: 'READY',
            owner: { name: user.name },
          });
        },
      ),
    },
    rateLimit: [
      {
        window: 60,
        max: 10,
        pathMatcher: (path) => path === '/self-host/local-owner',
      },
    ],
  };
}
