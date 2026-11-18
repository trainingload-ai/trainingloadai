import type { ExternalHealthMetricCandidate } from '@/health-data/health-data-ingest.service';
import { healthLocalDayBounds } from '@/health-data/health-local-day';
import type { IntervalsIcuWellness } from '@/integrations/intervals-icu/intervals-icu.client';

/** 统一健康管道中 Intervals.icu 的来源优先级。 */
const INTERVALS_ICU_SOURCE_PRIORITY = 60;

/** wellness 字段与指标类型的映射关系。 */
// Official API units are metric; hrv is rMSSD, not an alias for hrvSDNN.
// https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090
// https://forum.intervals.icu/t/hrv-wellness-fields/2754
const WELLNESS_FIELD_METRICS: Array<{
  field: keyof IntervalsIcuWellness;
  metricType: string;
  unit: string;
}> = [
  { field: 'weight', metricType: 'BODY_MASS_KG', unit: 'kg' },
  { field: 'restingHR', metricType: 'RESTING_HEART_RATE_BPM', unit: 'bpm' },
  { field: 'hrv', metricType: 'HRV_RMSSD_MS', unit: 'ms' },
  { field: 'hrvSDNN', metricType: 'HRV_SDNN_MS', unit: 'ms' },
  { field: 'sleepSecs', metricType: 'SLEEP_ASLEEP_SECONDS', unit: 's' },
  { field: 'sleepScore', metricType: 'SLEEP_SCORE', unit: 'score' },
  {
    field: 'avgSleepingHR',
    metricType: 'SLEEP_AVG_HEART_RATE_BPM',
    unit: 'bpm',
  },
  { field: 'steps', metricType: 'STEP_COUNT', unit: 'count' },
  { field: 'vo2max', metricType: 'VO2_MAX', unit: 'ml/kg/min' },
];

export const INTERVALS_ICU_AUTHORITATIVE_DAILY_METRIC_TYPES =
  WELLNESS_FIELD_METRICS.map(({ metricType }) => metricType);

export const INTERVALS_ICU_WELLNESS_SYNC_FIELDS = [
  'id',
  'updated',
  'tempWeight',
  'tempRestingHR',
  ...WELLNESS_FIELD_METRICS.map(({ field }) => field),
];

/** Webhook wellness 是 field patch；只返回 payload 明确携带字段的管理范围。 */
export function intervalsIcuWellnessPatchMetricTypes(
  record: IntervalsIcuWellness,
) {
  return WELLNESS_FIELD_METRICS.filter(({ field }) =>
    Object.prototype.hasOwnProperty.call(record, field),
  ).map(({ metricType }) => metricType);
}

type IntervalsIcuHealthInput = {
  externalAthleteId?: string | null;
  connectionId?: string | null;
  /** Source account timezone; callers supply their account fallback when absent. */
  timezone?: string | null;
  record: IntervalsIcuWellness;
};

export type IntervalsIcuWellnessDailyPatch = {
  localDate: Date;
  managedMetricTypes: string[];
  candidates: ExternalHealthMetricCandidate[];
};

function numberValue(value: unknown) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Invalid Intervals.icu wellness numeric value');
  }
  return value;
}

