import { FITNESS_METRICS, FITNESS_SPORTS } from '@shared/fitness-assessment';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import type {
  FitnessScope,
  FitnessMetric,
  FitnessSport,
} from '@shared/fitness-assessment';
dayjs.extend(utc);
dayjs.extend(timezone);
export function canonicalFitnessNumber(value: number): number {
  // Prisma's JSON transport can round non-integer doubles by one ULP. Keep
  // hashes stable across the JSONB round trip without changing exact integers.
  return Number.isFinite(value) && !Number.isInteger(value)
    ? Number(value.toPrecision(15))
    : value;
}
export function fingerprint(value: unknown): string {
  const normalize = (v: unknown): unknown =>
    typeof v === 'number'
      ? canonicalFitnessNumber(v)
      : v instanceof Date
        ? v.toISOString()
        : Array.isArray(v)
          ? v.map(normalize)
          : v && typeof v === 'object'
            ? Object.fromEntries(
                Object.entries(v)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, x]) => [k, normalize(x)]),
              )
            : v;
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex');
}
export function localDay(date: Date, tz: string) {
  return dayjs(date).tz(tz).format('YYYY-MM-DD');
}
export function dateBoundary(day: string, tz: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    dayjs.utc(day).format('YYYY-MM-DD') !== day
  )
    throw new BadRequestException('Invalid localDate');
  // Resolve each midnight separately: adding 24h breaks DST boundaries.
  const next = dayjs.utc(day).add(1, 'day').format('YYYY-MM-DD');
  return { from: dayjs.tz(day, tz).toDate(), to: dayjs.tz(next, tz).toDate() };
}
export type EvidenceRequest = {
  methodId: string;
  metric: FitnessMetric;
  sport: FitnessSport;
  scope: FitnessScope;
  taskId?: string;
  segment?: { activityHashId: string; startSeconds: number };
};
export function validateEvidenceRequest(x: EvidenceRequest) {
  if (
    !x ||
    !(FITNESS_METRICS as readonly string[]).includes(x.metric) ||
    !(FITNESS_SPORTS as readonly string[]).includes(x.sport) ||
    typeof x.methodId !== 'string'
  )
    throw new BadRequestException('Invalid metric, sport or method');
  const s = x.scope;
  if (!s || !['ACTIVITY', 'DATE', 'RECENT'].includes(s.kind))
    throw new BadRequestException('Invalid scope');
  if (
    s.kind === 'ACTIVITY' &&
    (typeof s.activityHashId !== 'string' || !s.activityHashId.trim())
  )
    throw new BadRequestException('activityHashId required');
  if (s.kind === 'DATE' && !/^\d{4}-\d{2}-\d{2}$/.test(s.localDate))
    throw new BadRequestException('localDate required');
  if (
    s.kind === 'RECENT' &&
    s.days !== undefined &&
    (!Number.isInteger(s.days) || s.days < 1 || s.days > 180)
  )
    throw new BadRequestException('days must be 1–180');
  if (
    s.kind === 'RECENT' &&
    s.asOf &&
    (!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(s.asOf) ||
      !Number.isFinite(Date.parse(s.asOf)))
  )
    throw new BadRequestException(
      'asOf requires an ISO timestamp with an explicit timezone offset',
    );
  if (
    x.segment &&
    (typeof x.segment.activityHashId !== 'string' ||
      !Number.isFinite(x.segment.startSeconds) ||
      x.segment.startSeconds < 0)
  )
    throw new BadRequestException('Invalid segment');
}
