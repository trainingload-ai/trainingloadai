import { round } from 'lodash';

/**
 * 在距离-时间序列中查找目标距离的最佳（最短）时间
 * 使用带插值的滑动窗口方法
 *
 * @param series 距离-时间序列数组 { tMs: number; dM: number }（累积时间 ms，累积距离 m）
 * @param targetM 目标距离窗口（米）
 * @returns 最佳时间（秒），未找到则返回 null
 */
export function findBestTimeForDistance(
  series: { tMs: number; dM: number }[],
  targetM: number,
): number | null {
  return (
    findBestTimeWindowForDistance(
      series,
      targetM,
      Number.POSITIVE_INFINITY,
    )?.value ?? null
  );
}

export type BestDistanceTimeWindow = {
  value: number;
  startMs: number;
  endMs: number;
  startDistanceM: number;
  endDistanceM: number;
  durationSec: number;
};

/** Fastest exact-distance window with an interpolated start boundary. */
export function findBestTimeWindowForDistance(
  series: { tMs: number; dM: number }[],
  targetM: number,
  maxGapSeconds = 10,
): BestDistanceTimeWindow | null {
  if (!series || series.length < 2 || !(targetM > 0)) return null;
  let best: BestDistanceTimeWindow | null = null;
  let left = 0;
  let segmentStart = 0;
  for (let end = 1; end < series.length; end++) {
    if ((series[end].tMs - series[end - 1].tMs) / 1000 > maxGapSeconds) {
      segmentStart = end;
      left = end;
      continue;
    }
    const endPoint = series[end];
    const targetStartDistance = endPoint.dM - targetM;
    if (targetStartDistance < series[segmentStart].dM) continue;
    left = Math.max(left, segmentStart);
    while (left + 1 < end && series[left + 1].dM <= targetStartDistance) {
      left++;
    }
    const a = series[left];
    const b = series[left + 1];
    if (!a || !b || b.dM < a.dM || b.tMs <= a.tMs) continue;
    const ratio =
      b.dM === a.dM ? 0 : (targetStartDistance - a.dM) / (b.dM - a.dM);
    if (ratio < 0 || ratio > 1) continue;
    const startMs = a.tMs + (b.tMs - a.tMs) * ratio;
    const durationSec = (endPoint.tMs - startMs) / 1000;
    if (!(durationSec > 0)) continue;
    if (!best || durationSec < best.value) {
      best = {
        value: durationSec,
        startMs,
        endMs: endPoint.tMs,
        startDistanceM: targetStartDistance,
        endDistanceM: endPoint.dM,
        durationSec,
      };
    }
  }
  return best;
}

export interface BestWindowResult {
  value: number;
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
}

/**
 * 查找目标持续时间内的最佳（最大）值增量及其窗口详情
 *
 * @param series 时间-值序列数组 { tMs: number; v: number }（累积时间 ms，累积值）
 * @param targetSeconds 目标时间窗口（秒）
 * @returns 最佳窗口结果，未找到则返回 null
 */
export function findBestValueDeltaWindowForTime(
  series: { tMs: number; v: number }[],
  targetSeconds: number,
): BestWindowResult | null {
  if (!series || series.length < 2) return null;
  const targetMs = targetSeconds * 1000;
  let bestV: number = -Infinity;
  let bestWindow: BestWindowResult | null = null;
  let i = 0;
  for (let j = 1; j < series.length; j++) {
    const vj = series[j].v;
    const tj = series[j].tMs;
    // 我们需要窗口大致等于 targetMs。
    // 逻辑：当窗口 [i, j] 大于 targetMs 时，检查它并从左侧收缩。
    while (i < j && tj - series[i].tMs >= targetMs) {
      const vi = series[i].v;
      const ti = series[i].tMs;
      const vDelta = vj - vi;
      const tDeltaMs = tj - ti;

      if (tDeltaMs > 0) {
        // 插值以精确匹配 targetMs
        const ratio = targetMs / tDeltaMs;
        const val = vDelta * ratio;
        if (val > bestV) {
          bestV = val;
          bestWindow = {
            value: val,
            startIndex: i,
            endIndex: j,
            startTime: ti,
            endTime: tj,
          };
        }
      }
      i++;
    }
  }
  return bestWindow;
}

