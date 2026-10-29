import { describe, expect, it } from '@jest/globals';
import {
  ACQUISITION_SOURCE_HEADER,
  REGISTRATION_PLATFORM_HEADER,
} from '@shared/registration-attribution';

import { CORS_ALLOWED_HEADERS } from '../cors-options';

describe('CORS header policy', () => {
  it('allows the registration attribution headers sent by web clients', () => {
    expect(CORS_ALLOWED_HEADERS).toEqual(
      expect.arrayContaining([
        REGISTRATION_PLATFORM_HEADER,
        ACQUISITION_SOURCE_HEADER,
      ]),
    );
  });
});
