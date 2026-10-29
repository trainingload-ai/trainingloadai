import {
  calculateGradeAdjustedCyclingPower,
  calculateGradeAdjustedRunningPower,
  CYCLING_COASTING_CADENCE_RPM,
} from '@shared/calculated-power';
import { sanitizedActivitySpeedSeries } from './instantaneous-speed';

export {
  CALCULATED_POWER_MODEL_VERSION,
  CYCLING_COASTING_CADENCE_RPM,
  CYCLING_CALCULATED_POWER_MODEL,
  DEFAULT_CYCLING_POWER_PARAMETERS,
  RUNNING_CALCULATED_POWER_MODEL,
} from '@shared/calculated-power';

type GradeAwareRecord = {
  timestamp?: string | number | Date | null;
  enhancedSpeed?: number | null;
  speed?: number | null;
  distance?: number | null;
  slope?: number | null;
  grade?: number | null;
  cadence?: number | null;
  power?: number | null;
};

const DEFAULT_RUNNING_HEIGHT_M = 1.75;

function finitePositive(value?: number | null): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/**
 * 标准化身高，转为米表达
 * @param value
 * @returns
 */
const normalizeHeightMeters = (value?: number | null): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_RUNNING_HEIGHT_M;
  }
  return value > 3 ? value / 100 : value;
};

/**
 * 估算跑步功率，使用与 Pace Analysis 相同的 GOVSS 模型：
 * Minetti 坡度代谢成本、速度依赖效率和空气阻力。
 *
 * 这是模型估算功率，不是传感器功率；调用者应该保留原始来源，当混合原始 FIT/设备功率时。
 */
export const estimateRunningPower = (
  records: GradeAwareRecord[],
  weight: number,
  height?: number | null,
): number[] => {
  const normalizedHeight = normalizeHeightMeters(height);
  const speeds = sanitizedActivitySpeedSeries(records, 'RUN');

  return speeds.map((speedValue, index) => {
    const speed = finitePositive(speedValue);
    if (!speed) return 0;

    return Math.max(
      0,
      calculateGradeAdjustedRunningPower({
        weightKg: weight,
        height: normalizedHeight,
        speedMetersPerSecond: speed,
        gradePercent: records[index]?.grade,
      }) ?? 0,
    );
  });
};

/**
 * 估算骑行功率，使用 Gribble 物理模型
 * P = P_gravity + P_rolling + P_drag
 * P = 重力功率 + 滚动功率 + 空气阻力功率
 */
export const estimateCyclingPower = (
  records: GradeAwareRecord[],
  weight: number,
): number[] => {
  const speeds = sanitizedActivitySpeedSeries(records, 'CYCLING');
  return speeds.map((speedValue, index) => {
    const v = finitePositive(speedValue) ?? 0;
    if (v <= 0) return 0;
    const cadence = records[index]?.cadence;
    if (
      typeof cadence === 'number' &&
      Number.isFinite(cadence) &&
      cadence < CYCLING_COASTING_CADENCE_RPM
    ) {
      return 0;
    }
    return (
      calculateGradeAdjustedCyclingPower({
        weightKg: weight,
        speedMetersPerSecond: v,
        gradePercent: records[index]?.grade,
      }) ?? 0
    );
  });
};

/**
 * 仅在缺少可靠实测功率时生成独立的 calculatedPower 全序列。
 * 返回值绝不写入或混入 record.power。
 */
export function estimateCalculatedPower(args: {
  records: GradeAwareRecord[];
  sportType?: string | null;
  weightKg?: number | null;
  height?: number | null;
  measuredPowerCoverage?: number;
}): number[] | null {
  const weight = finitePositive(args.weightKg);
  if (!weight || (args.measuredPowerCoverage ?? 0) >= 0.5) return null;
  if (args.sportType === 'RUN') {
    return estimateRunningPower(args.records, weight, args.height);
  }
  if (args.sportType === 'CYCLING') {
    return estimateCyclingPower(args.records, weight);
  }
  return null;
}

export function isMeasuredPowerSample(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function measuredPowerCoverage(records: GradeAwareRecord[]): number {
  if (records.length === 0) return 0;
  const measured = records.reduce(
    (count, record) => count + (isMeasuredPowerSample(record.power) ? 1 : 0),
    0,
  );
  return measured / records.length;
}

/**
 * 计算 Running Effectiveness (RE)
 * @param speed - 速度 (单位: m/s)
 * @param power - 功重比功率 (单位: W)
 * @param weight - 体重 (单位: kg)
 * 注意：必须是 Watts/Weight，否则数值量级不对
 */
export const calculateRunningEffectiveness = (
  speed: number,
  power: number,
  weight?: number,
) => {
  if (speed <= 0 || power <= 0 || weight <= 0) return 0;
  return (speed * power) / weight;
};

export const calculateEfficiencyIndexPower = (
  avgPower: number,
  avgHR: number,
) => {
  if (
    !Number.isFinite(avgPower) ||
    !Number.isFinite(avgHR) ||
    avgPower <= 0 ||
    avgHR <= 0
  )
    return 0;
  return avgPower / avgHR;
};

export const calculateEfficiencyIndexSpeed = (speed: number, avgHR: number) => {
  if (speed <= 0 || avgHR <= 0) return 0;
  return speed / avgHR;
};

/**
 *
 * Aerobic Efficiency (AE): NP (Normalized Power) / avgHeartRate
 *
 * AE = EF
 * @param np
 * @param avgHeartRate
 * @returns
 */
// export const calculateAerobicEfficiency = (
//   normalizedPower: number,
//   avgHeartRate: number,
// ) => {
//   if (normalizedPower <= 0 || avgHeartRate <= 0) return 0;
//   return normalizedPower / avgHeartRate;
// };
