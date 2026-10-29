import type { SportType, UserFitnessMetricType } from '@prisma/client';
import type { IntervalsIcuWellness } from '@/integrations/intervals-icu/intervals-icu.client';

/** 写入 `UserFitnessMetric` 的规范化条目（当前 FITNESS_UPDATED 只出 VO₂max）。 */
export type IntervalsIcuFitnessMetricWrite = {
  type: UserFitnessMetricType;
  value: number;
  sport: SportType;
  recordedAt: Date;
  value2?: number;
  externalId: string;
};

function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** wellness/fitness record.id（YYYY-MM-DD）→ 当日 UTC 0 点。 */
function dayStartFromRecordId(record: IntervalsIcuWellness) {
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) return null;
  const date = new Date(`${id}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * FITNESS_UPDATED → `UserFitnessMetric` 写入列表。
 * 刻意只映射 VO₂max；eFTP / W′ / P-Max 等平台估算值不得写入本地 FTP 等正式设置。
 */
export function mapIntervalsIcuFitnessRecordsToMetricWrites(args: {
  externalAthleteId?: string | null;
  records: IntervalsIcuWellness[];
}) {
  const writes: IntervalsIcuFitnessMetricWrite[] = [];
  const athletePart = String(args.externalAthleteId || '0');

  for (const record of args.records) {
    const recordedAt = dayStartFromRecordId(record);
    if (!recordedAt) continue;
    const dateKey =
      typeof record.id === 'string'
        ? record.id.trim()
        : recordedAt.toISOString().slice(0, 10);

    const vo2max = numberValue(record.vo2max);
    if (vo2max != null) {
      writes.push({
        type: 'VO2_MAX',
        value: vo2max,
        sport: 'UNKNOWN',
        recordedAt,
        externalId: `intervals-icu:fitness:${athletePart}:${dateKey}:VO2_MAX`,
      });
    }
  }

  return writes;
}
