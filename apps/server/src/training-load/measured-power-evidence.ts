/**
 * 原始活动来源中「实测功率」的可信度。
 *
 * 必须读取导入时保存的 datasetQuality，不能根据后处理后的
 * record.power / avgPower 猜测：这些字段可能已经被速度估算污染。
 */
export type MeasuredPowerEvidence = 'RELIABLE' | 'INSUFFICIENT' | 'UNKNOWN';

export type ActivitySourceWithMetadata = { metadata?: unknown };

export const MIN_RELIABLE_POWER_COVERAGE = 0.5;

export function resolveMeasuredPowerEvidence(
  sources: readonly ActivitySourceWithMetadata[] | null | undefined,
): MeasuredPowerEvidence {
  if (!sources?.length) return 'UNKNOWN';

  const coverages = sources
    .map((source) => readPowerCoverage(source.metadata))
    .filter((value): value is number => value !== null);

  if (coverages.length === 0) return 'UNKNOWN';
  return coverages.some((coverage) => coverage >= MIN_RELIABLE_POWER_COVERAGE)
    ? 'RELIABLE'
    : 'INSUFFICIENT';
}

/** 对缺少来源质量元数据的历史活动保持兼容；明确不可靠时才拦截。 */
export function permitsPowerDerivedMetrics(
  evidence: MeasuredPowerEvidence,
): boolean {
  return evidence !== 'INSUFFICIENT';
}

function readPowerCoverage(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const datasetQuality = (metadata as Record<string, unknown>).datasetQuality;
  if (!datasetQuality || typeof datasetQuality !== 'object') return null;

  const raw = (datasetQuality as Record<string, unknown>).powerCoverage;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}
