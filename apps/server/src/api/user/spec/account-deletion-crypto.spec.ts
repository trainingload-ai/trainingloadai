import { afterEach, describe, expect, it } from '@jest/globals';

import {
  accountDeletionSubjectHash,
  decryptAccountDeletionValue,
  encryptAccountDeletionValue,
} from '../account-deletion-crypto';

const ENVIRONMENT_KEYS = [
  'ACCOUNT_DELETION_SECRET',
  'AUTH_SECRET',
  'BETTER_AUTH_SECRET',
  'NODE_ENV',
  'SELF_HOST_AUTH_SECRET',
  'SELF_HOST_MODE',
] as const;

const originalEnvironment = Object.fromEntries(
  ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENVIRONMENT_KEYS) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('account deletion cryptography', () => {
  it('derives a domain-separated deletion key from the self-host instance secret', () => {
    process.env.NODE_ENV = 'production';
    process.env.SELF_HOST_MODE = 'core-local';
    process.env.BETTER_AUTH_SECRET = 'self-host-auth-secret'.repeat(3);
    delete process.env.ACCOUNT_DELETION_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.SELF_HOST_AUTH_SECRET;

    const ciphertext = encryptAccountDeletionValue('owner@local.invalid');

    expect(decryptAccountDeletionValue(ciphertext)).toBe('owner@local.invalid');
    expect(accountDeletionSubjectHash('owner-1')).toMatch(/^[a-f0-9]{64}$/);
    expect(accountDeletionSubjectHash('owner-1')).toBe(
      accountDeletionSubjectHash('owner-1'),
    );
    expect(accountDeletionSubjectHash('owner-1')).not.toBe(
      accountDeletionSubjectHash('owner-2'),
    );
  });

  it('still requires the dedicated secret for managed production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ACCOUNT_DELETION_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.SELF_HOST_AUTH_SECRET;
    delete process.env.SELF_HOST_MODE;

    expect(() => accountDeletionSubjectHash('owner-1')).toThrow(
      'ACCOUNT_DELETION_SECRET is required in production',
    );
  });

  it('fails explicitly when a self-host instance secret is unavailable', () => {
    process.env.NODE_ENV = 'production';
    process.env.SELF_HOST_MODE = 'core-local';
    delete process.env.ACCOUNT_DELETION_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.SELF_HOST_AUTH_SECRET;

    expect(() => accountDeletionSubjectHash('owner-1')).toThrow(
      'SELF_HOST_AUTH_SECRET',
    );
  });
});
