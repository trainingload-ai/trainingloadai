import { Prisma } from '@prisma/client';
export type AuthRateLimitDatabase = {
  $queryRaw(query: Prisma.Sql): Promise<unknown>;
};

export type BetterAuthRateLimitDatabase = AuthRateLimitDatabase;

export type BetterAuthRateLimitStorage = {
  consume(
    key: string,
    rule: { window: number; max: number },
  ): Promise<{ allowed: boolean; retryAfter: number | null }>;
};

/**
 * Better Auth 1.7 requires one atomic consume operation so concurrent requests
 * cannot all pass the same stale read. Persist the window start and increment
 * every attempt in one PostgreSQL upsert; blocked attempts do not extend the
 * active window.
 */
export function createBetterAuthRateLimitStorage(
  prisma: BetterAuthRateLimitDatabase,
  onConsumeError?: (error: unknown) => void,
): BetterAuthRateLimitStorage {
  return {
    async consume(key, rule) {
      try {
        return await consumeAuthRateLimitBucket(
          prisma,
          key,
          rule.max,
          rule.window * 1_000,
        );
      } catch (error) {
        // Match Better Auth's existing fail-open behavior: authentication must
        // not fail only because its defensive rate-limit persistence failed.
        onConsumeError?.(error);
        return { allowed: true, retryAfter: null };
      }
    },
  };
}

async function consumeAuthRateLimitBucket(
  prisma: AuthRateLimitDatabase,
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const now = Date.now();
  const normalizedLimit = Math.max(0, Math.trunc(limit));
  const normalizedWindowMs = Math.max(1, Math.trunc(windowMs));
  const windowStart = now - normalizedWindowMs;
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
      RETURNING "count", "last_request"
    `,
  )) as Array<{ count: number; last_request: bigint }>;
  const row = rows[0];
  if (!row) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil(normalizedWindowMs / 1_000)),
    };
  }

  const allowed = row.count <= normalizedLimit;
  return {
    allowed,
    retryAfter: allowed
      ? null
      : Math.max(
          1,
          Math.ceil(
            (Number(row.last_request) + normalizedWindowMs - now) / 1_000,
          ),
        ),
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
  return (await consumeAuthRateLimitBucket(prisma, key, limit, windowMs))
    .allowed;
}
