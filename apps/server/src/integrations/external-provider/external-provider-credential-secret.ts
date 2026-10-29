import type { ConfigService } from '@nestjs/config';

/**
 * Return the dedicated key used to encrypt third-party credentials.
 *
 * Authentication and internal-API secrets are intentionally not accepted as
 * fallbacks: each key can be rotated without invalidating unrelated data.
 */
export function requireExternalProviderCredentialSecret(
  config: Pick<ConfigService, 'get'>,
) {
  const secret = config.get<string>('externalProviderCredentialSecret')?.trim();
  if (!secret) {
    throw new Error('EXTERNAL_PROVIDER_CREDENTIAL_SECRET is required');
  }
  return secret;
}
