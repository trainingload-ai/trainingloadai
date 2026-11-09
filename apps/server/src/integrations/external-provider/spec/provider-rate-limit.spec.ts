import { providerRetryAt } from '../provider-rate-limit';
describe('Provider Retry-After', () => {
  const now = Date.parse('2026-11-01T00:00:00Z');
  it('honors seconds and HTTP dates, including waits longer than the fallback ceiling', () => {
    expect(providerRetryAt('120', 1, now).getTime()).toBe(now + 120000);
    expect(
      providerRetryAt('Sun, 01 Nov 2026 01:00:00 GMT', 1, now).getTime(),
    ).toBe(now + 3600000);
    expect(providerRetryAt('172800', 1, now).getTime()).toBe(now + 172800000);
  });
  it('uses bounded backoff and jitter for absent or malformed values', () => {
    expect(providerRetryAt(null, 1, now, 0).getTime()).toBe(now + 60000);
    expect(providerRetryAt('invalid', 20, now, 1).getTime()).toBe(
      now + 3600000,
    );
    expect(providerRetryAt('0', 1, now).getTime()).toBe(now + 1000);
  });
  it.each(['-1', '1.5', 'Infinity', '2026-11-01', '9'.repeat(400)])(
    'rejects malformed Retry-After %s',
    (header) => {
      expect(providerRetryAt(header, 1, now, 0).getTime()).toBe(now + 60000);
    },
  );
});