/**
 * 查找目标持续时间内的最佳（最大）值增量
 *
 * @param series 时间-值序列数组 { tMs: number; v: number }（累积时间 ms，累积值）
 * @param targetSeconds 目标时间窗口（秒）
 * @returns 最佳值增量，未找到则返回 0
 */
export function findBestValueDeltaForTime(
  series: { tMs: number; v: number }[],
  targetSeconds: number,
): number {
  const result = findBestValueDeltaWindowForTime(series, targetSeconds);
  return result ? result.value : 0;
}

/**
 * 查找目标持续时间内的最佳（最大）距离
 * findBestValueDeltaForTime 的封装
 *
 * @param series 时间-距离序列数组 { tMs: number; dM: number }
 * @param targetSeconds 目标时间（秒）
 * @returns 最佳距离（米）
 */
export function findBestDistanceForTime(
  series: { tMs: number; dM: number }[],
  targetSeconds: number,
): number {
  return (
    findBestDistanceWindowForTime(
      series,
      targetSeconds,
      Number.POSITIVE_INFINITY,
    )?.value ?? 0
  );
}

/** Longest exact-time window with an interpolated start boundary. */
export function findBestDistanceWindowForTime(
  series: { tMs: number; dM: number }[],
  targetSeconds: number,
  maxGapSeconds = 10,
): BestDistanceTimeWindow | null {
  if (!series || series.length < 2 || !(targetSeconds > 0)) return null;
  const targetMs = targetSeconds * 1000;
  let best: BestDistanceTimeWindow | null = null;
  let left = 0;
  let segmentStart = 0;
  for (let end = 1; end < series.length; end++) {
    if ((series[end].tMs - series[end - 1].tMs) / 1000 > maxGapSeconds) {
      segmentStart = end;
      left = end;
      continue;
    }
    const endPoint = series[end];
    const targetStartMs = endPoint.tMs - targetMs;
    if (targetStartMs < series[segmentStart].tMs) continue;
    left = Math.max(left, segmentStart);
    while (left + 1 < end && series[left + 1].tMs <= targetStartMs) left++;
    const a = series[left];
    const b = series[left + 1];
    if (!a || !b || b.tMs <= a.tMs || b.dM < a.dM) continue;
    const ratio = (targetStartMs - a.tMs) / (b.tMs - a.tMs);
    if (ratio < 0 || ratio > 1) continue;
    const startDistanceM = a.dM + (b.dM - a.dM) * ratio;
    const distanceM = endPoint.dM - startDistanceM;
    if (!(distanceM > 0)) continue;
    if (!best || distanceM > best.value) {
      best = {
        value: distanceM,
        startMs: targetStartMs,
        endMs: endPoint.tMs,
        startDistanceM,
        endDistanceM: endPoint.dM,
        durationSec: targetSeconds,
      };
    }
  }
  return best;
}

/**
 * 查找目标持续时间内的最佳（最大）平均值窗口
 * 用于最大平均功率等计算
 * 使用梯形积分处理非均匀采样。
 *
 * @param series 时间-值序列数组 { tMs: number; value: number }（瞬时值）
 * @param targetSeconds 目标时间窗口（秒）
 * @returns 最佳窗口结果
 */
export function findBestAverageWindowForTime(
  series: { tMs: number; value: number }[],
  targetSeconds: number,
): BestWindowResult | null {
  if (!series || series.length < 2) return null;

  // 构建累积积分序列
  // 积分 = sum(value * dt)
  const integralSeries: { tMs: number; v: number }[] = [];
  let currentIntegral = 0;

  integralSeries.push({ tMs: series[0].tMs, v: 0 });

  for (let i = 1; i < series.length; i++) {
    const dt = (series[i].tMs - series[i - 1].tMs) / 1000; // seconds
    if (dt > 0) {
      // 梯形法则
      const avgVal = (series[i].value + series[i - 1].value) / 2;
      currentIntegral += avgVal * dt;
      integralSeries.push({ tMs: series[i].tMs, v: currentIntegral });
    } else {
      // 如果 dt == 0（重复时间戳），跳过或推入相同的积分
      integralSeries.push({ tMs: series[i].tMs, v: currentIntegral });
    }
  }

  const bestTotalWindow = findBestValueDeltaWindowForTime(
    integralSeries,
    targetSeconds,
  );

  if (!bestTotalWindow) return null;

  return {
    ...bestTotalWindow,
    value: bestTotalWindow.value / targetSeconds,
  };
}

