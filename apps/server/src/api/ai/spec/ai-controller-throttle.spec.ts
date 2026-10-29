import { describe, expect, it, jest } from '@jest/globals';
import { THROTTLER_SKIP } from '@nestjs/throttler/dist/throttler.constants';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: class AuthService {},
  Session: () => () => undefined,
}));
jest.mock('@/oauth/oauth-hybrid-auth.guard', () => ({
  OAuthHybridAuthGuard: class OAuthHybridAuthGuard {},
}));

import { AiController } from '../ai.controller';

describe('AiController throttling', () => {
  it('uses the AI throttle without inheriting the public default throttle', () => {
    expect(Reflect.getMetadata(`${THROTTLER_SKIP}default`, AiController)).toBe(
      true,
    );
    expect(Reflect.getMetadata(`${THROTTLER_SKIP}ai`, AiController)).toBe(
      undefined,
    );
  });
});
