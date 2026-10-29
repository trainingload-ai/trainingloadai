import { describe, expect, it, jest } from '@jest/globals';

jest.mock('better-auth/api', () => ({
  APIError: class APIError extends Error {
    statusCode: number;

    constructor(status: string, body: { message?: string }) {
      super(body.message);
      this.statusCode = status === 'TOO_MANY_REQUESTS' ? 429 : 500;
    }
  },
}));

import { assertEmailLoginAllowed } from '../login-rate-limit';

describe('assertEmailLoginAllowed', () => {
  it('登录时同时消费 IP 与邮箱桶', async () => {
    const previous = process.env.AUTH_RATE_LIMIT_ENABLED;
    process.env.AUTH_RATE_LIMIT_ENABLED = 'true';
    const prisma = {
      $queryRaw: jest
        .fn<() => Promise<Array<{ count: number }>>>()
        .mockResolvedValue([{ count: 1 }]),
    };
    try {
      await assertEmailLoginAllowed(
        prisma,
        '/sign-in/email',
        { email: 'runner@example.com' },
        new Headers({ 'x-trainingload-client-ip': '192.0.2.10' }),
      );
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    } finally {
      if (previous === undefined) delete process.env.AUTH_RATE_LIMIT_ENABLED;
      else process.env.AUTH_RATE_LIMIT_ENABLED = previous;
    }
  });

  it('超限返回 Better Auth 429', async () => {
    const previous = process.env.AUTH_RATE_LIMIT_ENABLED;
    process.env.AUTH_RATE_LIMIT_ENABLED = 'true';
    const prisma = {
      $queryRaw: jest
        .fn<() => Promise<Array<{ count: number }>>>()
        .mockResolvedValue([{ count: 4 }]),
    };
    try {
      await expect(
        assertEmailLoginAllowed(
          prisma,
          '/sign-in/email',
          { email: 'runner@example.com' },
          new Headers(),
        ),
      ).rejects.toMatchObject({ statusCode: 429 });
    } finally {
      if (previous === undefined) delete process.env.AUTH_RATE_LIMIT_ENABLED;
      else process.env.AUTH_RATE_LIMIT_ENABLED = previous;
    }
  });
});
