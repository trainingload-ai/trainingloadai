import { IntervalsIcuApiError } from '../intervals-icu.client';
import {
  intervalsOAuthFailure,
  intervalsOAuthStateRef,
  intervalsOAuthErrorCode,
} from '../intervals-icu-oauth-diagnostics';

describe('Intervals.icu safe OAuth diagnostics', () => {
  it.each([
    '{"error":"secret"}',
    '<html>secret</html>',
    '{"error_description":"secret"}',
    'null',
  ])('drops arbitrary upstream content: %s', (body) => {
    expect(
      intervalsOAuthFailure(
        new IntervalsIcuApiError(400, 'secret', body),
        'exchange_token',
      ),
    ).toEqual({ category: 'http', httpStatus: 400, oauthError: 'other' });
  });
  it('classifies known network errors and timeouts without retaining messages', () => {
    expect(
      intervalsOAuthFailure(
        new Error('secret', { cause: { code: 'ECONNRESET' } }),
        'exchange_token',
      ),
    ).toEqual({ category: 'network', networkCode: 'ECONNRESET' });
    expect(
      intervalsOAuthFailure(
        Object.assign(new Error('secret'), { name: 'TimeoutError' }),
        'exchange_token',
      ),
    ).toEqual({ category: 'timeout' });
    expect(intervalsOAuthErrorCode('access_denied')).toBe('access_denied');
    expect(intervalsOAuthStateRef()).toBeNull();
    expect(intervalsOAuthStateRef(['state-a', 'state-b'])).toBeNull();
    expect(
      intervalsOAuthFailure(new SyntaxError('secret'), 'exchange_token'),
    ).toEqual({ category: 'response_format' });
    expect(intervalsOAuthStateRef('secret-state')).toMatch(/^[a-f0-9]{24}$/);
  });
});
