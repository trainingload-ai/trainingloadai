import { createHash } from 'node:crypto';
import { APIError } from 'better-auth/api';
import { readAuthSecurityConfig } from './auth-security-config';
import {
  consumeAuthRateLimit,
  type AuthRateLimitDatabase,
} from './auth-rate-limit-store';

function digest(value: string) {
  return createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

function requestIp(headers: Headers | undefined): string {
  if (process.env.NODE_ENV !== 'production') return 'local-e2e';
  // 生产后端不直接暴露，只接受 Caddy 覆盖写入的内部客户端 IP 头，避免客户端
  // 伪造 X-Forwarded-For 绕过按 IP 的登录限流。
  return headers?.get('x-trainingload-client-ip')?.trim() || 'unknown';
}

/** Better Auth 失败响应不会可靠触发其响应计数，因此登录在密码校验前单独计数。 */
export async function assertEmailLoginAllowed(
  prisma: AuthRateLimitDatabase,
  path: string,
  body: unknown,
  headers?: Headers,
) {
  if (path !== '/sign-in/email') return;
  const security = readAuthSecurityConfig();
  if (!security.enabled) return;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  const emailValue = (body as Record<string, unknown>).email;
  if (typeof emailValue !== 'string' || !emailValue.trim()) return;

  const { maxRequests, windowSeconds } = security.betterAuthRateLimit;
  const windowMs = windowSeconds * 1000;
  const keys = [
    `custom:login-ip:${digest(requestIp(headers))}`,
    `custom:login-email:${digest(emailValue)}`,
  ];
  for (const key of keys) {
    if (await consumeAuthRateLimit(prisma, key, maxRequests, windowMs))
      continue;
    throw new APIError('TOO_MANY_REQUESTS', {
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
    });
  }
}
