import { HttpException } from '@nestjs/common';

export class PersonalProviderError extends HttpException {
  constructor(
    public readonly code: string,
    public readonly retryAfterMs?: number,
    status = 502,
    /** Real upstream HTTP status when known; never forwarded in API bodies. */
    public readonly upstreamHttpStatus?: number,
  ) {
    // Upstream bodies/URLs can contain keys and health data. Never forward them.
    // A provider token expiry is not an expired Trainingload session.
    super({ code, message: code }, status === 401 ? 409 : status);
  }
}
export function providerError(error: unknown): string {
  return error instanceof PersonalProviderError
    ? error.code
    : 'PROVIDER_REQUEST_FAILED';
}
export function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
export function requireId(value: unknown): string {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    (typeof value === 'number' && !Number.isSafeInteger(value)) ||
    !/^[a-zA-Z0-9_-]{1,160}$/.test(String(value))
  ) {
    throw new PersonalProviderError('PROVIDER_SCHEMA_CHANGED');
  }
  return String(value);
}
