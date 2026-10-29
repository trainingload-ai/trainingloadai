import { SensorRecord } from '../sensor/sensor-data.service';
import { toMs } from '@/utils';
import {
  averageKnownValues,
  resampleObservedValues,
} from './time-series-metrics';

const toTimestampMs = (value: SensorRecord['timestamp']): number =>
  toMs(value) ?? NaN;

export interface BikeScoreResult {
  xPower: number;
  variabilityIndex: number;
  relativeIntensity: number;
  bikeScore: number;
  responseIndex: number;
  aerobicTISS: number;
  anaerobicTISS: number;
  tissAerobicity: number;
  algorithmVersion: number;
  durationSec: number;
  coveredSeconds: number;
  coverageRatio: number;
  parameters: {
    xPowerTimeConstantSeconds: number;
    maxObservationGapSeconds: number;
  };
}

export const BIKE_SCORE_ALGORITHM_VERSION = 2;
const XPOWER_TIME_CONSTANT_SECONDS = 25;
const MAX_OBSERVATION_GAP_SECONDS = 10;

/**
 * BikeScore 和 xPower 算法实现
 * 基于: https://perfprostudio.com/Help/BikeScore.htm
 */
export function calculateBikeScoreMetrics(
  records: SensorRecord[],
  context: {
    cp: number;
    sampleSec: number;
    avgPower: number;
    avgHeartRate: number;
  },
): BikeScoreResult {
  if (!records || records.length === 0) {
    return createEmptyResult();
  }

  const powerTimeline = resampleObservedValues(
    records.map((record) => ({
      tMs: toTimestampMs(record.timestamp),
      value:
        typeof record.power === 'number' &&
        Number.isFinite(record.power) &&
        record.power >= 0
          ? record.power
          : null,
    })),
    MAX_OBSERVATION_GAP_SECONDS,
  );
  const { xPower } = computeXPowerFromTimeline(powerTimeline.values);

  const { aerobicTISS, anaerobicTISS } = computeTISS(
    powerTimeline.values,
    context.cp,
  );
  const avgPower = averageKnownValues(powerTimeline.values);

  return computeDerivedMetrics(
    xPower,
    avgPower || context.avgPower,
    context.avgHeartRate,
    powerTimeline.coveredSeconds,
    context.cp,
    aerobicTISS,
    anaerobicTISS,
    powerTimeline.durationSec,
    powerTimeline.coveredSeconds,
  );
}

function createEmptyResult(): BikeScoreResult {
  return {
    xPower: 0,
    variabilityIndex: 0,
    relativeIntensity: 0,
    bikeScore: 0,
    responseIndex: 0,
    aerobicTISS: 0,
    anaerobicTISS: 0,
    tissAerobicity: 0,
    algorithmVersion: BIKE_SCORE_ALGORITHM_VERSION,
    durationSec: 0,
    coveredSeconds: 0,
    coverageRatio: 0,
    parameters: {
      xPowerTimeConstantSeconds: XPOWER_TIME_CONSTANT_SECONDS,
      maxObservationGapSeconds: MAX_OBSERVATION_GAP_SECONDS,
    },
  };
}

/**
 * 计算 xPower（25秒指数加权移动平均的4次方根）
 * @param records 功率数据记录数组（需包含 timestamp 和 power）
 * @returns { xPower, countXPower }
 */
export const computeXPower = (records: SensorRecord[]) => {
  if (!records || records.length === 0) {
    return { xPower: 0, countXPower: 0 };
  }

  const timeline = resampleObservedValues(
    records.map((record) => ({
      tMs: toTimestampMs(record.timestamp),
      value:
        typeof record.power === 'number' &&
        Number.isFinite(record.power) &&
        record.power >= 0
          ? record.power
          : null,
    })),
    MAX_OBSERVATION_GAP_SECONDS,
  );
  return computeXPowerFromTimeline(timeline.values);
};

function computeXPowerFromTimeline(values: Array<number | null>) {
  let prevWeighted: number | null = null;
  let sumPower4 = 0; // 加权值4次方的累加和
  let count = 0; // 有效点数

  for (const watts of values) {
    if (watts == null || !Number.isFinite(watts)) {
      prevWeighted = null;
      continue;
    }
    if (prevWeighted == null) {
      prevWeighted = watts;
    } else {
      const alpha = 1 - Math.exp(-1 / XPOWER_TIME_CONSTANT_SECONDS);
      prevWeighted = prevWeighted * (1 - alpha) + alpha * watts;
    }
    sumPower4 += Math.pow(prevWeighted, 4);
    count++;
  }

  // 开4次方根得到 xPower
  const xPower = count > 0 ? Math.pow(sumPower4 / count, 0.25) : 0;

  return { xPower, countXPower: count };
}

/**
 * 计算 TISS 值
 * 核心计算规则 https://perfprostudio.com/Help/BikeScore.htm
 * 1. 计算 TISS 值
 * 2. 计算 TISS 值
 */
function computeTISS(values: Array<number | null>, cp: number) {
  if (cp <= 0) {
    return { aerobicTISS: 0, anaerobicTISS: 0 };
  }

  const aTISS_a = 0.663788683661645;
  const aTISS_b = -7.5095428451195;
  const aTISS_c = -0.86118031563782;
  const anTISS_a = 0.238923886004611;
  const anTISS_b = -61.849;
  const anTISS_c = -1.73549567522521;

  let sum_aTISS = 0.0;
  let sum_anTISS = 0.0;

  for (const watts of values) {
    if (watts == null || !Number.isFinite(watts)) continue;
    const ratio = watts / cp;
    sum_aTISS += aTISS_a * Math.exp(aTISS_b * Math.exp(aTISS_c * ratio));
    sum_anTISS += anTISS_a * Math.exp(anTISS_b * Math.exp(anTISS_c * ratio));
  }

  return { aerobicTISS: sum_aTISS, anaerobicTISS: sum_anTISS };
}

function computeDerivedMetrics(
  xPower: number,
  avgPower: number,
  avgHR: number,
  totalDurationSecs: number,
  cp: number,
  aerobicTISS: number,
  anaerobicTISS: number,
  durationSec: number,
  coveredSeconds: number,
): BikeScoreResult {
  const variabilityIndex = avgPower > 0 ? xPower / avgPower : 0;
  const relativeIntensity = cp > 0 ? xPower / cp : 0;
  let bikeScore = 0;
  if (cp > 0 && Number.isFinite(totalDurationSecs) && totalDurationSecs > 0) {
    const normWork = xPower * totalDurationSecs;
    const rawBikeScore = normWork * relativeIntensity;
    const workInAnHourAtCP = cp * 3600;
    bikeScore = (rawBikeScore / workInAnHourAtCP) * 100.0;
  }
  const responseIndex = avgHR > 0 ? xPower / avgHR : 0;
  let tissAerobicity = 0;
  if (aerobicTISS + anaerobicTISS > 0) {
    tissAerobicity = (aerobicTISS / (aerobicTISS + anaerobicTISS)) * 100.0;
  }

  return {
    xPower,
    variabilityIndex,
    relativeIntensity,
    bikeScore,
    responseIndex,
    aerobicTISS,
    anaerobicTISS,
    tissAerobicity,
    algorithmVersion: BIKE_SCORE_ALGORITHM_VERSION,
    durationSec,
    coveredSeconds,
    coverageRatio: durationSec > 0 ? coveredSeconds / durationSec : 0,
    parameters: {
      xPowerTimeConstantSeconds: XPOWER_TIME_CONSTANT_SECONDS,
      maxObservationGapSeconds: MAX_OBSERVATION_GAP_SECONDS,
    },
  };
}
