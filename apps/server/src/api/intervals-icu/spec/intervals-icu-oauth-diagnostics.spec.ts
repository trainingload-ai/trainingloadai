import { describe, expect, it } from '@jest/globals';
import { IntervalsIcuApiError } from '@/integrations/intervals-icu/intervals-icu.client';
import {
  intervalsOAuthDiagnostic,
  isIntervalsAthleteUniqueConflict,
} from '../intervals-icu-oauth-diagnostics';

describe('safe OAuth diagnostics', () => {
  it('allows only known classifications and never echoes arbitrary response text', () => {
    expect(
      intervalsOAuthDiagnostic(
        new IntervalsIcuApiError(
          400,
          'secret-code',
          '{"error":"invalid_grant","error_description":"secret-token"}',
        ),
      ),
    ).toEqual({ code: 'invalid_grant', httpStatus: 400 });
    expect(
      intervalsOAuthDiagnostic(
        new IntervalsIcuApiError(400, 'secret', '{"error":"secret-token"}'),
      ),
    ).toEqual({ code: 'upstream_error', httpStatus: 400 });
    expect(intervalsOAuthDiagnostic(new Error('secret'))).toEqual({
      code: 'callback_failed',
    });
  });
  it('does not classify unrelated unique violations as occupied accounts', () => {
    expect(
      isIntervalsAthleteUniqueConflict({
        code: 'P2002',
        meta: { target: ['user_id', 'provider', 'region'] },
      }),
    ).toBe(false);
    expect(
      isIntervalsAthleteUniqueConflict({
        code: 'P2002',
        meta: { target: 'intervals_icu_active_athlete_unique' },
      }),
    ).toBe(true);
  });
});
