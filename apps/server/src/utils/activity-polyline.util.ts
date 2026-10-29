import { createHash } from 'node:crypto';

export function normalizeActivityPolylines(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function activityPolylineFingerprint(value: unknown) {
  const polylines = normalizeActivityPolylines(value);
  return createHash('sha1').update(JSON.stringify(polylines)).digest('hex');
}
