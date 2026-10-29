import {
  Prisma,
  PrismaClient,
  SelfHostInitializationState,
} from '@prisma/client';
import { hashPassword } from '@better-auth/utils/password';
import { randomUUID } from 'node:crypto';
import { passwordMeetsPolicy } from '@/auth/password-policy';
import { acquireNumericAdvisoryXactLock } from '@/prisma/numeric-advisory-lock';
import { SELF_HOST_INSTANCE_ID } from './self-host-bootstrap.types';
import type { UserQueryService } from '@/api/user/user-query.service';

const OWNER_RECOVERY_LOCK_ID = 7_257_209_788_430_862;

export type OwnerPasswordRecoveryResult = {
  schemaVersion: 1;
  operation: 'self-host-owner-password-recovery';
  status: 'completed';
  ownerEmail: string;
  revokedSessions: number;
};

export type OwnerRecoveryErrorCode =
  | 'SELF_HOST_NOT_INITIALIZED'
  | 'SELF_HOST_OWNER_MISMATCH'
  | 'SELF_HOST_RECOVERY_EMAIL_IN_USE'
  | 'SELF_HOST_OWNER_MISSING'
  | 'SELF_HOST_RECOVERY_PASSWORD_INVALID';

export class OwnerRecoveryError extends Error {
  constructor(readonly code: OwnerRecoveryErrorCode) {
    super(code);
    this.name = 'OwnerRecoveryError';
  }
}

export async function recoverSelfHostOwnerPassword(args: {
  prisma: PrismaClient;
  users: Pick<UserQueryService, 'users'>;
  email: string;
  password: string;
}): Promise<OwnerPasswordRecoveryResult> {
  const email = args.email.trim().toLowerCase();
  if (!passwordMeetsPolicy(args.password)) {
    throw new OwnerRecoveryError('SELF_HOST_RECOVERY_PASSWORD_INVALID');
  }
  const passwordHash = await hashPassword(args.password);

  return await args.prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await acquireNumericAdvisoryXactLock(tx, OWNER_RECOVERY_LOCK_ID);
      const instance = await tx.selfHostInstance.findUnique({
        where: { id: SELF_HOST_INSTANCE_ID },
        select: {
          state: true,
          ownerUserId: true,
          owner: { select: { email: true } },
        },
      });
      if (
        !instance ||
        instance.state !== SelfHostInitializationState.READY ||
        !instance.ownerUserId
      ) {
        throw new OwnerRecoveryError('SELF_HOST_NOT_INITIALIZED');
      }
      if (!instance.owner) {
        throw new OwnerRecoveryError('SELF_HOST_OWNER_MISSING');
      }
      const currentEmail = instance.owner.email.toLowerCase();
      const passwordlessLocalOwner =
        /^owner-[0-9a-f-]+@self-host\.invalid$/.test(currentEmail);
      if (currentEmail !== email && !passwordlessLocalOwner) {
        throw new OwnerRecoveryError('SELF_HOST_OWNER_MISMATCH');
      }
      if (passwordlessLocalOwner && currentEmail !== email) {
        const existing = await args.users.users(tx).findUnique({
          where: { email },
          select: { id: true },
        });
        if (existing && existing.id !== instance.ownerUserId) {
          throw new OwnerRecoveryError('SELF_HOST_RECOVERY_EMAIL_IN_USE');
        }
        await args.users.users(tx).update({
          where: { id: instance.ownerUserId },
          data: { email, emailVerified: true, updatedAt: new Date() },
        });
      }

      const credentialAccounts = await tx.t_user_accounts.updateMany({
        where: {
          userId: instance.ownerUserId,
          providerId: 'credential',
        },
        data: { password: passwordHash, updatedAt: new Date() },
      });
      if (credentialAccounts.count === 0) {
        const now = new Date();
        await tx.t_user_accounts.create({
          data: {
            id: randomUUID(),
            accountId: instance.ownerUserId,
            providerId: 'credential',
            userId: instance.ownerUserId,
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      const sessions = await tx.t_user_sessions.deleteMany({
        where: { userId: instance.ownerUserId },
      });

      return {
        schemaVersion: 1 as const,
        operation: 'self-host-owner-password-recovery' as const,
        status: 'completed' as const,
        ownerEmail: email,
        revokedSessions: sessions.count,
      };
    },
  );
}
