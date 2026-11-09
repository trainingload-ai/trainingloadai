import { Logger } from '@nestjs/common';
import { PersonalProviderError } from './personal-errors';

const logger = new Logger('PersonalHttp');

/** Bounded, non-redirecting fetch. Authentication is never forwarded to a CDN. */
export async function providerFetch(
  url: URL,
  init: RequestInit = {},
  maxBytes = 8 * 1024 * 1024,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new PersonalProviderError('PROVIDER_UNREACHABLE');
  }
  if (response.status === 429) {
    const retry = response.headers.get('retry-after');
    const ms =
      retry && /^\d+$/.test(retry)
        ? Number(retry) * 1000
        : retry
          ? Date.parse(retry) - Date.now()
          : 60_000;
    await response.body?.cancel();
    logger.warn({
      code: 'PROVIDER_RATE_LIMITED',
      httpStatus: 429,
      path: url.pathname,
    });
    throw new PersonalProviderError(
      'PROVIDER_RATE_LIMITED',
      Math.max(60_000, Math.min(ms || 60_000, 86400_000)),
      429,
      429,
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    const code =
      response.status === 401
        ? 'PROVIDER_AUTH_REQUIRED'
        : response.status === 403
          ? 'PROVIDER_FORBIDDEN'
          : response.status === 404
            ? 'PROVIDER_NOT_FOUND'
            : 'PROVIDER_REQUEST_FAILED';
    // Log status + path only; never response bodies (tokens / PII).
    logger.warn({
      code,
      httpStatus: response.status,
      path: url.pathname,
    });
    throw new PersonalProviderError(
      code,
      undefined,
      response.status === 401 ? 401 : 502,
      response.status,
    );
  }
  const length = Number(response.headers.get('content-length'));
  if (length > maxBytes) {
    await response.body?.cancel();
    throw new PersonalProviderError('PROVIDER_RESPONSE_TOO_LARGE');
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.length;
        if (total > maxBytes)
          throw new PersonalProviderError('PROVIDER_RESPONSE_TOO_LARGE');
        chunks.push(next.value);
      }
    } catch (error) {
      if (error instanceof PersonalProviderError) throw error;
      throw new PersonalProviderError('PROVIDER_UNREACHABLE');
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
  return {
    bytes: Buffer.concat(chunks),
    status: response.status,
    headers: response.headers,
  };
}
export async function providerJson(url: URL, init?: RequestInit) {
  const result = await providerFetch(url, init);
  if (result.status === 204 || result.bytes.length === 0) return null;
  try {
    return JSON.parse(result.bytes.toString('utf8')) as unknown;
  } catch {
    throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
  }
}
