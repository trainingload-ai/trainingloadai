import { describe, expect, it } from '@jest/globals';
import { isSelfHostMailAuthPathAllowed } from './self-host-mail-auth-policy';

describe('self-host auth paths without SMTP', () => {
  const coreLocal = {
    SELF_HOST_MODE: 'core-local',
    MAIL_PROVIDER: 'none',
  };

  it.each([
    '/request-password-reset',
    '/send-verification-email',
    '/email-otp/send-verification-otp',
    '/email-otp/request-password-reset',
  ])('blocks %s before Better Auth creates durable state', (path) => {
    expect(isSelfHostMailAuthPathAllowed(path, coreLocal)).toBe(false);
  });

  it('allows direct self-host registration without an email round trip', () => {
    expect(isSelfHostMailAuthPathAllowed('/sign-up/email', coreLocal)).toBe(
      true,
    );
  });

  it('keeps sign-in and authenticated password changes available', () => {
    expect(isSelfHostMailAuthPathAllowed('/sign-in/email', coreLocal)).toBe(
      true,
    );
    expect(isSelfHostMailAuthPathAllowed('/change-password', coreLocal)).toBe(
      true,
    );
  });

  it('never enables Cloud email workflows from stale SMTP configuration', () => {
    expect(
      isSelfHostMailAuthPathAllowed('/request-password-reset', {
        ...coreLocal,
        MAIL_PROVIDER: 'smtp',
      }),
    ).toBe(false);
  });
});