/** wellness.id（YYYY-MM-DD）→ 日期键；非法则 null。 */
export function dateKeyFromWellness(record: IntervalsIcuWellness) {
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) return null;
  const date = new Date(`${id}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) &&
    date.toISOString().slice(0, 10) === id
    ? id
    : null;
}

/** An update timestamp must identify an absolute instant, not host-local time. */
function sourceUpdateTime(value?: string | null) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) return null;
  const date = new Date(text);
  return Number.isFinite(date.valueOf()) ? date : null;
}

function accountPart(externalAthleteId?: string | null) {
  return String(externalAthleteId || '0');
}

/** 构造单条 ExternalHealthMetricCandidate（日粒度 wellness）。 */
function baseCandidate(args: {
  input: IntervalsIcuHealthInput;
  metricType: string;
  dateKey: string;
  day: ReturnType<typeof healthLocalDayBounds>;
  sourceUpdatedAt: Date | null;
  value: number;
  unit: string;
  field: keyof IntervalsIcuWellness;
}): ExternalHealthMetricCandidate {
  return {
    provider: 'INTERVALS_ICU',
    connectionId: args.input.connectionId,
    metricType: args.metricType,
    externalId: `intervals-icu:wellness:${accountPart(
      args.input.externalAthleteId,
    )}:${args.dateKey}:${args.metricType}`,
    localDate: args.day.date,
    startTime: args.day.start,
    endTime: args.day.end,
    timezone: args.day.timezone,
    sourceUpdatedAt: args.sourceUpdatedAt,
    sourceNamespace: `intervals_icu:${accountPart(args.input.externalAthleteId)}`,
    value: args.value,
    unit: args.unit,
    sourceName: 'Intervals.icu',
    sourcePriority: INTERVALS_ICU_SOURCE_PRIORITY,
    aggregation: 'LATEST',
    rawPayload: {
      id: args.input.record.id,
      [args.field]: args.input.record[args.field],
      ...(args.input.record.updated !== undefined
        ? { updated: args.input.record.updated }
        : {}),
      ...(args.field === 'weight' && args.input.record.tempWeight !== undefined
        ? { tempWeight: args.input.record.tempWeight }
        : {}),
      ...(args.field === 'restingHR' &&
      args.input.record.tempRestingHR !== undefined
        ? { tempRestingHR: args.input.record.tempRestingHR }
        : {}),
    },
    metadata: {
      date: args.dateKey,
      grain: 'DAILY_SUMMARY',
      intervalsIcuField: args.field,
      granularity: 'daily_wellness',
      timeRangeBasis: 'LOCAL_DAY',
    },
  };
}

/**
 * intervals_icu wellness → 统一健康候选指标。
 * @param input intervals_icu wellness 输入
 * @returns 统一健康候选指标
 */
export function mapIntervalsIcuWellnessToHealthCandidates(
  input: IntervalsIcuHealthInput,
) {
  const record = input.record;
  const dateKey = dateKeyFromWellness(record);
  if (!dateKey) return [];
  const day = healthLocalDayBounds(dateKey, input.timezone);
  const sourceUpdatedAt = sourceUpdateTime(record.updated);

  const candidates: ExternalHealthMetricCandidate[] = [];
  for (const { metricType, field, unit } of WELLNESS_FIELD_METRICS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    const value = numberValue(record[field]);
    if (value == null) continue;
    candidates.push(
      baseCandidate({
        input,
        metricType,
        dateKey,
        day,
        sourceUpdatedAt,
        value,
        unit,
        field,
      }),
    );
  }

  return candidates;
}

/** Map webhook records to daily patches scoped to explicitly supplied fields. */
export function mapIntervalsIcuWellnessRecordsToDailyPatches(args: {
  externalAthleteId?: string | null;
  connectionId?: string | null;
  timezone?: string | null;
  records: IntervalsIcuWellness[];
}) {
  const patches: IntervalsIcuWellnessDailyPatch[] = [];

  for (const record of args.records) {
    // record 的 id 格式为 YYYY-MM-DD，需要转换为日期键
    const dateKey = dateKeyFromWellness(record);
    if (!dateKey) continue;
    // 将 intervals_icu wellness 记录转换为统一健康候选指标，过滤掉暂时不支持的指标
    const managedMetricTypes = intervalsIcuWellnessPatchMetricTypes(record);
    // 如果需要管理的指标类型为空，则跳过
    if (managedMetricTypes.length === 0) continue;

    // 对剩余的指标类型进行转换
    const candidates = mapIntervalsIcuWellnessToHealthCandidates({
      externalAthleteId: args.externalAthleteId,
      connectionId: args.connectionId,
      timezone: args.timezone,
      record,
    });
    patches.push({
      localDate: new Date(`${dateKey}T00:00:00.000Z`),
      managedMetricTypes,
      candidates,
    });
  }

  return patches;
}
