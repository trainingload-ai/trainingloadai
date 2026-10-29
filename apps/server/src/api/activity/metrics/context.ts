import type {
  Activity,
  Gender,
  PeakType,
  ScaleType,
  SportType,
  UserFitnessMetricType,
} from '@prisma/client';
import type { UserZoneSetting, UserZoneValue } from '@/utils/zones';
import type { HeartRateAnalysisResult } from '@/analyze/heart-rate/heart-rate.types';
import type {
  PaceBaseMetrics,
  PaceComputationCache,
} from '@/analyze/pace/pace-engine.service';
import type { PowerSeriesAggregates } from '@/analyze/power/power-engine.service';
import type { CogganResult } from '@/algorithm/coggan';
import type { BikeScoreResult } from '@/algorithm/BikeScore';
import type { GOVSSResult } from '@/algorithm/GOVSS';
import type { MeasuredPowerEvidence } from '@/training-load/measured-power-evidence';
import type { SensorData } from '@/analyze/analyze.interface';
import type { UserProfileResponse } from '@/api/user/user.interface';

export type CanonicalActivityRecord = {
  time: string;
  tMs: number;
  distance?: number;
  speed?: number;
  enhancedSpeed?: number;
  heartRate?: number;
  power?: number;
  calculatedPower?: number;
  cadence?: number;
  grade?: number;
  altitude?: number;
  enhancedAltitude?: number;
  gap?: number;
  aePace?: number;
};

export type UserHeartRateThreshold = {
  maxHeartRate?: number | null;
  restingHeartRate?: number | null;
  lactateThresholdHeartRate?: number | null;
  lthr?: number | null;
};

/** AnalyzeContextBuilderService.build 的稳定输出；供 power/pace preload 复用。 */
export type AnalyzeUserContext = {
  userWeight?: number;
  userHeight?: number;
  age?: number;
  gender?: Gender;
  LTHR?: number;
  MHR?: number;
  RHR?: number;
  FTP?: number;
  CP?: number;
  CS?: number;
  TP?: number;
  vVO2maxMps?: number;
  poolLength?: number;
  rpe?: number;
  vo2maxCorrectionFactor?: number;
};

export type PeakMetricListItem = { duration: number; value: number };
export type PeakMetricListKey = `list:${PeakType}:${ScaleType}`;
export type PeakIntervalObservation = {
  value: number;
  startElapsedSec: number;
  endElapsedSec: number;
  startDistanceM?: number | null;
  endDistanceM?: number | null;
  coveredSeconds: number;
  coverageRatio: number;
  algorithmVersion: number;
  parameters?: Record<string, unknown>;
};

export function toSensorData(records: CanonicalActivityRecord[]): SensorData[] {
  return records.map((r) => ({
    time: r.time,
    tMs: r.tMs,
    distance: r.distance == null ? '' : String(r.distance),
    heartRate: r.heartRate,
    power: r.power,
    calculatedPower: r.calculatedPower,
    speed: r.speed,
    enhancedSpeed: r.enhancedSpeed,
    cadence: r.cadence,
    grade: r.grade,
    altitude: r.altitude,
    enhancedAltitude: r.enhancedAltitude,
    gap: r.gap,
    aePace: r.aePace,
  }));
}
export type MetricsTaskKey =
  | 'recordsBootstrap'
  | 'calculatedPowerSummary'
  | 'activityStatistics'
  | 'maxMeanPower'
  | 'maxMeanHeartRate'
  | 'lthrObservation'
  | 'peakPace'
  | 'estimatedPowerMetrics'
  | 'derivedMetrics'
  | 'trainingEffect'
  | 'vo2Max'
  | 'bindFitnessMetrics'
  | 'heartRateBase'
  | 'heartRateTrimp'
  | 'heartRateZones'
  | 'powerBase'
  | 'powerZones'
  | 'powerCogganBike'
  | 'paceBase'
  | 'paceZones'
  | 'paceGovss'
  | 'swimScore'
  | 'calories';

export type MetricsTaskOutcome = {
  key: MetricsTaskKey;
  status: 'APPLIED' | 'IGNORED' | 'SKIPPED' | 'FAILED';
  reason?: string;
};

export type PeakMetricKey = `${PeakType}:${ScaleType}:${number}`;

