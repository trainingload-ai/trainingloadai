import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type AuthRateLimitDatabase = {
  $queryRaw(query: Prisma.Sql): Promise<unknown>;
};

type BetterAuthRateLimitValue = {
  key: string;
  count: number;
  lastRequest: number;
};

export type BetterAuthRateLimitDatabase = AuthRateLimitDatabase & {
  authRateLimit: {
    findUnique(args: {
      where: { key: string };
      select: { key: true; count: true; lastRequest: true };
    }): Promise<{
      key: string;
      count: number;
      lastRequest: bigint;
    } | null>;
  };
};

const BETTER_AUTH_RATE_LIMIT_SNAPSHOT = Symbol(
  'better-auth-rate-limit-snapshot',
);

type BetterAuthRateLimitValueWithSnapshot = BetterAuthRateLimitValue & {
  [BETTER_AUTH_RATE_LIMIT_SNAPSHOT]?: {
    count: number;
    lastRequest: number;
  };
};

export type BetterAuthRateLimitStorage = {
  get(key: string): Promise<BetterAuthRateLimitValue | null>;
  set(
    key: string,
    value: BetterAuthRateLimitValue,
    update?: boolean,
  ): Promise<void>;
};

/**
 * Better Auth's built-in database storage performs `get -> create/update`,
 * which races under concurrent requests. Keep its public storage contract but
 * make every response count an atomic PostgreSQL upsert.
 *
 * A private snapshot travels from `get` to `set` through Better Auth's object
 * spread. It lets the SQL distinguish the first reset after an expired window
 * from another concurrent request that must increment the newly reset bucket.
 */
export function createBetterAuthRateLimitStorage(
  prisma: BetterAuthRateLimitDatabase,
  onSetError?: (error: unknown) => void,
): BetterAuthRateLimitStorage {
  return {
    async get(key) {
      const row = await prisma.authRateLimit.findUnique({
        where: { key },
        select: { key: true, count: true, lastRequest: true },
      });
      if (!row) return null;
      const lastRequest = Number(row.lastRequest);
      return {
        key: row.key,
        count: row.count,
        lastRequest,
        [BETTER_AUTH_RATE_LIMIT_SNAPSHOT]: {
          count: row.count,
          lastRequest,
        },
      };
    },

    async set(key, value, update) {
      const snapshot = (value as BetterAuthRateLimitValueWithSnapshot)[
        BETTER_AUTH_RATE_LIMIT_SNAPSHOT
      ];
      const resetRequested =
        update === true && value.count === 1 && snapshot != null;
      const expectedCount = snapshot?.count ?? -1;
      const expectedLastRequest = snapshot?.lastRequest ?? -1;
      const nextLastRequest = Math.trunc(value.lastRequest);

      try {
        await prisma.$queryRaw(
          Prisma.sql`
            INSERT INTO "t_auth_rate_limits" ("id", "key", "count", "last_request")
            VALUES (${randomUUID()}, ${key}, 1, ${BigInt(nextLastRequest)})
            ON CONFLICT ("key") DO UPDATE SET
              "count" = CASE
                WHEN ${resetRequested}
                  AND "t_auth_rate_limits"."count" = ${expectedCount}
                  AND "t_auth_rate_limits"."last_request" = ${BigInt(expectedLastRequest)}
                  THEN 1
                ELSE "t_auth_rate_limits"."count" + 1
              END,
              "last_request" = CASE
                WHEN ${resetRequested}
                  AND "t_auth_rate_limits"."count" = ${expectedCount}
                  AND "t_auth_rate_limits"."last_request" = ${BigInt(expectedLastRequest)}
                  THEN ${BigInt(nextLastRequest)}
                ELSE GREATEST(
                  "t_auth_rate_limits"."last_request",
                  ${BigInt(nextLastRequest)}
                )
              END
            RETURNING "count", "last_request"
          `,
        );
      } catch (error) {
        // Match Better Auth's existing fail-open behavior: authentication must
        // not fail only because its defensive rate-limit persistence failed.
        onSetError?.(error);
      }
    },
  };
}

/**
 * Consume one shared authentication rate-limit bucket.
 *
 * The explicit id is required because Better Auth's rate-limit schema uses a
 * generated primary key while the custom limiters upsert by their stable key.
 * Reusing the key as the id keeps inserts deterministic and conflict-safe.
 */
export async function consumeAuthRateLimit(
  prisma: AuthRateLimitDatabase,
  key: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const rows = (await prisma.$queryRaw(
    Prisma.sql`
      INSERT INTO "t_auth_rate_limits" ("id", "key", "count", "last_request")
      VALUES (${key}, ${key}, 1, ${BigInt(now)})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "t_auth_rate_limits"."last_request" <= ${BigInt(windowStart)}
            THEN 1
          ELSE "t_auth_rate_limits"."count" + 1
        END,
        "last_request" = CASE
          WHEN "t_auth_rate_limits"."last_request" <= ${BigInt(windowStart)}
            THEN ${BigInt(now)}
          ELSE "t_auth_rate_limits"."last_request"
        END
      RETURNING "count"
    `,
  )) as Array<{ count: number }>;
  return (rows[0]?.count ?? limit + 1) <= limit;
}
