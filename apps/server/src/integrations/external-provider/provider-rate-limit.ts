/** A scheduling condition, separate from authentication and business failures. */
export class ProviderRateLimitError extends Error {
  readonly code = 'PROVIDER_RATE_LIMITED';
  constructor(
    readonly retryAt: Date,
    readonly scopeKey?: string,
    readonly usesBackoff = false,
  ) {
    super('PROVIDER_RATE_LIMITED');
  }
}
function retryAfterTime(
  header: string | null | undefined,
  now: number,
): number {
  const value = header?.trim();
  if (!value) return NaN;
  const parsed = /^\d+$/.test(value)
    ? now + Number(value) * 1000
    : /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
          value,
        )
      ? Date.parse(value)
      : NaN;
  return Number.isFinite(parsed) && parsed <= 8640000000000000 ? parsed : NaN;
}
/** Honor valid delay-seconds and HTTP-date. Invalid headers use bounded exponential backoff with jitter. */
export function providerRetryAt(
  header: string | null | undefined,
  attempt = 1,
  now = Date.now(),
  random = Math.random(),
): Date {
  const parsed = retryAfterTime(header, now);
  if (Number.isFinite(parsed)) return new Date(Math.max(now + 1000, parsed));
  const delay = Math.min(
    3600000,
    60000 * 2 ** Math.min(6, Math.max(0, attempt - 1)),
  );
  return new Date(
    now +
      Math.min(
        3600000,
        delay + Math.floor(Math.max(0, Math.min(1, random)) * delay * 0.2),
      ),
  );
}

export function providerThrottle(
  header: string | null | undefined,
  scopeKey?: string,
): ProviderRateLimitError {
  const now = Date.now();
  return new ProviderRateLimitError(
    providerRetryAt(header, 1, now),
    scopeKey,
    !Number.isFinite(retryAfterTime(header, now)),
  );
}
