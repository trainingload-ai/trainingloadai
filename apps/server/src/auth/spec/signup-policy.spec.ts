import { describe, expect, it, jest } from '@jest/globals';
import {
  isPublicSignupEnabled,
  publicSignupBlockReason,
} from '../signup-policy';

function database(state: 'PENDING' | 'READY' | null) {
  return {
    selfHostInstance: {
      findUnique: jest.fn(async () => (state ? { state } : null)),
    },
  };
}

describe('signup policy', () => {
  it('keeps managed signup open and self-host signup closed by default', () => {
    expect(isPublicSignupEnabled({})).toBe(true);
    expect(isPublicSignupEnabled({ SELF_HOST_MODE: 'core-local' })).toBe(false);
  });

  it('never opens self-host signup, including an explicit legacy override', () => {
    const selfHost = { SELF_HOST_MODE: 'core-local' };
    expect(
      isPublicSignupEnabled({ ...selfHost, DISABLE_SIGNUP: 'false' }),
    ).toBe(false);
    expect(
      isPublicSignupEnabled({ ...selfHost, DISABLE_SIGNUP: 'true' }),
    ).toBe(false);
    expect(
      isPublicSignupEnabled({ ...selfHost, DISABLE_SIGNUP: 'invalid' }),
    ).toBe(false);
  });

  it('rejects a second user both before and after Owner initialization', async () => {
    const env = { SELF_HOST_MODE: 'core-local', DISABLE_SIGNUP: 'false' };
    await expect(publicSignupBlockReason(database(null), env)).resolves.toBe(
      'SIGNUP_DISABLED',
    );
    await expect(
      publicSignupBlockReason(database('PENDING'), env),
    ).resolves.toBe('SIGNUP_DISABLED');
    await expect(
      publicSignupBlockReason(database('READY'), env),
    ).resolves.toBe('SIGNUP_DISABLED');
  });

  it('does not query self-host state when signup is disabled', async () => {
    const db = database('READY');
    await expect(
      publicSignupBlockReason(db, {
        SELF_HOST_MODE: 'core-local',
        DISABLE_SIGNUP: 'true',
      }),
    ).resolves.toBe('SIGNUP_DISABLED');
    expect(db.selfHostInstance.findUnique).not.toHaveBeenCalled();
  });
});
