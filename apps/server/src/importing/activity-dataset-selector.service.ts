import { Injectable } from '@nestjs/common';
import type {
  CanonicalActivityPayload,
  CanonicalRecord,
} from './canonical-activity.types';
import type { Activity } from '@prisma/client';

export type DatasetQuality = {
  version: 'v1' | 'v2';
  profile?: DatasetQualityProfile;
  score: number;
  recordCount: number;
  recordDensity: number;
  gpsCoverage: number;
  heartRateCoverage: number;
  powerCoverage: number;
  cadenceCoverage: number;
  speedCoverage?: number;
  lapCount: number;
  lengthCount: number;
  strengthSetCount?: number;
  activeStrengthSetCount?: number;
  strengthExerciseCoverage?: number;
  strengthDetailCoverage?: number;
};

export type DatasetQualityProfile =
  | 'RUN'
  | 'CYCLING'
  | 'SWIM'
  | 'STRENGTH'
  | 'GENERIC';

export const ACTIVITY_DATASET_QUALITY_VERSION = 'v2' as const;

function coverage(
  records: CanonicalRecord[],
  predicate: (r: CanonicalRecord) => boolean,
) {
  if (!records.length) return 0;
  return records.filter(predicate).length / records.length;
}

function boundedCoverageScore(value: number, weight: number) {
  return Math.max(0, Math.min(1, value)) * weight;
}

function densityScore(recordDensity: number, weight: number) {
  // 0.5 Hz 已足以支持大多数活动分析；更高频率不再额外加分。
  return Math.min(weight, Math.max(0, recordDensity) * weight * 2);
}

function countScore(count: number, target: number, weight: number) {
  return Math.min(weight, (Math.max(0, count) / target) * weight);
}

