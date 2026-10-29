import { describe, expect, it } from '@jest/globals';

import {
  errorHttpStatus,
  isAbortError,
  parseApiEnvelopeText,
  shouldRetryTransientQuery,
} from '../../../../packages/shared/runtime-reliability';

describe('runtime reliability policy', () => {
  it('extracts only valid HTTP error statuses', () => {
    expect(errorHttpStatus({ status: 429 })).toBe(429);
    expect(errorHttpStatus({ statusCode: 503 })).toBe(503);
    expect(errorHttpStatus({ status: '500' })).toBeNull();
    expect(errorHttpStatus({ status: 200 })).toBeNull();
  });

  it('retries transient failures only once', () => {
    expect(shouldRetryTransientQuery(0, new Error('offline'))).toBe(true);
    expect(shouldRetryTransientQuery(0, { status: 503 })).toBe(true);
    expect(shouldRetryTransientQuery(0, { status: 429 })).toBe(true);
    expect(shouldRetryTransientQuery(0, { status: 404 })).toBe(false);
    expect(shouldRetryTransientQuery(1, { status: 503 })).toBe(false);
  });

  it('never retries cancellation', () => {
    const error = { name: 'AbortError' };
    expect(isAbortError(error)).toBe(true);
    expect(shouldRetryTransientQuery(0, error)).toBe(false);
  });

  it('accepts only object API envelopes', () => {
    expect(parseApiEnvelopeText('')).toEqual({});
    expect(parseApiEnvelopeText('{"data":{"id":"a1"}}')).toEqual({
      data: { id: 'a1' },
    });
    expect(parseApiEnvelopeText('null')).toBeNull();
    expect(parseApiEnvelopeText('[]')).toBeNull();
    expect(parseApiEnvelopeText('<html>gateway error</html>')).toBeNull();
  });
});
