import { createHash } from 'node:crypto';
import { IntervalsIcuApiError } from './intervals-icu.client';

export type IntervalsOAuthStage =
  | 'consume_state'
  | 'provider_response'
  | 'configuration'
  | 'exchange_token'
  | 'save_connection';

const oauthErrors = new Set([
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
  'access_denied',
  'server_error',
  'temporarily_unavailable',
]);
const networkCodes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export function intervalsOAuthStateRef(state?: unknown) {
  // State is high-entropy and single-use. Retain only a digest for duplicate correlation.
  return typeof state === 'string' && state
    ? createHash('sha256').update(state).digest('hex').slice(0, 24)
    : null;
}

export function intervalsOAuthErrorCode(value: unknown) {
  return typeof value === 'string' && oauthErrors.has(value) ? value : 'other';
}

export function intervalsOAuthFailure(
  error: unknown,
  stage: IntervalsOAuthStage,
) {
  if (error instanceof IntervalsIcuApiError) {
    let oauthError = 'other';
    try {
      oauthError = intervalsOAuthErrorCode(JSON.parse(error.body ?? '').error);
    } catch {
      /* Upstream bodies are untrusted and never logged. */
    }
    return { category: 'http', httpStatus: error.status, oauthError };
  }
  if (error instanceof SyntaxError) return { category: 'response_format' };
  const value = error as {
    name?: unknown;
    code?: unknown;
    cause?: { code?: unknown };
  } | null;
  const code = value?.cause?.code ?? value?.code;
  if (typeof code === 'string' && networkCodes.has(code))
    return { category: 'network', networkCode: code };
  if (value?.name === 'TimeoutError' || value?.name === 'AbortError')
    return { category: 'timeout' };
  return {
    category: stage === 'consume_state' ? 'state_rejected' : 'internal',
  };
}
