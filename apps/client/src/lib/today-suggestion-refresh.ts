/** Transport scheduling only; the backend owns cache validity and model retry policy. */
export function createTodaySuggestionRefetchInterval() {
  return (query: { state: { data?: unknown; status?: string } }) => {
    const now = Date.now();
    const data = query.state.data as
      | { retryAt?: string; validUntil?: string }
      | undefined;
    const retry = Date.parse(data?.retryAt ?? "");
    if (Number.isFinite(retry) && retry > now)
      return Math.min(120_000, Math.max(15_000, retry - now));
    const expiry = Date.parse(data?.validUntil ?? "");
    if (Number.isFinite(expiry) && expiry > now)
      return Math.min(120_000, Math.max(1_000, expiry - now));
    return 120_000;
  };
}
