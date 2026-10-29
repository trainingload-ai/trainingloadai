type ErrorLike = {
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

export type ApiEnvelope<T> = {
  code?: number;
  error_code?: string;
  errorCode?: string;
  message?: string;
  data?: T;
};

/** Empty 204-style bodies are valid; every non-empty body must be an object envelope. */
export function parseApiEnvelopeText<T>(raw: string): ApiEnvelope<T> | null {
  if (!raw.trim()) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ApiEnvelope<T>)
      : null;
  } catch {
    return null;
  }
}

export function errorHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as ErrorLike;
  const value = candidate.status ?? candidate.statusCode;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 400 &&
    value <= 599
    ? value
    : null;
}

export function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as ErrorLike).name === "AbortError",
  );
}

/** Retry one transient query failure, but never retry cancellation or permanent 4xx failures. */
export function shouldRetryTransientQuery(
  failureCount: number,
  error: unknown,
  maxRetries = 1,
): boolean {
  if (failureCount >= maxRetries || isAbortError(error)) return false;

  const status = errorHttpStatus(error);
  if (status == null) return true;

  return status === 408 || status === 425 || status === 429 || status >= 500;
}
