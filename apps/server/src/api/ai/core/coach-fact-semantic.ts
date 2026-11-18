const AUDIT_KEYS = new Set([
  'updatedAt',
  'createdAt',
  'computedAt',
  'readAt',
  'asOf',
  'runId',
  'assessmentId',
  'evidenceHash',
  'recordedAt',
  'readyAt',
  'expiresAt',
]);

/** Use on typed domain projections, never on source payloads or free-form user data. */
export function coachingSemanticValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(coachingSemanticValue);
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !AUDIT_KEYS.has(key))
      .map(([key, entry]) => [key, coachingSemanticValue(entry)]),
  );
}
