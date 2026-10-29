import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { readAuthSecurityConfig } from './auth-security-config';
import { consumeAuthRateLimit } from './auth-rate-limit-store';

export function authRateLimitKey(namespace: string, subject: string): string {
  const digest = createHash('sha256')
    .update(subject.trim().toLowerCase())
    .digest('hex');
  return `custom:${namespace}:${digest}`;
}

function requestIp(request: Request): string {
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

@Injectable()
export class AuthRateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async assertOtpSendAllowed(request: Request, email: string): Promise<void> {
    const security = readAuthSecurityConfig();
    if (!security.enabled) return;
    const config = security.otpSend;
    const checks = [
      {
        key: authRateLimitKey('otp-send-ip', requestIp(request)),
        ...config.ip,
      },
      {
        key: authRateLimitKey('otp-send-email', email),
        ...config.email,
      },
    ];

    for (const check of checks) {
      const allowed = await consumeAuthRateLimit(
        this.prisma,
        check.key,
        check.limit,
        check.windowMs,
      );
      if (!allowed) {
        throw new HttpException(
          {
            code: 'AUTH_RATE_LIMITED',
            messageKey: 'common.error.too_many_requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }
}