function qualityProfile(
  payload: CanonicalActivityPayload,
): DatasetQualityProfile {
  const strengthSets = payload.strengthSets ?? [];
  const strengthHints = [
    payload.summary.subSportType,
    payload.metadata?.trackswapSubSport,
    payload.metadata?.trackswapSubSportRaw,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toUpperCase();
  if (
    strengthSets.length > 0 ||
    strengthHints.includes('STRENGTH') ||
    strengthHints.includes('WEIGHT')
  ) {
    return 'STRENGTH';
  }
  switch (payload.summary.sportType) {
    case 'RUN':
      return 'RUN';
    case 'CYCLING':
      return 'CYCLING';
    case 'SWIM':
      return 'SWIM';
    default:
      return 'GENERIC';
  }
}

/**
 * 评估活动数据集质量
 * 当 同一个活动存在多个数据来源时，哪个来源的数据更完整，应该作为 PRIMARY 数据集。
 * 例如同一次骑行可能同时来自：
    - Garmin 原始 FIT：1 秒一条 Record，有 GPS、心率、功率和踏频；
    - Intervals.icu：只有活动汇总和少量 Record；
    - 手动上传文件：可能只有路线，没有功率。
    系统不能把它们都当成主数据，否则 Parquet、Lap 和指标计算来源会混乱，所以需要选一个 PRIMARY。
    评分内容
    满分约 100 分：
    - Record 密度：25 分；
    - GPS 覆盖率：20 分；
    - 心率覆盖率：15 分；
    - 功率覆盖率：15 分；
    - 踏频覆盖率：10 分；
    - Lap：10 分；
    - Swim Length：5 分。
 * @param payload
 * @returns
 */
export function evaluateActivityDataset(
  payload: CanonicalActivityPayload,
): DatasetQuality {
  const records = payload.records ?? [];
  const laps = payload.laps ?? [];
  const lengths = payload.lengths ?? [];
  const elapsed = Math.max(payload.summary.elapsedTime ?? 0, 1);
  const recordDensity = records.length / elapsed;
  const gpsCoverage = coverage(
    records,
    (record) => record.positionLat != null && record.positionLong != null,
  );
  const heartRateCoverage = coverage(
    records,
    (record) => record.heartRate != null,
  );
  const powerCoverage = coverage(records, (record) => record.power != null);
  const cadenceCoverage = coverage(records, (record) => record.cadence != null);
  const speedCoverage = coverage(records, (record) => record.speed != null);
  const strengthSets = payload.strengthSets ?? [];
  const activeStrengthSets = strengthSets.filter(
    (set) => set.setType !== 'REST',
  );
  const strengthExerciseCoverage = activeStrengthSets.length
    ? activeStrengthSets.filter((set) => set.exercises.length > 0).length /
      activeStrengthSets.length
    : 0;
  const strengthDetailCoverage = activeStrengthSets.length
    ? activeStrengthSets.filter(
        (set) =>
          (set.repetitions != null && set.repetitions > 0) ||
          (set.durationSeconds != null && set.durationSeconds > 0) ||
          set.weightKg != null,
      ).length / activeStrengthSets.length
    : 0;
  const profile = qualityProfile(payload);
  const scores: Record<DatasetQualityProfile, number> = {
    RUN:
      densityScore(recordDensity, 20) +
      boundedCoverageScore(gpsCoverage, 20) +
      boundedCoverageScore(heartRateCoverage, 20) +
      boundedCoverageScore(speedCoverage, 15) +
      boundedCoverageScore(powerCoverage, 10) +
      boundedCoverageScore(cadenceCoverage, 10) +
      countScore(laps.length, 5, 5),
    CYCLING:
      densityScore(recordDensity, 15) +
      boundedCoverageScore(gpsCoverage, 10) +
      boundedCoverageScore(heartRateCoverage, 15) +
      boundedCoverageScore(speedCoverage, 10) +
      boundedCoverageScore(powerCoverage, 30) +
      boundedCoverageScore(cadenceCoverage, 15) +
      countScore(laps.length, 5, 5),
    SWIM:
      densityScore(recordDensity, 10) +
      boundedCoverageScore(heartRateCoverage, 15) +
      boundedCoverageScore(speedCoverage, 15) +
      boundedCoverageScore(cadenceCoverage, 10) +
      countScore(lengths.length, 20, 35) +
      countScore(laps.length, 5, 15),
    STRENGTH:
      densityScore(recordDensity, 10) +
      boundedCoverageScore(heartRateCoverage, 15) +
      countScore(activeStrengthSets.length, 10, 35) +
      boundedCoverageScore(strengthExerciseCoverage, 25) +
      boundedCoverageScore(strengthDetailCoverage, 15),
    GENERIC:
      densityScore(recordDensity, 30) +
      boundedCoverageScore(gpsCoverage, 15) +
      boundedCoverageScore(heartRateCoverage, 25) +
      boundedCoverageScore(speedCoverage, 10) +
      boundedCoverageScore(cadenceCoverage, 10) +
      countScore(laps.length, 5, 5) +
      countScore(lengths.length, 20, 5),
  };
  const score = Math.round(scores[profile]);
  return {
    version: ACTIVITY_DATASET_QUALITY_VERSION,
    profile,
    score,
    recordCount: records.length,
    recordDensity,
    gpsCoverage,
    heartRateCoverage,
    powerCoverage,
    cadenceCoverage,
    speedCoverage,
    lapCount: laps.length,
    lengthCount: lengths.length,
    strengthSetCount: strengthSets.length,
    activeStrengthSetCount: activeStrengthSets.length,
    strengthExerciseCoverage,
    strengthDetailCoverage,
  };
}

@Injectable()
export class ActivityDatasetSelectorService {
  /**
   * 评估活动数据集质量
   * @param payload
   * @returns
   */
  evaluate(payload: CanonicalActivityPayload): DatasetQuality {
    // 评估活动数据集质量
    return evaluateActivityDataset(payload);
  }

  evaluateLegacyActivity(
    activity: Pick<
      Activity,
      | 'elapsedTime'
      | 'timerTime'
      | 'startLat'
      | 'startLng'
      | 'avgHeartRate'
      | 'maxHeartRate'
      | 'minHeartRate'
      | 'avgPower'
      | 'maxPower'
      | 'minPower'
      | 'avgCadence'
      | 'maxCadence'
      | 'numLaps'
      | 'numLengths'
    >,
    parquetFiles: ReadonlyArray<{
      type?: string | null;
      pointCount?: number | null;
    }>,
  ): DatasetQuality {
    const recordCount = Math.max(
      0,
      ...parquetFiles
        .filter((file) => (file.type ?? 'record') === 'record')
        .map((file) => Number(file.pointCount ?? 0)),
    );
    const lengthCount = Math.max(
      Number(activity.numLengths ?? 0),
      ...parquetFiles
        .filter((file) => file.type === 'length')
        .map((file) => Number(file.pointCount ?? 0)),
    );
    const elapsed = Math.max(
      Number(activity.elapsedTime ?? activity.timerTime ?? 0),
      1,
    );
    const recordDensity = recordCount / elapsed;
    const gpsCoverage =
      activity.startLat != null && activity.startLng != null ? 0.25 : 0;
    const heartRateCoverage =
      activity.avgHeartRate != null ||
      activity.maxHeartRate != null ||
      activity.minHeartRate != null
        ? 0.5
        : 0;
    const powerCoverage =
      activity.avgPower != null ||
      activity.maxPower != null ||
      activity.minPower != null
        ? 0.5
        : 0;
    const cadenceCoverage =
      activity.avgCadence != null || activity.maxCadence != null ? 0.5 : 0;
    const lapCount = Math.max(Number(activity.numLaps ?? 0), 0);
    const score = Math.round(
      Math.min(25, recordDensity * 50) +
        gpsCoverage * 20 +
        heartRateCoverage * 15 +
        powerCoverage * 15 +
        cadenceCoverage * 10 +
        Math.min(10, lapCount * 2) +
        Math.min(5, lengthCount / 10),
    );
    return {
      version: 'v1',
      score,
      recordCount,
      recordDensity,
      gpsCoverage,
      heartRateCoverage,
      powerCoverage,
      cadenceCoverage,
      lapCount,
      lengthCount,
    };
  }

  shouldPromote(args: {
    incoming: DatasetQuality;
    current?: DatasetQuality | null;
    sameChecksum: boolean;
  }) {
    if (args.sameChecksum) return false;
    if (!args.current) return args.incoming.score >= 10;
    // 留出滞回区间，避免同质量来源在反复同步时来回切换。
    return args.incoming.score >= args.current.score + 10;
  }
}
