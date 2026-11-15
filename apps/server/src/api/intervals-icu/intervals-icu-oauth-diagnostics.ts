import { IntervalsIcuApiError } from '@/integrations/intervals-icu/intervals-icu.client';

const OAUTH_ERRORS = new Set([
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

/** Never log arbitrary upstream error text, response bodies, or credentials. */
export function intervalsOAuthDiagnostic(error: unknown) {
  if (!(error instanceof IntervalsIcuApiError))
    return { code: 'callback_failed' };
  let code = 'upstream_error';
  try {
    const body: unknown = JSON.parse(error.body ?? '');
    const value = (body as { error?: unknown } | null)?.error;
    if (typeof value === 'string' && OAUTH_ERRORS.has(value)) code = value;
  } catch {
    /* Non-JSON responses receive only a generic classification. */
  }
  return { code, httpStatus: error.status };
}

export function isIntervalsAthleteUniqueConflict(error: unknown) {
  const value = error as { code?: unknown; meta?: { target?: unknown } } | null;
  if (value?.code !== 'P2002') return false;
  const target = value.meta?.target;
  return (Array.isArray(target) ? target : [target]).some(
    (field) =>
      field === 'external_athlete_id' ||
      field === 'externalAthleteId' ||
      field === 'intervals_icu_active_athlete_unique',
  );
}
