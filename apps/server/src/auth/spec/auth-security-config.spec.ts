import { describe, expect, it } from '@jest/globals';
import { readAuthSecurityConfig } from '../auth-security-config';

describe('readAuthSecurityConfig', () => {
  it('生产环境默认开启登录限流，开发环境默认关闭', () => {
    expect(readAuthSecurityConfig({ NODE_ENV: 'production' })).toMatchObject({
      enabled: true,
      betterAuthRateLimit: { enabled: true, windowSeconds: 10, maxRequests: 3 },
    });
    expect(readAuthSecurityConfig({ NODE_ENV: 'development' })).toMatchObject({
      enabled: false,
      betterAuthRateLimit: { enabled: false },
    });
  });

  it('E2E 可以显式开启并收紧阈值', () => {
    expect(
      readAuthSecurityConfig({
        NODE_ENV: 'test',
        AUTH_RATE_LIMIT_ENABLED: 'true',
        AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: '2',
        AUTH_LOGIN_RATE_LIMIT_MAX: '1',
        AUTH_OTP_SEND_IP_LIMIT: '2',
        AUTH_OTP_SEND_EMAIL_LIMIT: '1',
      }),
    ).toEqual({
      enabled: true,
      betterAuthRateLimit: {
        enabled: true,
        windowSeconds: 2,
        maxRequests: 1,
      },
      otpSend: {
        ip: { limit: 2, windowMs: 60_000 },
        email: { limit: 1, windowMs: 600_000 },
      },
    });
  });

  it('忽略无效阈值，避免意外关闭保护', () => {
    const config = readAuthSecurityConfig({
      NODE_ENV: 'production',
      AUTH_LOGIN_RATE_LIMIT_MAX: '0',
      AUTH_OTP_SEND_IP_WINDOW_MS: 'not-a-number',
    });
    expect(config.betterAuthRateLimit.maxRequests).toBe(3);
    expect(config.otpSend.ip.windowMs).toBe(60_000);
  });
});
