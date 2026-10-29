import { describe, expect, it, jest } from '@jest/globals';
import type { Prisma } from '@prisma/client';
import {
  consumeAuthRateLimit,
  createBetterAuthRateLimitStorage,
  type BetterAuthRateLimitDatabase,
} from '../auth-rate-limit-store';

function createBetterAuthDatabase(
  row: {
    key: string;
    count: number;
    lastRequest: bigint;
  } | null,
  queryRaw: (query: Prisma.Sql) => Promise<unknown>,
): BetterAuthRateLimitDatabase {
  return {
    authRateLimit: {
      findUnique: jest.fn(() => Promise.resolve(row)),
    },
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
  it('新 bucket 使用原子 upsert，冲突时递增而不是再次 create', async () => {
    const queryRaw = jest.fn((query: Prisma.Sql) => {
      const sql = query.strings.join('');
      expect(sql).toContain('ON CONFLICT ("key") DO UPDATE SET');
      expect(sql).toContain('"t_auth_rate_limits"."count" + 1');
      expect(query.values).toContain('127.0.0.1|/get-session');
      return Promise.resolve([{ count: 1, last_request: BigInt(1_000) }]);
    });
    const storage = createBetterAuthRateLimitStorage(
      createBetterAuthDatabase(null, queryRaw),
    );

    await expect(
      storage.set(
        '127.0.0.1|/get-session',
        {
          key: '127.0.0.1|/get-session',
          count: 1,
          lastRequest: 1_000,
        },
        false,
      ),
    ).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('窗口过期并发重置时携带读取快照供 SQL compare-and-set', async () => {
    const queryRaw = jest.fn((query: Prisma.Sql) => {
      const sql = query.strings.join('');
      expect(sql).toContain('"t_auth_rate_limits"."count" =');
      expect(sql).toContain('"t_auth_rate_limits"."last_request" =');
      expect(query.values).toContain(true);
      expect(query.values).toContain(5);
      expect(query.values).toContain(BigInt(900));
      expect(query.values).toContain(BigInt(2_000));
      return Promise.resolve([{ count: 1, last_request: BigInt(2_000) }]);
    });
    const storage = createBetterAuthRateLimitStorage(
      createBetterAuthDatabase(
        {
          key: '127.0.0.1|/sign-out',
          count: 5,
          lastRequest: BigInt(900),
        },
        queryRaw,
      ),
    );
    const current = await storage.get('127.0.0.1|/sign-out');

    expect(current).toEqual(
      expect.objectContaining({
        key: '127.0.0.1|/sign-out',
        count: 5,
        lastRequest: 900,
      }),
    );
    await storage.set(
      '127.0.0.1|/sign-out',
      { ...current!, count: 1, lastRequest: 2_000 },
      true,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('限流持久化失败时记录错误并保持认证请求 fail-open', async () => {
    const persistenceError = new Error('database unavailable');
    const onSetError = jest.fn();
    const storage = createBetterAuthRateLimitStorage(
      createBetterAuthDatabase(null, () => Promise.reject(persistenceError)),
      onSetError,
    );

    await expect(
      storage.set(
        '127.0.0.1|/get-session',
        {
          key: '127.0.0.1|/get-session',
          count: 1,
          lastRequest: 1_000,
        },
        false,
      ),
    ).resolves.toBeUndefined();
    expect(onSetError).toHaveBeenCalledWith(persistenceError);
  });
});
