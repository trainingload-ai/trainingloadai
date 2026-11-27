export const DEFAULT_ATHLETE_TIMEZONE = 'UTC';

export function normalizeIanaTimezone(value: unknown): string | null {
  const candidate = String(value ?? '').trim();
  if (!candidate) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return null;
  }
}

export function resolveAthleteTimezone(args: {
  preferred?: string | null;
  requested?: string | null;
  fallback?: string | null;
}): string {
  return (
    normalizeIanaTimezone(args.preferred) ??
    normalizeIanaTimezone(args.requested) ??
    normalizeIanaTimezone(args.fallback) ??
    DEFAULT_ATHLETE_TIMEZONE
  );
}
