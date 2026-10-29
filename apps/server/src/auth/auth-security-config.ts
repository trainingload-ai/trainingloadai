type Environment = NodeJS.ProcessEnv;

function positiveInteger(
  env: Environment,
  key: string,
  fallback: number,
): number {
  const parsed = Number(env[key]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanValue(
  env: Environment,
  key: string,
  fallback: boolean,
): boolean {
  const value = env[key]?.trim().toLowerCase();
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return fallback;
}

export type AuthSecurityConfig = {
  enabled: boolean;
  betterAuthRateLimit: {
    enabled: boolean;
    windowSeconds: number;
    maxRequests: number;
  };
  otpSend: {
    ip: { limit: number; windowMs: number };
    email: { limit: number; windowMs: number };
  };
};

/**
 * 认证安全阈值的唯一配置入口。
 *
 * Better Auth 在开发环境默认关闭限流。这里保留生产默认开启，同时允许
 * E2E 通过 AUTH_RATE_LIMIT_ENABLED=true 显式开启，避免本地测试产生假阳性。
 */
export function readAuthSecurityConfig(
  env: Environment = process.env,
): AuthSecurityConfig {
  const production = env.NODE_ENV === 'production';
  return {
    enabled: booleanValue(env, 'AUTH_RATE_LIMIT_ENABLED', production),
    betterAuthRateLimit: {
      enabled: booleanValue(env, 'AUTH_RATE_LIMIT_ENABLED', production),
      windowSeconds: positiveInteger(
        env,
        'AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS',
        10,
      ),
      maxRequests: positiveInteger(env, 'AUTH_LOGIN_RATE_LIMIT_MAX', 3),
    },
    otpSend: {
      ip: {
        limit: positiveInteger(env, 'AUTH_OTP_SEND_IP_LIMIT', 10),
        windowMs: positiveInteger(
          env,
          'AUTH_OTP_SEND_IP_WINDOW_MS',
          60_000,
        ),
      },
      email: {
        limit: positiveInteger(env, 'AUTH_OTP_SEND_EMAIL_LIMIT', 3),
        windowMs: positiveInteger(
          env,
          'AUTH_OTP_SEND_EMAIL_WINDOW_MS',
          10 * 60_000,
        ),
      },
    },
  };
}
