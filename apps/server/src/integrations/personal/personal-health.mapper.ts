import type { ExternalHealthMetricCandidate } from '@/health-data/health-data-ingest.service';
import { assertHealthMetricCandidate } from '@/health-data/health-metric-contract';
import { healthDay } from './personal-dates';
import { PersonalProviderError, record } from './personal-errors';

type Field = readonly [string, string, string];
const SUMMARY_FIELDS: Record<string, readonly Field[]> = {
  movement: [
    ['STEP_COUNT', 'steps.value', 'count'],
    ['WALKING_RUNNING_DISTANCE_M', 'steps.distanceInMeters', 'm'],
    ['FLOORS_ASCENDED', 'floorsAscended.value', 'count'],
  ],
  calories: [
    ['ACTIVE_ENERGY_KCAL', 'burnedActive', 'kcal'],
    ['TOTAL_ENERGY_KCAL', 'burnedTotal', 'kcal'],
  ],
  heartRate: [
    ['RESTING_HEART_RATE_BPM', 'restingValue', 'bpm'],
    ['HEART_RATE_MIN_BPM', 'minValue', 'bpm'],
    ['HEART_RATE_MAX_BPM', 'maxValue', 'bpm'],
  ],
  stress: [
    ['STRESS_LEVEL_AVG', 'avgLevel', 'score'],
    ['STRESS_LEVEL_MAX', 'maxLevel', 'score'],
  ],
  bodyBattery: [
    ['BODY_BATTERY_CHARGED', 'chargedValue', 'score'],
    ['BODY_BATTERY_DRAINED', 'drainedValue', 'score'],
    ['BODY_BATTERY_MIN', 'minValue', 'score'],
    ['BODY_BATTERY_MAX', 'maxValue', 'score'],
    ['BODY_BATTERY_LATEST', 'latestValue', 'score'],
  ],
};
const SLEEP_FIELDS: readonly Field[] = [
  ['SLEEP_ASLEEP_SECONDS', 'sleepTimeSeconds', 's'],
  ['SLEEP_AWAKE_SECONDS', 'awakeSleepSeconds', 's'],
  ['SLEEP_CORE_SECONDS', 'lightSleepSeconds', 's'],
  ['SLEEP_DEEP_SECONDS', 'deepSleepSeconds', 's'],
  ['SLEEP_REM_SECONDS', 'remSleepSeconds', 's'],
  ['SLEEP_SCORE', 'sleepScores.overall.value', 'score'],
  ['RESPIRATION_RATE_AVG_BPM', 'averageRespirationValue', 'breaths/min'],
];
const HRV_FIELDS: readonly Field[] = [
  ['HRV_RMSSD_MS', 'lastNightAvg', 'ms'],
  ['HRV_RMSSD_WEEKLY_AVG_MS', 'weeklyAvg', 'ms'],
  ['HRV_RMSSD_5_MIN_HIGH_MS', 'lastNight5MinHigh', 'ms'],
];
const BB_FIELDS: readonly Field[] = [
  ['BODY_BATTERY_CHARGED', 'charged', 'score'],
  ['BODY_BATTERY_DRAINED', 'drained', 'score'],
];
const SPO2_FIELDS: readonly Field[] = [
  ['SPO2_AVG_PERCENT', 'averageSpO2', 'percent'],
  ['SPO2_MIN_PERCENT', 'lowestSpO2', 'percent'],
];
const WEIGHT_FIELDS: readonly Field[] = [['BODY_MASS_KG', 'weight', 'kg']];
const at = (value: unknown, path: string): unknown =>
  path.split('.').reduce((v, key) => {
    if (v == null) return undefined;
    if (typeof v !== 'object' || Array.isArray(v))
      throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    return record(v)[key];
  }, value);
type Args = {
  day: string;
  timezone: string;
  accountId: string;
  connectionId: string;
  sourceObjectId?: string;
  summary?: unknown;
  sleep?: unknown;
  hrv?: unknown;
  bodyBattery?: unknown;
  spo2?: unknown;
  weight?: unknown;
};

/** Garmin Connect Personal API OpenAPI 1.0.0, checked 2026-11-01.
 * These DTOs differ from unofficial Connect endpoints: V2 summary is nested,
 * sleep is a direct DailySleepDTO, and DateWeightDTO.weight is already kg.
 * Only successful, recognized responses own a metric scope; unavailable reads
 * must be omitted by the caller so they cannot erase previously imported facts.
 */
