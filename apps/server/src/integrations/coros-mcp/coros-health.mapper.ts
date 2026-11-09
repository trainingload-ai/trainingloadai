import type { ExternalHealthMetricCandidate } from '@/health-data/health-data-ingest.service';
import { assertHealthMetricCandidate } from '@/health-data/health-metric-contract';
import { healthDay, dateLabel } from '../personal/personal-dates';
import { PersonalProviderError, record } from '../personal/personal-errors';

// Only self-describing fields/units are admitted. Generic "HRV" does not prove RMSSD.
const fields: Record<string, [string, string, number?]> = {
  steps: ['STEP_COUNT', 'count'],
  totalSteps: ['STEP_COUNT', 'count'],
  restingHeartRateBpm: ['RESTING_HEART_RATE_BPM', 'bpm'],
  sleepTimeSeconds: ['SLEEP_ASLEEP_SECONDS', 's'],
  deepSleepSeconds: ['SLEEP_DEEP_SECONDS', 's'],
  lightSleepSeconds: ['SLEEP_CORE_SECONDS', 's'],
  remSleepSeconds: ['SLEEP_REM_SECONDS', 's'],
  awakeSleepSeconds: ['SLEEP_AWAKE_SECONDS', 's'],
  rmssdMs: ['HRV_RMSSD_MS', 'ms'],
  sleepScore: ['SLEEP_SCORE', 'score'],
  activeKilocalories: ['ACTIVE_ENERGY_KCAL', 'kcal'],
  totalKilocalories: ['TOTAL_ENERGY_KCAL', 'kcal'],
  totalDistanceMeters: ['WALKING_RUNNING_DISTANCE_M', 'm'],
  averageSpO2Percent: ['SPO2_AVG_PERCENT', 'percent'],
};
const quantities: Record<string, [string, string]> = {
  restingHeartRate: ['RESTING_HEART_RATE_BPM', 'bpm'],
  sleepDuration: ['SLEEP_ASLEEP_SECONDS', 's'],
  rmssd: ['HRV_RMSSD_MS', 'ms'],
  stress: ['STRESS_LEVEL_AVG', 'score'],
};

export function corosHealthCandidates(args: {
  day: string;
  timezone: string;
  accountId: string;
  connectionId: string;
  sourceObjectId: string;
  snapshot: Record<string, unknown>;
}): {
  candidates: ExternalHealthMetricCandidate[];
  managedMetricTypes: string[];
} {
  const candidates = new Map<string, ExternalHealthMetricCandidate>(),
    managed = new Set<string>();
  const add = (metricType: string, unit: string, value: unknown) => {
    managed.add(metricType);
    if (value == null) return;
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    const candidate: ExternalHealthMetricCandidate = {
      provider: 'COROS',
      metricType,
      externalId: `${args.accountId}:${args.day}:${metricType}`,
      ...healthDay(args.day, args.timezone),
      value,
      unit,
      aggregation: 'LATEST',
      connectionId: args.connectionId,
      sourceObjectId: args.sourceObjectId,
      sourceNamespace: `coros:${args.accountId}`,
      sourceName: 'COROS MCP',
      timezone: args.timezone,
    };
    assertHealthMetricCandidate(candidate);
    const previous = candidates.get(metricType);
    if (previous && previous.value !== value)
      throw new PersonalProviderError('PROVIDER_HEALTH_CONFLICT');
    candidates.set(metricType, candidate);
  };
  const visit = (value: unknown, inheritedDate?: string, depth = 0) => {
    if (depth > 8)
      throw new PersonalProviderError('PROVIDER_HEALTH_SCHEMA_UNSUPPORTED');
    if (Array.isArray(value)) {
      value.forEach((v) => visit(v, inheritedDate, depth + 1));
      return;
    }
    const item = record(value);
    const raw = item.date ?? item.calendarDate ?? item.day;
    let day = inheritedDate;
    if (raw !== undefined) {
      const text = String(raw);
      day = dateLabel(
        /^\d{8}$/.test(text)
          ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`
          : text,
      );
    }
    for (const [key, [metric, unit]] of Object.entries(fields))
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        if (!day)
          throw new PersonalProviderError('PROVIDER_HEALTH_DATE_MISSING');
        if (day === args.day) add(metric, unit, item[key]);
      }
    for (const [key, [metric, unit]] of Object.entries(quantities))
      if (item[key] && typeof item[key] === 'object') {
        const quantity = record(item[key]);
        if (!day)
          throw new PersonalProviderError('PROVIDER_HEALTH_DATE_MISSING');
        if (day === args.day) {
          if (quantity.unit !== unit)
            throw new PersonalProviderError('PROVIDER_HEALTH_UNIT_UNSUPPORTED');
          add(metric, unit, quantity.value);
        }
      }
    for (const key of [
      'data',
      'days',
      'records',
      'sleepList',
      'summaries',
      'metrics',
    ])
      if (item[key] && typeof item[key] === 'object')
        visit(item[key], day, depth + 1);
  };
  Object.values(args.snapshot).forEach((value) => visit(value));
  return {
    candidates: [...candidates.values()],
    managedMetricTypes: [...managed],
  };
}
