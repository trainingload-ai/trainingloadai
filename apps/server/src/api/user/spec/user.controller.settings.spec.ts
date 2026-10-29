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
  const settings = {
    upsert: jest.fn(async () => undefined),
  };
  const controller = new UsersController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { settings: () => settings } as never,
    {} as never,
  );

  return { controller, settings };
}

describe('UsersController.updateUserSetting', () => {
  it('rejects writes to settings outside the public Core contract', async () => {
    const { controller, settings } = createHarness();

    await expect(
      controller.updateUserSetting(
        'user-1',
        'ai_plan',
        { value: 'PLUS' },
        undefined,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 10003,
        message: 'This setting is not user-configurable',
      },
    });
    expect(settings.upsert).not.toHaveBeenCalled();
  });
});
