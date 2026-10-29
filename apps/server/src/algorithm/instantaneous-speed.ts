import {
  sanitizeInstantaneousSpeedSeries,
  type InstantaneousSpeedSport,
} from '@shared/instantaneous-speed';

export type ActivitySpeedRecord = {
  timestamp?: string | number | Date | null;
  speed?: number | null;
  enhancedSpeed?: number | null;
};

/**
 * 对导入后的标准 record 就地字段语义做防御性清洗。
 * 原始上传文件仍保持不可变；返回值用于 canonical Parquet 与派生指标。
 */
export function sanitizeActivityRecordSpeeds<T extends ActivitySpeedRecord>(
  records: readonly T[],
  sportType?: string | null,
): T[] {
  const sport = supportedSport(sportType);
  if (!sport || records.length === 0) return [...records];

  const result = sanitizeInstantaneousSpeedSeries(
    records.map((record, index) => ({
      timestampMs: timestampMs(record.timestamp, index),
      speedMetersPerSecond: preferredRecordSpeed(record),
    })),
    sport,
  );
  if (result.correctedIndexes.length === 0) return [...records];

  const corrected = new Set(result.correctedIndexes);
  return records.map((record, index) => {
    if (!corrected.has(index)) return record;
    const speed = result.speedsMetersPerSecond[index];
    const hasEnhancedSpeed = Object.prototype.hasOwnProperty.call(
      record,
      'enhancedSpeed',
    );
    return {
      ...record,
      speed: speed ?? undefined,
      ...(hasEnhancedSpeed ? { enhancedSpeed: speed } : {}),
    } as T;
  });
}

export function sanitizedActivitySpeedSeries(
  records: readonly ActivitySpeedRecord[],
  sportType: InstantaneousSpeedSport,
) {
  return sanitizeInstantaneousSpeedSeries(
    records.map((record, index) => ({
      timestampMs: timestampMs(record.timestamp, index),
      speedMetersPerSecond: preferredRecordSpeed(record),
    })),
    sportType,
  ).speedsMetersPerSecond;
}

function preferredRecordSpeed(record: ActivitySpeedRecord) {
  return (
    finiteNonNegative(record.enhancedSpeed) ?? finiteNonNegative(record.speed)
  );
}

function timestampMs(value: ActivitySpeedRecord['timestamp'], index: number) {
  const parsed =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Date.parse(value)
          : Number.NaN;
  return Number.isFinite(parsed) ? parsed : index * 1_000;
}

function supportedSport(
  sportType?: string | null,
): InstantaneousSpeedSport | null {
  if (sportType === 'RUN' || sportType === 'CYCLING') return sportType;
  return null;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
