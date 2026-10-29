import { describe, expect, it } from '@jest/globals';
import { requireExternalProviderCredentialSecret } from '../external-provider-credential-secret';

describe('requireExternalProviderCredentialSecret', () => {
  it('returns the trimmed dedicated secret', () => {
    const config = {
      get: (key: string) =>
        key === 'externalProviderCredentialSecret'
          ? '  provider-secret  '
          : undefined,
    };

    expect(requireExternalProviderCredentialSecret(config as never)).toBe(
      'provider-secret',
    );
  });

  it('rejects unrelated authentication secrets', () => {
    const config = {
      get: (key: string) =>
        key === 'BETTER_AUTH_SECRET' ? 'auth-secret' : undefined,
    };

    expect(() =>
      requireExternalProviderCredentialSecret(config as never),
    ).toThrow('EXTERNAL_PROVIDER_CREDENTIAL_SECRET is required');
  });
});