/**
 * 查找目标持续时间内的最佳（最大）平均值
 * 用于最大平均功率等计算
 * 使用梯形积分处理非均匀采样。
 *
 * @param series 时间-值序列数组 { tMs: number; value: number }（瞬时值）
 * @param targetSeconds 目标时间窗口（秒）
 * @returns 最佳平均值
 */
export function findBestAverageForTime(
  series: { tMs: number; value: number }[],
  targetSeconds: number,
): number {
  const window = findBestAverageWindowForTime(series, targetSeconds);
  return window ? round(window.value, 2) : 0;
}

export interface SeriesPoint {
  tMs: number;
  value: number;
}

export interface IntegralPoint {
  tMs: number;
  v: number;
}

export interface BestWindowResultV2 {
  startMs: number;
  endMs: number;
  durationSec: number;
  value: number;
}

/**
 * 构建梯形积分序列（支持非均匀采样）
 */
export function buildIntegralSeries(series: SeriesPoint[]): IntegralPoint[] {
  if (!series || series.length < 2) return [];

  const integral: IntegralPoint[] = [];

  let currentIntegral = 0;

  integral.push({
    tMs: series[0].tMs,
    v: 0,
  });

  for (let i = 1; i < series.length; i++) {
    const dt = (series[i].tMs - series[i - 1].tMs) / 1000;

    if (dt > 0) {
      const avg = (series[i].value + series[i - 1].value) / 2;
      currentIntegral += avg * dt;
    }

    integral.push({
      tMs: series[i].tMs,
      v: currentIntegral,
    });
  }

  return integral;
}

/**
 * 计算自定义时长的最大平均值
 * 优化：构建一次积分序列并复用于所有时长。
 *
 * @param series 输入序列
 * @param durations 时长字典 { key: seconds }
 */
export function computeMaxMeanValues(
  series: SeriesPoint[],
  durations: Record<string, number>,
): Record<string, number | undefined> {
  if (!series || series.length < 2) {
    return {};
  }

  const totalDurationSec =
    (series[series.length - 1].tMs - series[0].tMs) / 1000;

  // 构建一次积分序列 (O(N))
  const integralSeries = buildIntegralSeries(series);

  const result: Record<string, number | undefined> = {};

  // 计算每个时长 (O(K * N))
  for (const [key, dur] of Object.entries(durations)) {
    if (totalDurationSec >= dur) {
      const bestWindow = findBestValueDeltaWindowForTime(integralSeries, dur);
      if (bestWindow) {
        // 平均值 = 积分 / 时间
        result[key] = round(bestWindow.value / dur, 2);
      } else {
        result[key] = undefined;
      }
    } else {
      result[key] = undefined;
    }
  }

  return result;
}

/**
 * 按固定采样间隔计算最大平均值。
 * 每个样本代表 sampleSec 秒，避免把降采样后的每条记录误当作 1 秒。
 */
