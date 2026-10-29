import type { ExternalHealthMetricCandidate } from '@/health-data/health-data-ingest.service';
import type { IntervalsIcuWellness } from '@/integrations/intervals-icu/intervals-icu.client';

/** 统一健康管道中 Intervals.icu 的来源优先级。 */
const INTERVALS_ICU_SOURCE_PRIORITY = 60;

export const INTERVALS_ICU_AUTHORITATIVE_DAILY_METRIC_TYPES = [
  'BODY_MASS_KG',
  'RESTING_HEART_RATE_BPM',
  'HRV_SDNN_MS',
  'SLEEP_ASLEEP_SECONDS',
  'SLEEP_SCORE',
  'SLEEP_AVG_HEART_RATE_BPM',
  'STEP_COUNT',
  'VO2_MAX',
];

const WELLNESS_FIELD_METRICS: Array<{
  fields: Array<keyof IntervalsIcuWellness>;
  metricType: string;
}> = [
  { fields: ['weight'], metricType: 'BODY_MASS_KG' },
  { fields: ['restingHR'], metricType: 'RESTING_HEART_RATE_BPM' },
  { fields: ['hrvSDNN', 'hrv'], metricType: 'HRV_SDNN_MS' },
  { fields: ['sleepSecs'], metricType: 'SLEEP_ASLEEP_SECONDS' },
  { fields: ['sleepScore'], metricType: 'SLEEP_SCORE' },
  { fields: ['avgSleepingHR'], metricType: 'SLEEP_AVG_HEART_RATE_BPM' },
  { fields: ['steps'], metricType: 'STEP_COUNT' },
  { fields: ['vo2max'], metricType: 'VO2_MAX' },
];

/** Webhook wellness 是 field patch；只返回 payload 明确携带字段的管理范围。 */
export function intervalsIcuWellnessPatchMetricTypes(
  record: IntervalsIcuWellness,
) {
  return WELLNESS_FIELD_METRICS.filter(({ fields }) =>
    fields.some((field) => Object.prototype.hasOwnProperty.call(record, field)),
  ).map(({ metricType }) => metricType);
}

type IntervalsIcuHealthInput = {
  externalAthleteId?: string | null;
  connectionId?: string | null;
  record: IntervalsIcuWellness;
};

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** wellness.id（YYYY-MM-DD）→ 日期键；非法则 null。 */
export function dateKeyFromWellness(record: IntervalsIcuWellness) {
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(id)) return id;
  return null;
}

function dayStart(dateKey: string) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function accountPart(externalAthleteId?: string | null) {
  return String(externalAthleteId || '0');
}

/** 构造单条 ExternalHealthMetricCandidate（日粒度 wellness）。 */
function baseCandidate(args: {
  input: IntervalsIcuHealthInput;
  metricType: string;
  dateKey: string;
  localDate: Date;
  value: number;
  unit: string;
  field: string;
  metadata?: Record<string, unknown>;
}): ExternalHealthMetricCandidate {
  return {
    provider: 'INTERVALS_ICU',
    connectionId: args.input.connectionId,
    metricType: args.metricType,
    externalId: `intervals-icu:wellness:${accountPart(
      args.input.externalAthleteId,
    )}:${args.dateKey}:${args.metricType}`,
    localDate: args.localDate,
    startTime: args.localDate,
    endTime: addUtcDays(args.localDate, 1),
    value: args.value,
    unit: args.unit,
    sourceName: 'Intervals.icu',
    sourcePriority: INTERVALS_ICU_SOURCE_PRIORITY,
    aggregation: 'LATEST',
    rawPayload: args.input.record as Record<string, unknown>,
    metadata: {
      date: args.dateKey,
      grain: 'DAILY_SUMMARY',
      intervalsIcuField: args.field,
      granularity: 'daily_wellness',
      ...(args.metadata ?? {}),
    },
  };
}

/** 兼容旧字段：`hrv` 回填到 `hrvSDNN`。 */
function normalizeWellnessRecord(
  record: IntervalsIcuWellness,
): IntervalsIcuWellness {
  return {
    ...record,
    hrvSDNN: record.hrvSDNN ?? record.hrv ?? null,
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
  const record = normalizeWellnessRecord(input.record);
  const dateKey = dateKeyFromWellness(record);
  if (!dateKey) return [];
  const localDate = dayStart(dateKey);
  if (!localDate) return [];

  const normalizedInput = { ...input, record };
  const candidates: ExternalHealthMetricCandidate[] = [];
  const addMetric = (
    metricType: string,
    field: keyof IntervalsIcuWellness,
    unit: string,
    metadata?: Record<string, unknown>,
  ) => {
    const value = numberValue(record[field]);
    if (value == null) return;
    candidates.push(
      baseCandidate({
        input: normalizedInput,
        metricType,
        dateKey,
        localDate,
        value,
        unit,
        field: String(field),
        metadata,
      }),
    );
  };

  addMetric('BODY_MASS_KG', 'weight', 'kg');
  addMetric('RESTING_HEART_RATE_BPM', 'restingHR', 'bpm');
  addMetric('HRV_SDNN_MS', 'hrvSDNN', 'ms');
  addMetric('SLEEP_ASLEEP_SECONDS', 'sleepSecs', 's');
  addMetric('SLEEP_SCORE', 'sleepScore', 'score');
  addMetric('SLEEP_AVG_HEART_RATE_BPM', 'avgSleepingHR', 'bpm');
  addMetric('STEP_COUNT', 'steps', 'count');
  addMetric('VO2_MAX', 'vo2max', 'ml/kg/min');

  return candidates;
}