export function garminHealthProjection(args: Args) {
  const candidates = new Map<string, ExternalHealthMetricCandidate>();
  const managed = new Set<string>();
  const date = (row: Record<string, any>, key = 'calendarDate') => {
    if (typeof row[key] !== 'string')
      throw new PersonalProviderError('PROVIDER_HEALTH_DATE_MISSING');
    if (row[key] !== args.day)
      throw new PersonalProviderError('PROVIDER_HEALTH_DATE_MISMATCH');
  };
  const shape = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    return record(value);
  };
  const add = (row: Record<string, any> | null, fields: readonly Field[]) => {
    const dateFields = ['date', 'calendarDate', 'summaryDate'];
    if (
      row &&
      Object.keys(row).some((key) => !dateFields.includes(key)) &&
      !fields.some(([, path]) => path.split('.')[0] in row)
    )
      throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    for (const [metricType, path, unit] of fields) {
      managed.add(metricType);
      const value = row && at(row, path);
      if (value == null || (typeof value === 'number' && value < 0)) continue;
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
      const candidate: ExternalHealthMetricCandidate = {
        provider: 'GARMIN',
        metricType,
        externalId: `${args.accountId}:${args.day}:${metricType}`,
        ...healthDay(args.day, args.timezone),
        value,
        unit,
        aggregation: 'LATEST',
        timezone: args.timezone,
        connectionId: args.connectionId,
        sourceObjectId: args.sourceObjectId,
        sourceNamespace: `garmin:${args.accountId}`,
        sourceName: 'Garmin Personal API',
        sourcePriority: 70,
      };
      try {
        assertHealthMetricCandidate(candidate);
      } catch {
        throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
      }
      candidates.set(metricType, candidate);
    }
  };
  const dated = (value: unknown, fields: readonly Field[]) => {
    if (value === null) {
      add(null, fields);
      return;
    }
    const row = shape(value);
    date(row);
    // A date-only object is an explicit empty day. Unknown layouts fail closed.
    if (
      Object.keys(row).some((k) => k !== 'calendarDate') &&
      !fields.some(([, path]) => path.split('.')[0] in row)
    )
      throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    add(row, fields);
  };
  const oneDay = (value: unknown, key: string) => {
    if (!Array.isArray(value))
      throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    if (value.length > 1)
      throw new PersonalProviderError('PROVIDER_HEALTH_CONFLICT');
    if (!value.length) return null;
    const row = shape(value[0]);
    date(row, key);
    return row;
  };
  if (args.summary !== undefined) {
    const row =
      args.summary === null
        ? null
        : oneDay(shape(args.summary).data, 'calendarDate');
    if (row && !Object.keys(SUMMARY_FIELDS).some((key) => key in row))
      throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    for (const [key, fields] of Object.entries(SUMMARY_FIELDS)) {
      const group = row?.[key];
      if (group != null) shape(group);
      add(group == null ? null : group, fields);
    }
  }
  if (args.sleep !== undefined) dated(args.sleep, SLEEP_FIELDS);
  if (args.hrv !== undefined)
    dated(args.hrv === null ? null : shape(args.hrv).hrvSummary, HRV_FIELDS);
  if (args.bodyBattery !== undefined) {
    const row =
      args.bodyBattery === null ? null : oneDay(args.bodyBattery, 'date');
    // Dedicated report takes precedence for charged/drained only. Its empty
    // response cannot wipe a value already supplied by the daily summary.
    add(row, BB_FIELDS);
  }
  if (args.spo2 !== undefined) dated(args.spo2, SPO2_FIELDS);
  if (args.weight !== undefined) {
    let latest: Record<string, any> | null = null;
    if (args.weight === null) {
      latest = null;
    } else if (Array.isArray(args.weight)) {
      // weight/all returns WeightMeasurement[] in kg. Keep the latest sample for this day.
      const matches = args.weight.map((item) => shape(item)).filter((row) => {
        if (row.calendarDate !== args.day) return false;
        if (row.weight == null) return false;
        if (typeof row.weight !== 'number' || !Number.isFinite(row.weight))
          throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
        // Reject legacy gram-scale payloads instead of silently writing wrong kg values.
        if (row.weight > 1000)
          throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
        return true;
      });
      matches.sort((a, b) => {
        const at = String(a.timestampGMT ?? a.date ?? '');
        const bt = String(b.timestampGMT ?? b.date ?? '');
        return at.localeCompare(bt);
      });
      latest = matches.length ? matches[matches.length - 1]! : null;
    } else {
      const body = shape(args.weight);
      if (Array.isArray(body.dateWeightList))
        throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
      const row = oneDay(body.dailyWeightSummaries, 'summaryDate');
      latest = row?.latestWeight == null ? null : shape(row.latestWeight);
      if (
        row &&
        ((!('latestWeight' in row) && row.numOfWeightEntries !== 0) ||
          (row.numOfWeightEntries > 0 && !latest))
      )
        throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    }
    if (latest) date(latest);
    add(latest, WEIGHT_FIELDS);
  }
  return {
    candidates: [...candidates.values()],
    managedMetricTypes: [...managed],
  };
}
export function garminHealthCandidates(
  args: Args,
): ExternalHealthMetricCandidate[] {
  return garminHealthProjection(args).candidates;
}
