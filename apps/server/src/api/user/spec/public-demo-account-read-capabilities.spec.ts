import { jest } from '@jest/globals';

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

import { FeatureAccessController } from '@/access/feature-access.controller';
import { AthleteMemoryController } from '@/athlete-memory/presentation/athlete-memory.controller';
import { UsersController } from '@/api/user/user.controller';
import { PUBLIC_DEMO_ACCESS_METADATA } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';

function capability(controller: { prototype: object }, handler: string) {
  return Reflect.getMetadata(
    PUBLIC_DEMO_ACCESS_METADATA,
    (controller.prototype as Record<string, unknown>)[handler],
  );
}

describe('Public Demo account reads', () => {
  it.each([
    [UsersController, 'getUserSettings'],
    [UsersController, 'listOAuthAuthorizations'],
    [FeatureAccessController, 'getFeatures'],
  ])('allows the profile read capability for %p.%s', (controller, handler) => {
    expect(capability(controller, handler)).toBe(
      PUBLIC_DEMO_CAPABILITIES.PROFILE_READ,
    );
  });

  it.each([
    [AthleteMemoryController, 'list'],
    [AthleteMemoryController, 'export'],
    [AthleteMemoryController, 'preference'],
  ])('allows the AI history capability for %p.%s', (controller, handler) => {
    expect(capability(controller, handler)).toBe(
      PUBLIC_DEMO_CAPABILITIES.AI_HISTORY_READ,
    );
  });

  it.each([
    [UsersController, 'updateUserSetting'],
    [UsersController, 'revokeOAuthAuthorization'],
    [AthleteMemoryController, 'setPreference'],
    [AthleteMemoryController, 'correct'],
    [AthleteMemoryController, 'remove'],
  ])('keeps the mutation %p.%s denied by default', (controller, handler) => {
    expect(capability(controller, handler)).toBeUndefined();
  });
});
