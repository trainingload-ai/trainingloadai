import { describe, expect, it, jest } from '@jest/globals';
import { SelfHostInitializationState } from '@prisma/client';
import { verifyPassword } from '@better-auth/utils/password';
import {
  OwnerRecoveryError,
  recoverSelfHostOwnerPassword,
} from './self-host-owner-recovery';
import { NUMERIC_ADVISORY_XACT_LOCK_SQL } from '@/prisma/numeric-advisory-lock';

const userAccess = {
  users: (tx: { t_user: unknown }) => tx.t_user,
};

describe('recoverSelfHostOwnerPassword', () => {
  it('changes only the initialized owner credential and revokes sessions', async () => {
    let storedHash = '';
    const tx = {
      $executeRawUnsafe: jest.fn(async () => 1),
      selfHostInstance: {
        findUnique: jest.fn(async () => ({
          state: SelfHostInitializationState.READY,
          ownerUserId: 'owner-id',
          owner: { email: 'owner@example.com' },
        })),
      },
      t_user_accounts: {
        updateMany: jest.fn(async (args: { data: { password: string } }) => {
          storedHash = args.data.password;
          return { count: 1 };
        }),
        create: jest.fn(async () => ({})),
      },
      t_user: {
        findUnique: jest.fn(async () => null),
        update: jest.fn(async () => ({})),
      },
      t_user_sessions: { deleteMany: jest.fn(async () => ({ count: 3 })) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      recoverSelfHostOwnerPassword({
        prisma: prisma as never,
        users: userAccess as never,
        email: 'OWNER@example.com',
        password: 'new-password-42',
      }),
    ).resolves.toEqual({
      schemaVersion: 1,
      operation: 'self-host-owner-password-recovery',
      status: 'completed',
      ownerEmail: 'owner@example.com',
      revokedSessions: 3,
    });
    expect(storedHash).not.toBe('new-password-42');
    await expect(verifyPassword(storedHash, 'new-password-42')).resolves.toBe(
      true,
    );
    expect(tx.t_user_accounts.create).not.toHaveBeenCalled();
    expect(tx.t_user_sessions.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'owner-id' },
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      NUMERIC_ADVISORY_XACT_LOCK_SQL,
      7_257_209_788_430_862,
    );
  });

  it('fails closed for a different email or an uninitialized instance', async () => {
    const findUnique = jest.fn(async () => ({
      state: SelfHostInitializationState.READY,
      ownerUserId: 'owner-id',
      owner: { email: 'owner@example.com' },
    }));
    const tx = {
      $executeRawUnsafe: jest.fn(async () => 1),
      selfHostInstance: { findUnique },
      t_user_accounts: { updateMany: jest.fn(), create: jest.fn() },
      t_user: { findUnique: jest.fn(), update: jest.fn() },
      t_user_sessions: { deleteMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      recoverSelfHostOwnerPassword({
        prisma: prisma as never,
        users: userAccess as never,
        email: 'other@example.com',
        password: 'new-password-42',
      }),
    ).rejects.toMatchObject({ code: 'SELF_HOST_OWNER_MISMATCH' });
    expect(tx.t_user_accounts.updateMany).not.toHaveBeenCalled();

    findUnique.mockResolvedValueOnce({
      state: SelfHostInitializationState.PENDING,
      ownerUserId: null,
      owner: null,
    } as never);
    await expect(
      recoverSelfHostOwnerPassword({
        prisma: prisma as never,
        users: userAccess as never,
        email: 'owner@example.com',
        password: 'new-password-42',
      }),
    ).rejects.toBeInstanceOf(OwnerRecoveryError);
  });

  it('promotes a passwordless local Owner to an email credential for network access', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(async () => 1),
      selfHostInstance: {
        findUnique: jest.fn(async () => ({
          state: SelfHostInitializationState.READY,
          ownerUserId: 'owner-id',
          owner: {
            email:
              'owner-20ca8c58-e3fb-4a9f-889a-1fce4539331a@self-host.invalid',
          },
        })),
      },
      t_user: {
        findUnique: jest.fn(async () => null),
        update: jest.fn(async () => ({})),
      },
      t_user_accounts: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(async () => ({})),
      },
      t_user_sessions: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      recoverSelfHostOwnerPassword({
        prisma: prisma as never,
        users: userAccess as never,
        email: 'owner@example.com',
        password: 'network-password-42',
      }),
    ).resolves.toMatchObject({ ownerEmail: 'owner@example.com' });
    expect(tx.t_user.update).toHaveBeenCalledWith({
      where: { id: 'owner-id' },
      data: expect.objectContaining({
        email: 'owner@example.com',
        emailVerified: true,
      }),
    });
    expect(tx.t_user_accounts.create).toHaveBeenCalled();
  });
});
