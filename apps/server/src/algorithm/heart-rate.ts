import { round } from 'lodash';
import { SensorData } from '../analyze/analyze.interface';
import {
  LTHR_FIELD_TEST_DURATION_SECONDS,
  LTHR_FIELD_TEST_MEASURE_SECONDS,
  LTHR_FIELD_TEST_WARMUP_SECONDS,
} from '@/heart-rate/lthr-field-test.constants';

type HeartRateTimePoint = { tMs: number; value: number };

export interface LthrFieldTestEstimate {
  lthr: number;
  testStartMs: number;
  testEndMs: number;
  measureStartMs: number;
  measureEndMs: number;
  testAverageHr: number;
}

function normalizeHeartRateTimePoints(
  sensorData: Array<{
    time?: string | number;
    tMs?: number;
    heartRate?: number;
  }>,
): HeartRateTimePoint[] {
  const sorted = sensorData
    .map((record) => {
      const tMs =
        typeof record.tMs === 'number'
          ? record.tMs
          : typeof record.time === 'number'
            ? record.time
            : typeof record.time === 'string'
              ? new Date(record.time).getTime()
              : NaN;
      const value = Number(record.heartRate);
      return { tMs, value };
    })
    .filter(
      (point) =>
        Number.isFinite(point.tMs) &&
        Number.isFinite(point.value) &&
        point.value > 0,
    )
    .sort((a, b) => a.tMs - b.tMs);

  const deduped: HeartRateTimePoint[] = [];
  for (const point of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.tMs === point.tMs) {
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
    }
  }

  return deduped;
}

function upperBoundByTime(points: HeartRateTimePoint[], tMs: number) {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].tMs <= tMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function interpolateValueAt(points: HeartRateTimePoint[], tMs: number) {
  if (tMs <= points[0].tMs) return points[0].value;
  const last = points[points.length - 1];
  if (tMs >= last.tMs) return last.value;

  const nextIndex = upperBoundByTime(points, tMs);
  const prev = points[nextIndex - 1];
  const next = points[nextIndex];
  const span = next.tMs - prev.tMs;
  if (span <= 0) return prev.value;

  const ratio = (tMs - prev.tMs) / span;
  return prev.value + (next.value - prev.value) * ratio;
}

function buildCumulativeHrArea(points: HeartRateTimePoint[]) {
  const area = [0];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const dtSec = (cur.tMs - prev.tMs) / 1000;
    const prevArea = area[i - 1];
    area[i] =
      dtSec > 0 ? prevArea + ((prev.value + cur.value) / 2) * dtSec : prevArea;
  }
  return area;
}

function areaAt(
  points: HeartRateTimePoint[],
  cumulativeArea: number[],
  tMs: number,
) {
  if (tMs <= points[0].tMs) return 0;
  const lastIndex = points.length - 1;
  if (tMs >= points[lastIndex].tMs) return cumulativeArea[lastIndex];

  const nextIndex = upperBoundByTime(points, tMs);
  const prevIndex = nextIndex - 1;
  const prev = points[prevIndex];
  const valueAtT = interpolateValueAt(points, tMs);
  const dtSec = (tMs - prev.tMs) / 1000;

  return cumulativeArea[prevIndex] + ((prev.value + valueAtT) / 2) * dtSec;
}

function averageHrBetween(
  points: HeartRateTimePoint[],
  cumulativeArea: number[],
  startMs: number,
  endMs: number,
) {
  const durationSec = (endMs - startMs) / 1000;
  if (durationSec <= 0) return undefined;
  const area =
    areaAt(points, cumulativeArea, endMs) -
    areaAt(points, cumulativeArea, startMs);
  const average = area / durationSec;
  return Number.isFinite(average) ? average : undefined;
}

/**
 * 计算最大心率下降值（通常在运动停止后60秒内）
 *
 * 心率恢复是衡量心肺耐力和训练适应性的重要指标：
 * - 运动停止后60秒内心率下降越多，通常代表有氧能力越好
 * - 典型值：优秀运动员 >30bpm，普通健康人群 15-25bpm
 *
 * @param sensorData - 传感器数据数组
 * @param targetSeconds - 目标时间窗口，默认60秒
 * @param toleranceSeconds - 时间容差，默认±5秒
 * @returns 最大心率下降值（bpm），无法计算时返回 undefined
 */
