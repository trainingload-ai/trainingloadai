import { describe, expect, it, jest, beforeEach, afterAll } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import {
  AuthRateLimitService,
  authRateLimitKey,
} from '../auth-rate-limit.service';

describe('AuthRateLimitService', () => {
  const previousEnabled = process.env.AUTH_RATE_LIMIT_ENABLED;
  const request = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as never;

  beforeEach(() => {
    process.env.AUTH_RATE_LIMIT_ENABLED = 'true';
  });

  afterAll(() => {
    if (previousEnabled === undefined) delete process.env.AUTH_RATE_LIMIT_ENABLED;
    else process.env.AUTH_RATE_LIMIT_ENABLED = previousEnabled;
  });

  it('key 不保存邮箱或 IP 明文，且大小写归一', () => {
    const lower = authRateLimitKey('otp-send-email', 'runner@example.com');
    const upper = authRateLimitKey('otp-send-email', ' Runner@Example.com ');
    expect(lower).toBe(upper);
    expect(lower).not.toContain('runner@example.com');
  });

  it('同时消费 IP 与邮箱两个桶', async () => {
    const prisma = {
      $queryRaw: jest
        .fn<(query: unknown) => Promise<Array<{ count: number }>>>()
        .mockResolvedValue([{ count: 1 }]),
    };
    const service = new AuthRateLimitService(prisma as never);
    await service.assertOtpSendAllowed(request, 'runner@example.com');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    const firstQuery = prisma.$queryRaw.mock.calls[0]?.[0] as unknown as {
      values: unknown[];
    };
    expect(firstQuery.values[0]).toBe(firstQuery.values[1]);
  });

  it('任一桶超限时返回 429', async () => {
    const prisma = {
      $queryRaw: jest
        .fn<() => Promise<Array<{ count: number }>>>()
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([{ count: 4 }]),
    };
    const service = new AuthRateLimitService(prisma as never);
    await expect(
      service.assertOtpSendAllowed(request, 'runner@example.com'),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });
});
