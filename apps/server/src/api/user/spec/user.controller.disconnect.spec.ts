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

function createHarness() {
  const authService = {
    api: {
      listUserAccounts: jest.fn(async () => [
        {
          id: 'credential-row',
          providerId: 'credential',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'external-row',
          providerId: 'external',
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
        },
      ]),
    },
  };
  const prisma = {
    $executeRaw: jest.fn(),
  };
  const externalDisconnect = {
    disconnect: jest.fn(async () => undefined),
  };
  const controller = new UsersController(
    authService as never,
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    externalDisconnect as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      require: jest.fn(),
    } as never,
  );

  return {
    controller,
    prisma,
    externalDisconnect,
  };
}

describe('UsersController.disconnectAccount external provider flow', () => {
  it('delegates to the external revocation port and skips the local-only delete', async () => {
    const harness = createHarness();

    await expect(
      harness.controller.disconnectAccount(
        'user-1',
        { headers: {} } as never,
        'external',
      ),
    ).resolves.toBe(true);

    expect(harness.externalDisconnect.disconnect).toHaveBeenCalledWith(
      'external',
      'user-1',
      'external-row',
    );
    expect(harness.prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
