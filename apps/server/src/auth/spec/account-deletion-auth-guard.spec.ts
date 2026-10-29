import { describe, expect, it, jest } from '@jest/globals';

jest.mock('better-auth/api', () => ({
  APIError: class APIError extends Error {
    body: Record<string, unknown>;

    constructor(_status: string, body: Record<string, unknown>) {
      super(String(body.message ?? 'Authentication failed'));
      this.body = body;
    }
  },
}));

import { assertEmailAuthAccountNotBeingDeleted } from '../account-deletion-auth-guard';

describe('assertEmailAuthAccountNotBeingDeleted', () => {
  it.each([
    '/sign-in/email',
    '/sign-up/email',
    '/request-password-reset',
    '/email-otp/send-verification-otp',
    '/email-otp/request-password-reset',
    '/email-otp/reset-password',
    '/forget-password/email-otp',
  ])(
    'rejects %s while the account deletion job is in progress',
    async (path) => {
      const prisma = {
        t_user: {
          findUnique: jest.fn(async () => ({
            accountDeletionRequestedAt: new Date('2026-08-10T07:13:20.884Z'),
          })),
        },
      };

      await expect(
        assertEmailAuthAccountNotBeingDeleted(prisma, path, {
          email: ' Runner@Example.com ',
        }),
      ).rejects.toMatchObject({
        body: {
          code: 'ACCOUNT_DELETION_IN_PROGRESS',
          message: 'ACCOUNT_DELETION_IN_PROGRESS',
        },
      });
      expect(prisma.t_user.findUnique).toHaveBeenCalledWith({
        where: { email: 'runner@example.com' },
        select: { accountDeletionRequestedAt: true },
      });
    },
  );

  it('allows a normal account to continue authentication', async () => {
    const prisma = {
      t_user: {
        findUnique: jest.fn(async () => ({
          accountDeletionRequestedAt: null,
        })),
      },
    };

    await expect(
      assertEmailAuthAccountNotBeingDeleted(prisma, '/sign-in/email', {
        email: 'runner@example.com',
      }),
    ).resolves.toBeUndefined();
  });
});
