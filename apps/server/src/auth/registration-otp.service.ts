import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export type RegistrationOtpResult =
  | 'valid'
  | 'invalid'
  | 'exhausted'
  | 'missing';

@Injectable()
export class RegistrationOtpService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 对同一邮箱获取 PostgreSQL 事务级 advisory lock，使“读取次数、递增/失效、
   * 正确码消费”成为一个串行操作。这样并发错误尝试不能丢失计数，同一 OTP 也
   * 不可能被两个注册请求同时消费。
   */
  async consume(email: string, submittedOtp: string): Promise<RegistrationOtpResult> {
    const identifier = `email-verification-otp-${email.toLowerCase()}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`
          SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0)) IS NULL
            AS "lockAcquired"
        `,
      );

      const verification = await tx.t_user_verifications.findFirst({
        where: { identifier, expiresAt: { gt: new Date() } },
        orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
      });
      if (!verification) return 'missing';

      const [storedOtp, attemptsValue] = verification.value.split(':');
      const attempts = Number.parseInt(attemptsValue || '0', 10);
      if (!Number.isInteger(attempts) || attempts >= 3) {
        await tx.t_user_verifications.deleteMany({ where: { identifier } });
        return 'exhausted';
      }

      if (storedOtp === submittedOtp) {
        await tx.t_user_verifications.deleteMany({ where: { identifier } });
        return 'valid';
      }

      const nextAttempts = attempts + 1;
      if (nextAttempts >= 3) {
        await tx.t_user_verifications.deleteMany({ where: { identifier } });
        return 'exhausted';
      }

      await tx.t_user_verifications.update({
        where: { id: verification.id },
        data: { value: `${storedOtp}:${nextAttempts}` },
      });
      return 'invalid';
    });
  }
}
