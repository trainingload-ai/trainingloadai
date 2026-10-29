import { describe, expect, it } from '@jest/globals';
import { BUSINESS_ERROR_CODE } from '../business-exception/business-exception.error.codes';
import { businessErrorHttpStatus } from '../business-exception/business-exception.filter';

describe('businessErrorHttpStatus', () => {
  it.each([
    [BUSINESS_ERROR_CODE.COMMON, 400],
    [BUSINESS_ERROR_CODE.UNAUTHORIZED, 401],
    [BUSINESS_ERROR_CODE.AI_DATA_CONSENT_REQUIRED, 403],
    [BUSINESS_ERROR_CODE.RESOURCE_NOT_FOUND, 404],
    [BUSINESS_ERROR_CODE.STORAGE_FILE_NOT_FOUND, 404],
    [BUSINESS_ERROR_CODE.CONFLICT, 409],
    [BUSINESS_ERROR_CODE.UNPROCESSABLE_ENTITY, 422],
    [BUSINESS_ERROR_CODE.STORAGE_NOT_WRITABLE, 500],
    [BUSINESS_ERROR_CODE.STORAGE_NO_SPACE, 507],
    [BUSINESS_ERROR_CODE.CAPABILITY_DISABLED, 503],
    [BUSINESS_ERROR_CODE.CAPABILITY_MISCONFIGURED, 503],
  ])('maps business code %s to HTTP %s', (code, status) => {
    expect(businessErrorHttpStatus(code)).toBe(status);
  });
});
