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

/**
 * 负荷读数（Coggan / BikeScore）只拦截明确不足的功率覆盖。
 * 缺少来源质量元数据的历史活动仍可沿用已经保存的功率负荷。
 * MMP、CP/FTP/W′/Pmax 不要用这个函数。
 */
export function permitsPowerDerivedMetrics(
  evidence: MeasuredPowerEvidence | null | undefined,
): boolean {
  return evidence !== 'INSUFFICIENT';
}

/**
 * 功率峰值和 CP/FTP/W′/Pmax 只接受功率计覆盖率达标的实测样本。
 * UNKNOWN 不再放行：没有 datasetQuality 的历史活动，以及只有估算功率的活动，
 * 都不能贡献峰值或功率模型观测。估算功率仍可留给图表和负荷展示。
 */
export function permitsMeasuredPowerFitness(
  evidence: MeasuredPowerEvidence | null | undefined,
): boolean {
  return evidence === 'RELIABLE';
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