export type MetricsContext = {
  inputs: {
    activity: Activity;
    userId?: string;
    sportType: SportType;
    startTime?: Date | null;
    timezone?: string | null;
    /** 从原始导入源得出的实测功率可信度；不能由处理后的 power 字段反推。 */
    measuredPowerEvidence?: MeasuredPowerEvidence;
    /** RecordsBootstrapTask 统一拉取的 canonical records（归一化结构） */
    canonicalRecords?: CanonicalActivityRecord[];
  };
  cache: {
    profile?: UserProfileResponse;
    hrThreshold?: UserHeartRateThreshold;
    fitnessMetrics?: Partial<
      Record<
        UserFitnessMetricType,
        {
          value: number;
          value2: number | null;
          provenance?: Record<string, unknown>;
        } | null
      >
    >;
    heartRateZoneSetting?: UserZoneSetting;
    heartRateSensorData?: Array<{
      time: string;
      tMs: number;
      distance?: number;
      heartRate?: number;
      power?: number;
      speed?: number;
      enhancedSpeed?: number;
    }>;
    heartRateRecords?: number[];
    /**
     * Sampling interval (seconds) inferred from sensor records.
     * Treated as a property of the activity's time axis and reused across tasks.
     */
    sampleSec?: number;
    /**
     * Keyed by `${type}:${scaleType}:${scaleValue}` for current activity.
     * Example: `power:TIME:300` => MMP5 (watts).
     */
    peakMetrics?: Partial<Record<PeakMetricKey, number>>;
    /**
     * Sensor record series keyed by joined fields, e.g. "speed,heartRate".
     */
    records?: Record<string, CanonicalActivityRecord[]>;
    peakMetricLists?: Partial<Record<PeakMetricListKey, PeakMetricListItem[]>>;
    /** 功率 metrics：PowerBaseTask.pre 组装 */
    powerPreload?: {
      powerZones: UserZoneSetting;
      context: AnalyzeUserContext;
    };
    /** PowerBaseTask.exec 写入，供 zones / coggan-bike 复用 */
    powerAggregates?: PowerSeriesAggregates;
    /** PaceBaseTask.pre：engine 输入 */
    pacePreload?: {
      paceZones: UserZoneSetting;
      context: AnalyzeUserContext;
    };
    /** PaceBaseTask.exec：供 PaceZonesTask 使用 */
    paceInternals?: PaceComputationCache;
  };
  outputs: {
    vo2max?: {
      vo2maxVdotByRace?: number | null;
      vo2maxVdotByHr?: number | null;
      vo2maxVdotByFactor?: number | null;
      vo2maxCorrectionFactor?: number | null;
    } | null;
    // 通过 mmp 估算出的 当前活动的 cp、ftp 等数据
    estimatedPowerMetrics?: {
      ecp: number | null;
      eftp: number;
      ewPrime: number | null;
      epmax: number | null;
    };
    /** Raw interval keys (e.g. "5m") → watts; filled in exec, persisted in post */
    maxMeanPower?: Record<string, number | undefined>;
    maxMeanPowerWindows?: Record<string, PeakIntervalObservation | undefined>;
    /** Raw interval keys → bpm; filled in exec, persisted in post */
    maxMeanHeartRate?: Record<string, number | undefined>;
    maxMeanHeartRateWindows?: Record<
      string,
      PeakIntervalObservation | undefined
    >;
    lthrObservation?: import('@/algorithm/fitness-lthr').ObservedLthrCandidate & {
      protocol: 'OBSERVED';
      qualityTier: 'SINGLE_HIGH_QUALITY';
      pausedSeconds: number | null;
      pauseEvidence: 'KNOWN' | 'UNKNOWN';
      sampleSeconds: number;
    };
    /**
     * Peak pace results computed from sensor series.
     * - DISTANCE: distance(m) -> speed(m/s)
     * - TIME: duration key (e.g. "5m") -> speed(m/s)
     * - bestDistances: duration key -> best distance (m)
     * - bestTimes: distance(m) -> best time (s)
     */
    peakPace?: {
      DISTANCE?: Record<string, number | undefined>;
      TIME?: Record<string, number | undefined>;
      bestDistances?: Record<string, number | undefined>;
      bestTimes?: Record<string, number | undefined>;
      distanceWindows?: Record<string, PeakIntervalObservation | undefined>;
      timeWindows?: Record<string, PeakIntervalObservation | undefined>;
    };
    trainingEffect?:
      | import('@/analyze/analyze-persistence.service').ActivityTrainingEffectMetrics
      | null;
    calories?: { calories: number; fatCalories: number };
    heartRateBase?: Pick<
      HeartRateAnalysisResult,
      'avg' | 'max' | 'min' | 'paHr' | 'pwHr' | 'maxHrDrop'
    >;
    heartRateTrimp?: Pick<
      HeartRateAnalysisResult,
      | 'TRIMP'
      | 'TRIMP100'
      | 'TRIMPZonal'
      | 'HRR'
      | 'IntensityFactorHR'
      | 'hrTss'
    >;
    heartRateZones?: Pick<HeartRateAnalysisResult, 'zone'>;
    powerBase?: {
      avgPower: number;
      efficiencyIndexPower: number;
      re: number;
      ei: number;
    };
    powerZoneDistribution?: UserZoneValue[];
    powerCoggan?: CogganResult;
    powerBikeScore?: BikeScoreResult;
    paceBase?: PaceBaseMetrics;
    paceZoneDistribution?: UserZoneValue[];
    paceGovss?: GOVSSResult;
    swimScore?: {
      algorithmVersion: number;
      swimScore: number;
      thresholdSpeedMps: number;
      xPower: number;
      durationSec: number;
      coveredSeconds: number;
      coverageRatio: number;
      parameters: Record<string, unknown>;
    };
    calculatedPowerSummary?: {
      model: string;
      modelVersion: number;
      avgPower: number;
      maxPower: number;
      sampleCount: number;
      parameters: Record<string, unknown>;
    };
    activityStatistics?: import('@/algorithm/activity-statistics').ActivityStatisticsResult;
    [k: string]: unknown;
  };
  errors: Partial<Record<MetricsTaskKey, { message: string; stack?: string }>>;
  /** 每个 task 的实际执行结果，用于批量导入可观测性与跳过原因汇总。 */
  taskOutcomes?: Partial<Record<MetricsTaskKey, MetricsTaskOutcome>>;
};
