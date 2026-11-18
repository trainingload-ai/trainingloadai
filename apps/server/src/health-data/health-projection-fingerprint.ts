import { createHash } from 'node:crypto';

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value ?? null;
}

/** Hash consumed source content, never relation writes or ingestion heartbeats. */
export function healthProjectionFingerprint(
  sources: ReadonlyArray<Record<string, unknown>>,
  includeSourceUpdatedAt = true,
) {
  const fields = [
    'id',
    'snapshotId',
    'provider',
    'externalId',
    'startTime',
    'endTime',
    'value',
    'unit',
    'timezone',
    'sourceName',
    'sourcePriority',
    ...(includeSourceUpdatedAt ? ['sourceUpdatedAt'] : []),
    'sourceNamespace',
    'aggregation',
    'metadata',
  ];
  const rows = sources
    .map((source) =>
      JSON.stringify(
        canonical(Object.fromEntries(fields.map((key) => [key, source[key]]))),
      ),
    )
    .sort();
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

/** Semantic versions exclude source polling and projection timestamps. */
export function healthDailySemanticHash(fact: object) {
  return createHash('sha256')
    .update(JSON.stringify(canonical({ policy: 'health-daily-v1', ...fact })))
    .digest('hex');
}

export function isHealthSnapshotReady(source: {
  snapshotId?: string | null;
  snapshot?: { manifest: unknown } | null;
}) {
  const manifest = source.snapshot?.manifest;
  return (
    !source.snapshotId ||
    Boolean(
      manifest &&
      typeof manifest === 'object' &&
      !Array.isArray(manifest) &&
      'status' in manifest &&
      manifest.status === 'READY',
    )
  );
}