export function computeMaxMeanSampledValues(
  series: SeriesPoint[],
  durations: Record<string, number>,
  sampleSec: number,
): Record<string, number | undefined> {
  if (!series || series.length === 0) {
    return {};
  }
  if (!Number.isFinite(sampleSec) || sampleSec <= 0) {
    return computeMaxMeanValues(series, durations);
  }

  const values = series.map((p) => p.value);
  const totalDurationSec = values.length * sampleSec;
  const prefix = [0];
  for (const value of values) {
    prefix.push(prefix[prefix.length - 1] + value);
  }

  const result: Record<string, number | undefined> = {};
  const EPSILON = 1e-9;

  for (const [key, durationSec] of Object.entries(durations)) {
    if (totalDurationSec + EPSILON < durationSec) {
      result[key] = undefined;
      continue;
    }

    const fullSamples = Math.floor(durationSec / sampleSec);
    const remainderSec = durationSec - fullSamples * sampleSec;
    const needsPartial = remainderSec > EPSILON;
    const requiredSamples = fullSamples + (needsPartial ? 1 : 0);

    if (requiredSamples <= 0 || requiredSamples > values.length) {
      result[key] = undefined;
      continue;
    }

    let best = -Infinity;
    for (let start = 0; start <= values.length - requiredSamples; start++) {
      const fullEnd = start + fullSamples;
      let total = (prefix[fullEnd] - prefix[start]) * sampleSec;
      if (needsPartial) {
        total += values[fullEnd] * remainderSec;
      }
      best = Math.max(best, total / durationSec);
    }

    result[key] = Number.isFinite(best) ? round(best, 2) : undefined;
  }

  return result;
}

/**
 * 计算数组均值和标准差的辅助函数
 */
function getStats(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const n = values.length;
  const meanVal = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + Math.pow(b - meanVal, 2), 0) / n;
  return { mean: meanVal, stdDev: Math.sqrt(variance) };
}

export interface StableSegment {
  startIndex: number;
  count: number;
  avgPower: number;
  avgHeartRate: number;
  stdDevPower: number;
  stdDevHeartRate: number;
}

/**
 * 查找活动数据中功率和心率变异性较低的稳定片段。
 *
 * @param data 数据数组 { power, heartRate }
 * @param windowSize 窗口大小（样本数/秒）（例如 180 代表 3 分钟）
 * @param maxStdDevPower 最大允许功率标准差（瓦特）
 * @param maxStdDevHr 最大允许心率标准差（BPM）
 * @returns 稳定片段数组
 */
export function findStableSegments(
  data: { power: number; heartRate: number }[],
  windowSize: number = 180,
  maxStdDevPower: number = 15,
  maxStdDevHr: number = 5,
): StableSegment[] {
  const segments: StableSegment[] = [];
  if (data.length < windowSize) return segments;

  // 简单滑动窗口
  // 步长可以是 windowSize / 2 以避免过多重叠，或设为 1 以提高精度。
  // 出于性能考虑，使用步长 = 30 秒。
  const step = 30;

  for (let i = 0; i <= data.length - windowSize; i += step) {
    const window = data.slice(i, i + windowSize);

    // 过滤无效数据（null 或 0？功率 0 是有效的（滑行），心率 0 无效）
    // 假设数据已预清洗或在此处检查。
    const validPoints = window.filter(
      (p) => p.power !== null && p.heartRate > 0,
    );
    if (validPoints.length < windowSize * 0.8) continue; // 要求 80% 的有效数据

    const powers = validPoints.map((p) => p.power);
    const hrs = validPoints.map((p) => p.heartRate);

    const pStats = getStats(powers);
    const hrStats = getStats(hrs);

    if (pStats.stdDev <= maxStdDevPower && hrStats.stdDev <= maxStdDevHr) {
      // 发现稳定片段
      segments.push({
        startIndex: i,
        count: windowSize,
        avgPower: pStats.mean,
        avgHeartRate: hrStats.mean,
        stdDevPower: pStats.stdDev,
        stdDevHeartRate: hrStats.stdDev,
      });
    }
  }

  // 去重：在重叠片段中选择最稳定的（方差和最小）？
  // 或者更简单：按时间排序并过滤严格重叠。
  const uniqueSegments: StableSegment[] = [];
  let lastEndIndex = -1;

  segments.sort((a, b) => a.startIndex - b.startIndex);

  for (const seg of segments) {
    if (seg.startIndex >= lastEndIndex) {
      uniqueSegments.push(seg);
      lastEndIndex = seg.startIndex + seg.count;
    }
  }

  return uniqueSegments;
}
