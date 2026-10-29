import { ConflictException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../auth', () => ({
  getAuthConfig: jest.fn(),
  sendOtpEmailInternal: jest.fn(),
}));
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: class {},
  Optional: () => () => undefined,
  AllowAnonymous: () => () => undefined,
}));
jest.mock('better-auth/node', () => ({
  fromNodeHeaders: (headers: unknown) => headers,
}));

import { UsersController } from '../user.controller';

function createController(prisma: Record<string, unknown>) {
  const authService = {
    api: {
      createVerificationOTP: jest.fn(),
      sendVerificationOTP: jest.fn(),
      signUpEmail: jest.fn(),
    },
  };
  const authRateLimit = {
    assertOtpSendAllowed: jest.fn(),
  };
  const controller = new UsersController(
    authService as never,
    prisma as never,
    {} as never,
    { t: (key: string) => key } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    authRateLimit as never,
    {} as never,
    {} as never,
    { users: () => (prisma as { t_user: unknown }).t_user } as never,
    {} as never,
  );
  return { authService, controller };
}

function expectDeletionConflict(error: unknown) {
  expect(error).toBeInstanceOf(ConflictException);
  expect((error as ConflictException).getResponse()).toMatchObject({
    code: 'ACCOUNT_DELETION_IN_PROGRESS',
    message: 'ACCOUNT_DELETION_IN_PROGRESS',
  });
}

describe('UsersController account deletion auth state', () => {
  it('rejects registration OTP requests with the deletion-in-progress code', async () => {
    const prisma = {
      t_user: {
        findUnique: jest.fn(async () => ({
          emailVerified: true,
          accountDeletionRequestedAt: new Date(),
        })),
      },
    };
    const { authService, controller } = createController(prisma);

    try {
      await controller.sendVerificationOTP(
        { email: 'runner@example.com', type: 'email-verification' },
        { headers: {} } as never,
      );
      throw new Error('Expected account deletion conflict');
    } catch (error) {
      expectDeletionConflict(error);
    }
    expect(authService.api.createVerificationOTP).not.toHaveBeenCalled();
    expect(authService.api.sendVerificationOTP).not.toHaveBeenCalled();
  });

  it('rejects OTP registration with the deletion-in-progress code', async () => {
    const prisma = {
      t_user: {
        findFirst: jest.fn(async () => ({
          accountDeletionRequestedAt: new Date(),
        })),
      },
    };
    const { authService, controller } = createController(prisma);

    try {
      await controller.registerWithOTP(
        {
          email: 'runner@example.com',
          otp: '123456',
          password: 'runner123',
          name: 'Runner',
        },
        { headers: {} } as never,
      );
      throw new Error('Expected account deletion conflict');
    } catch (error) {
      expectDeletionConflict(error);
    }
    expect(authService.api.signUpEmail).not.toHaveBeenCalled();
  });
});
