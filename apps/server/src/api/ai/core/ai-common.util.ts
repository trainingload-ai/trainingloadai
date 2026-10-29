import { createHash } from 'crypto';

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function unknownErrorFields(err: unknown): {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
  type?: unknown;
  requestID?: unknown;
  headers?: unknown;
  error: Record<string, unknown> | null;
} {
  const rec = asRecord(err);
  const nested = rec ? asRecord(rec.error) : null;
  return {
    name: rec?.name ?? (err instanceof Error ? err.name : undefined),
    message: rec?.message ?? (err instanceof Error ? err.message : undefined),
    status: rec?.status,
    code: rec?.code,
    type: rec?.type,
    requestID: rec?.requestID,
    headers: rec?.headers,
    error: nested,
  };
}

export function previewText(input: string, max = 200): string {
  const s = String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…(len=${s.length})`;
}

export function safeLogJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stableJsonInner(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonInner(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonInner(obj[key])}`)
    .join(',')}}`;
}

export function stableJson(value: unknown): string {
  try {
    return stableJsonInner(value === undefined ? {} : value);
  } catch {
    return '{}';
  }
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

export function localDateYmd(
  input: Date | string,
  timeZone?: string | null,
): string | null {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

export function dayDiffByYmd(fromYmd: string, toYmd: string): number | null {
  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromYmd);
  const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toYmd);
  if (!m1 || !m2) return null;
  const fromUtc = Date.UTC(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
  const toUtc = Date.UTC(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.round((toUtc - fromUtc) / oneDayMs);
}
