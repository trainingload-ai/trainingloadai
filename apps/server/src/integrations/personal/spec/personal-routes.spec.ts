import { describe, expect, it, jest } from '@jest/globals';
import { PATH_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { SelfHostOwnerGuard } from '@/self-host/self-host-owner.guard';
import { RUNTIME_CAPABILITY_METADATA } from '@/runtime-capabilities/requires-runtime-capability.decorator';
import {
  CorosPersonalController,
  CorosOAuthCallbackController,
  GarminPersonalController,
} from '@/api/personal/personal.controller';
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));
describe('personal integration routing', () => {
  it('matches the same-origin BFF paths and independent capabilities', () => {
    expect(Reflect.getMetadata(PATH_METADATA, GarminPersonalController)).toBe(
      '/api/garmin-personal',
    );
    expect(Reflect.getMetadata(PATH_METADATA, CorosPersonalController)).toBe(
      '/api/coros-mcp',
    );
    expect(
      Reflect.getMetadata(
        RUNTIME_CAPABILITY_METADATA,
        GarminPersonalController,
      ),
    ).toBe('garmin-personal-api-key');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, GarminPersonalController),
    ).toContain(SelfHostOwnerGuard);
    expect(
      Reflect.getMetadata(RUNTIME_CAPABILITY_METADATA, CorosPersonalController),
    ).toBe('coros-mcp');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CorosPersonalController),
    ).toContain(SelfHostOwnerGuard);
    expect(
      Reflect.getMetadata(PATH_METADATA, CorosOAuthCallbackController),
    ).toBe('/api/coros-mcp/oauth');
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        CorosOAuthCallbackController.prototype.callback,
      ),
    ).toBe('callback');
    expect(
      Reflect.getMetadata(
        RUNTIME_CAPABILITY_METADATA,
        CorosOAuthCallbackController,
      ),
    ).toBe('coros-mcp');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, CorosOAuthCallbackController),
    ).toBeUndefined();
  });
});
