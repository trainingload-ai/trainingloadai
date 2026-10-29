import { describe, expect, it, jest } from '@jest/globals';
import { RUNTIME_CAPABILITY_METADATA } from '@/runtime-capabilities/requires-runtime-capability.decorator';
import { IntervalsIcuController } from '../intervals-icu.controller';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

describe('IntervalsIcuController capability boundary', () => {
  it('allows API-key routes through the narrow self-host capability', () => {
    expect(
      Reflect.getMetadata(RUNTIME_CAPABILITY_METADATA, IntervalsIcuController),
    ).toBe('intervals-icu-api-key');
  });

  it('keeps OAuth routes behind the general third-party capability', () => {
    expect(
      Reflect.getMetadata(
        RUNTIME_CAPABILITY_METADATA,
        IntervalsIcuController.prototype.startOAuth,
      ),
    ).toBe('third-party-sync');
    expect(
      Reflect.getMetadata(
        RUNTIME_CAPABILITY_METADATA,
        IntervalsIcuController.prototype.oauthCallback,
      ),
    ).toBe('third-party-sync');
  });
});