export function calculateMaxHrDrop(
  sensorData: SensorData[],
  targetSeconds: number = 60,
  toleranceSeconds: number = 5,
): number | undefined {
  if (!sensorData || sensorData.length < 2) return undefined;

  // 1. 预处理：过滤有效心率数据并转换时间戳
  const hrData: Array<{ timestamp: number; hr: number }> = [];

  for (const record of sensorData) {
    const hr = record.heartRate;
    if (hr === undefined || hr === null || hr <= 0) continue;

    let timestamp: number;
    if (typeof record.time === 'string') {
      // 统一解析时间，只做一次
      timestamp = new Date(record.time).getTime();
      if (isNaN(timestamp)) continue;
    } else if (typeof record.time === 'number') {
      timestamp = record.time;
    } else {
      continue;
    }

    hrData.push({ timestamp, hr });
  }

  if (hrData.length < 2) return undefined;

  let maxDrop = 0;
  const targetMs = targetSeconds * 1000;
  const toleranceMs = toleranceSeconds * 1000;
  const minDiff = targetMs - toleranceMs;
  const maxDiff = targetMs + toleranceMs;

  // 2. 使用双指针滑动窗口，O(n) 复杂度
  // 对于每个起点，找到时间差在目标窗口内的最优点
  let j = 1;

  for (let i = 0; i < hrData.length - 1; i++) {
    const start = hrData[i];

    // 确保 j 从 i+1 开始，并且时间差不超过最大容忍范围
    if (j <= i) j = i + 1;

    // 移动 j 到时间差进入窗口的位置
    while (
      j < hrData.length &&
      hrData[j].timestamp - start.timestamp < minDiff
    ) {
      j++;
    }

    // 检查 j 及其前一个点（如果有）是否在窗口内
    let bestJ = -1;
    let bestDiff = Infinity;

    // 检查当前位置 j
    if (j < hrData.length) {
      const diff = hrData[j].timestamp - start.timestamp;
      if (diff >= minDiff && diff <= maxDiff) {
        const drop = start.hr - hrData[j].hr;
        if (drop > maxDrop) maxDrop = drop;
        // 不继续找更远的 j，因为时间差只会越来越大
        continue;
      }
      bestDiff = Math.abs(diff - targetMs);
      bestJ = j;
    }

    // 检查 j-1 位置（可能比 j 更接近目标）
    if (j - 1 > i) {
      const diff = hrData[j - 1].timestamp - start.timestamp;
      const diffAbs = Math.abs(diff - targetMs);
      if (diffAbs < bestDiff) {
        bestDiff = diffAbs;
        bestJ = j - 1;
      }
    }

    // 如果找到了有效点，计算心率下降
    if (bestJ !== -1 && bestDiff <= toleranceMs) {
      const drop = start.hr - hrData[bestJ].hr;
      if (drop > maxDrop) maxDrop = drop;
    }
  }

  return maxDrop > 0 ? maxDrop : undefined;
}

/**
 * 暂时不用：
 * Estimate Max Heart Rate using Submaximal Linear Extrapolation
 * based on the relationship between Heart Rate and Power/Speed.
 *
 * Uses the linear relationship: HR = slope * Intensity + intercept
 * Extrapolates to MaxHR = slope * MAP + intercept
 *
 * Includes (0, RestHR) as an anchor point for regression.
 *
 * @param stablePoints - Array of { heartRate, power } from stable segments
 * @param restHr - Resting Heart Rate
 * @param map - Max Aerobic Power (or Max Aerobic Speed/Pace)
 * @returns Estimated Max HR
 */
export function estimateMaxHeartRateLinear(
  stablePoints: { heartRate: number; power: number }[],
  restHr: number,
  map: number,
): number | undefined {
  if (!map || map <= 0) return undefined;
  if (!stablePoints || stablePoints.length === 0) return undefined;
  if (!restHr || restHr <= 0) return undefined;

  // Include RestHR as a point (0 watts, RestHR) to anchor the regression
  const points = [...stablePoints, { heartRate: restHr, power: 0 }];

  // Simple Linear Regression (Least Squares)
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  const n = points.length;

  for (const p of points) {
    sumX += p.power;
    sumY += p.heartRate;
    sumXY += p.power * p.heartRate;
    sumXX += p.power * p.power;
  }

  // Denominator for slope
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return undefined; // Vertical line or all x same

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Extrapolate to MAP
  const maxHr = slope * map + intercept;

  // Basic sanity check (e.g., 100 - 250 bpm)
  if (maxHr < 100 || maxHr > 250) return undefined;

  return Math.round(maxHr);
}

/**
 * Estimate Friel-style LTHR from activity records.
 *
 * For each rolling 30-minute field-test window, calculate the time-weighted
 * average HR from minute 10 to minute 30, then keep the highest candidate.
 */
export function estimateLthrFrom30MinuteFieldTest(
  sensorData: Array<{
    time?: string | number;
    tMs?: number;
    heartRate?: number;
  }>,
): LthrFieldTestEstimate | undefined {
  if (!sensorData || sensorData.length === 0) return undefined;

  const points = normalizeHeartRateTimePoints(sensorData);
  if (points.length < 2) return undefined;

  const firstMs = points[0].tMs;
  const lastMs = points[points.length - 1].tMs;
  const testDurationMs = LTHR_FIELD_TEST_DURATION_SECONDS * 1000;
  const warmupMs = LTHR_FIELD_TEST_WARMUP_SECONDS * 1000;
  const measureMs = LTHR_FIELD_TEST_MEASURE_SECONDS * 1000;

  if (lastMs - firstMs < testDurationMs) {
    return undefined;
  }

  const cumulativeArea = buildCumulativeHrArea(points);
  let best: LthrFieldTestEstimate | undefined;

  for (const point of points) {
    const testStartMs = point.tMs;
    const testEndMs = testStartMs + testDurationMs;
    if (testEndMs > lastMs) break;

    const measureStartMs = testStartMs + warmupMs;
    const measureEndMs = measureStartMs + measureMs;
    const lthr = averageHrBetween(
      points,
      cumulativeArea,
      measureStartMs,
      measureEndMs,
    );
    if (lthr === undefined) continue;

    const testAverageHr =
      averageHrBetween(points, cumulativeArea, testStartMs, testEndMs) ??
      lthr;

    if (!best || lthr > best.lthr) {
      best = {
        lthr: round(lthr, 2),
        testStartMs,
        testEndMs,
        measureStartMs,
        measureEndMs,
        testAverageHr: round(testAverageHr, 2),
      };
    }
  }

  return best;
}
