import { describe, expect, it, jest } from '@jest/globals';
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { isGloballyThrottledApiPath } from '@/guard/api-throttler.guard';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

import { SelfHostBootstrapController } from './self-host-bootstrap.controller';

describe('SelfHostBootstrapController security metadata', () => {
  it('applies bounded public throttles to status and owner claim', () => {
    expect(isGloballyThrottledApiPath('/api/self-host/bootstrap/status')).toBe(
      true,
    );
    expect(
      Reflect.getMetadata(
        `${THROTTLER_LIMIT}default`,
        SelfHostBootstrapController.prototype.status,
      ),
    ).toBe(30);
    expect(
      Reflect.getMetadata(
        `${THROTTLER_TTL}default`,
        SelfHostBootstrapController.prototype.status,
      ),
    ).toBe(60_000);
    expect(
      Reflect.getMetadata(
        `${THROTTLER_LIMIT}default`,
        SelfHostBootstrapController.prototype.createOwner,
      ),
    ).toBe(5);
    expect(
      Reflect.getMetadata(
        `${THROTTLER_LIMIT}default`,
        SelfHostBootstrapController.prototype.createLocalOwner,
      ),
    ).toBe(5);
  });
});
