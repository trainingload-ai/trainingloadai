import { ConfigService } from '@nestjs/config';
import { describe, expect, it, jest } from '@jest/globals';
import { IntervalsIcuCredentialService } from '../intervals-icu-credential.service';

describe('IntervalsIcuCredentialService', () => {
  it('encrypts and authenticates a provider credential', () => {
    const service = new IntervalsIcuCredentialService(
      new ConfigService({
        externalProviderCredentialSecret: 'test-provider-secret',
      }),
    );

    const encrypted = service.encrypt('intervals-token');

    expect(encrypted).not.toContain('intervals-token');
    expect(service.decrypt(encrypted)).toBe('intervals-token');
    expect(service.fingerprint('intervals-token')).toHaveLength(64);
  });

  it('does not fall back to Better Auth credentials', () => {
    const service = new IntervalsIcuCredentialService(
      new ConfigService({ BETTER_AUTH_SECRET: 'auth-secret' }),
    );

    expect(() => service.encrypt('intervals-token')).toThrow(
      'EXTERNAL_PROVIDER_CREDENTIAL_SECRET is required',
    );
  });

  it('enforces API-key and OAuth capabilities independently', () => {
    const requireCapability = jest.fn();
    const service = new IntervalsIcuCredentialService(
      new ConfigService({
        externalProviderCredentialSecret: 'test-provider-secret',
      }),
      { require: requireCapability } as never,
    );
    const credentialCiphertext = service.encrypt('intervals-token');

    expect(
      service.resolveConnectionCredential({
        credentialCiphertext,
        metadata: { authType: 'api_key' },
      }),
    ).toBe('intervals-token');
    expect(
      service.resolveConnectionCredential({
        credentialCiphertext,
        metadata: { authType: 'oauth' },
      }),
    ).toEqual({ authType: 'oauth', token: 'intervals-token' });
    expect(requireCapability).toHaveBeenNthCalledWith(
      1,
      'intervals-icu-api-key',
    );
    expect(requireCapability).toHaveBeenNthCalledWith(2, 'third-party-sync');
  });
});
