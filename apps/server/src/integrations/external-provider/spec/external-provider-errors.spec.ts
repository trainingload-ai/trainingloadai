import { describe, expect, it } from '@jest/globals';

import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import {
  THIRD_PARTY_ERRORS,
  thirdPartyError,
  thirdPartyOAuthReason,
  thirdPartyUnauthorized,
} from '../external-provider-errors';

describe('external provider errors', () => {
  it('keeps every provider error in one key-only registry', () => {
    for (const group of Object.values(THIRD_PARTY_ERRORS)) {
      for (const definition of Object.values(group)) {
        expect(definition.key).toMatch(/^common\.error\./);
        expect(definition).not.toHaveProperty('fallback');
      }
    }
  });

  it('uses the stable translation key when no request i18n context exists', () => {
    const exception = thirdPartyError(
      THIRD_PARTY_ERRORS.INTERVALS_ICU.NOT_CONNECTED,
    );

    expect(exception.getResponse()).toEqual({
      code: BUSINESS_ERROR_CODE.RESOURCE_NOT_FOUND,
      message: 'common.error.intervals_icu_not_connected',
    });
  });

  it('centralizes authorization codes and OAuth callback reasons', () => {
    const unauthorized = thirdPartyUnauthorized(
      THIRD_PARTY_ERRORS.INTERVALS_ICU.CREDENTIAL_MISSING,
    );
    const conflict = thirdPartyError(
      THIRD_PARTY_ERRORS.INTERVALS_ICU.ACCOUNT_ALREADY_CONNECTED,
    );

    expect(unauthorized.getResponse()).toEqual({
      code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
      message: 'common.error.intervals_icu_credential_missing',
    });
    expect(thirdPartyOAuthReason(conflict)).toBe('account_already_connected');
  });
});
