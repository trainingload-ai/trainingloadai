import { describe, expect, it, jest } from '@jest/globals';
import type { Prisma } from '@prisma/client';
import {
  consumeAuthRateLimit,
  createBetterAuthRateLimitStorage,
  type BetterAuthRateLimitDatabase,
} from '../auth-rate-limit-store';

function createBetterAuthDatabase(
  queryRaw: (query: Prisma.Sql) => Promise<unknown>,
): BetterAuthRateLimitDatabase {
  return {
    $queryRaw: jest.fn(queryRaw),
  };
}

describe('consumeAuthRateLimit', () => {
  it('为 Better Auth 限流表同时写入必填 id 和稳定 key', async () => {
    const queryRaw = jest.fn((query: Prisma.Sql) => {
      expect(query.strings.join('')).toContain(
        'INSERT INTO "t_auth_rate_limits" ("id", "key", "count", "last_request")',
      );
      expect(query.values[0]).toBe('custom:login:test');
      expect(query.values[1]).toBe('custom:login:test');
      return Promise.resolve([{ count: 1 }]);
    });

    await expect(
      consumeAuthRateLimit(
        { $queryRaw: queryRaw },
        'custom:login:test',
        3,
        60_000,
      ),
    ).resolves.toBe(true);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('createBetterAuthRateLimitStorage', () => {
  it('以单次原子 consume 创建或递增 bucket', async () => {
    const queryRaw = jest.fn((query: Prisma.Sql) => {
      const sql = query.strings.join('');
      expect(sql).toContain('ON CONFLICT ("key") DO UPDATE SET');
      expect(sql).toContain('"t_auth_rate_limits"."count" + 1');
      expect(query.values).toContain('127.0.0.1|/get-session');
      return Promise.resolve([{ count: 1, last_request: BigInt(1_000) }]);
    });
    const storage = createBetterAuthRateLimitStorage(
      createBetterAuthDatabase(queryRaw),
    );
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);

    try {
      await expect(
        storage.consume('127.0.0.1|/get-session', {
          window: 60,
          max: 3,
        }),
      ).resolves.toEqual({ allowed: true, retryAfter: null });
      expect(queryRaw).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });

  it('达到上限时返回剩余重试秒数且不延长窗口', async () => {
    const queryRaw = jest.fn((query: Prisma.Sql) => {
      const sql = query.strings.join('');
      expect(sql).toContain('ELSE "t_auth_rate_limits"."count" + 1');
      expect(sql).toContain('ELSE "t_auth_rate_limits"."last_request"');
      return Promise.resolve([{ count: 4, last_request: BigInt(1_000) }]);
    });
    const storage = createBetterAuthRateLimitStorage(
      createBetterAuthDatabase(queryRaw),
    );
    const now = jest.spyOn(Date, 'now').mockReturnValue(2_000);

    try {
      await expect(
        storage.consume('127.0.0.1|/sign-out', {
          window: 5,
          max: 3,
        }),
      ).resolves.toEqual({ allowed: false, retryAfter: 4 });
      expect(queryRaw).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });

  it('限流持久化失败时记录错误并保持认证请求 fail-open', async () => {
    const persistenceError = new Error('database unavailable');
    const onSetError = jest.fn();
    const storage = createBetterAuthRateLimitStorage(
      createBetterAuthDatabase(() => Promise.reject(persistenceError)),
      onSetError,
    );

    await expect(
      storage.consume('127.0.0.1|/get-session', {
        window: 60,
        max: 3,
      }),
    ).resolves.toEqual({ allowed: true, retryAfter: null });
    expect(onSetError).toHaveBeenCalledWith(persistenceError);
  });
});
