import type { SportType, UserFitnessMetricType } from '@prisma/client';
import type {
  IntervalsIcuAthlete,
  IntervalsIcuSportSettings,
} from '@/integrations/intervals-icu/intervals-icu.client';

/** 从 athlete / sportSettings 抽出的正式运动设置写入项。 */
export type IntervalsIcuSportSettingsMetricWrite = {
  type: UserFitnessMetricType;
  value: number;
  sport: SportType;
  value2?: number;
};

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Intervals.icu 运动名/类型字符串 → 我方 SportType。 */
function mapSportKey(value: unknown): SportType {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('run')) return 'RUN';
  if (
    text.includes('ride') ||
    text.includes('bike') ||
    text.includes('cycling')
  ) {
    return 'CYCLING';
  }
  if (text.includes('swim')) return 'SWIM';
  return 'UNKNOWN';
}

/** 有效数值则 push 一条运动设置写入项。 */
function pushMetric(
  writes: IntervalsIcuSportSettingsMetricWrite[],
  type: UserFitnessMetricType,
  value: unknown,
  sport: SportType,
  value2?: unknown,
) {
  const parsed = numberValue(value);
  if (parsed == null) return;
  const parsed2 = value2 == null ? undefined : numberValue(value2);
  writes.push({
    type,
    value: parsed,
    sport,
    ...(parsed2 != null ? { value2: parsed2 } : {}),
  });
}

function sportFromSettings(settings: IntervalsIcuSportSettings): SportType {
  const primaryType = Array.isArray(settings.types)
    ? settings.types[0]
    : undefined;
  return mapSportKey(primaryType);
}

/**
 * 将 `/athlete/0`（WithSportSettings）映射为本地正式运动设置指标。
 * 只读 OpenAPI 字段：`icu_resting_hr` 与 `sportSettings[]`。
 */
export function mapIntervalsIcuAthleteToSportSettingsMetrics(
  athlete: IntervalsIcuAthlete,
) {
  const writes: IntervalsIcuSportSettingsMetricWrite[] = [];

  pushMetric(writes, 'RESTING_HR', athlete.icu_resting_hr, 'UNKNOWN');

  const sportSettings = Array.isArray(athlete.sportSettings)
    ? athlete.sportSettings
    : [];
  for (const settings of sportSettings) {
    if (!settings || typeof settings !== 'object') continue;
    const sport = sportFromSettings(settings);
    pushMetric(writes, 'FTP', settings.ftp, sport);
    pushMetric(writes, 'FTP', settings.indoor_ftp, sport);
    pushMetric(writes, 'LTHR', settings.lthr, sport);
    pushMetric(writes, 'MAX_HR', settings.max_hr, sport);
    pushMetric(writes, 'RESTING_HR', settings.resting_hr, sport);
    pushMetric(writes, 'CS', settings.threshold_pace, sport);
    pushMetric(writes, 'P_MAX', settings.p_max, sport);
    pushMetric(writes, 'W_PRIME', settings.w_prime, sport);
  }

  return writes;
}
