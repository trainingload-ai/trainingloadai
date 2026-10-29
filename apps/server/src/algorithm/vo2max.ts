import { SensorData } from '@/analyze/analyze.interface';
import { findBestDistanceForTime } from '@/algorithm/window-analysis.util';
import { clamp, mean, round } from 'lodash';

// =============================================================================
// 核心公式（Daniels / Runalyze）
// =============================================================================

/**
 * Runalyze 心率模型
 * 用于根据心率百分比（%HRmax）估算当前强度下可达到的 VO2max 百分比（%VO2max）。
 * 公式：exp((%HR - 1.00466) / 0.68725)
 * 来源：https://github.dev/Runalyze/Runalyze/src/CoreBundle/Bridge/Activity/Calculation/VO2maxCalculator.php
 * 致谢：Runalyze 对开源社区的贡献。
 */
export const getExpectedPercentageOfVO2maxAt = (hrPercent: number): number => {
  return Math.exp((hrPercent - 1.00466) / 0.68725);
};

/**
 * Daniels/Gilbert「Drop Dead」公式
 * 用于估算在给定持续时间 t（分钟）下可维持的 VO2max 比例（强度因子）。
 * 公式：0.8 + 0.1894393 * exp(-0.012778 * t) + 0.2989558 * exp(-0.1932605 * t)
 * 来源：http://www.simpsonassociatesinc.com/runningmath3.htm
 */
export const dropDeadFormula = (durationMin: number): number => {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * durationMin) +
    0.2989558 * Math.exp(-0.1932605 * durationMin)
  );
};

/**
 * 氧耗成本公式（Jack Daniels）
 * 根据速度（m/min）估算所需的耗氧量 VO2（ml/kg/min）。
 * 公式：VO2 = -4.60 + 0.182258 * v + 0.000104 * v^2
 * @param speedMmin 速度（米/分）
 * @returns VO2（ml/kg/min）
 * 来源：http://www.simpsonassociatesinc.com/runningmath2.htm
 */
export const oxygenCostFormula = (speedMmin: number): number => {
  const vo2 = -4.6 + 0.182258 * speedMmin + 0.000104 * speedMmin * speedMmin;
  return clamp(vo2, 10, 85);
};

// =============================================================================
// 辅助逻辑
// =============================================================================

// =============================================================================
// 比赛预测 & VDOT
// =============================================================================

/**
 * 根据比赛结果（距离：米；时间：秒）计算 VDOT
 * 实现公式：VDOT = OxygenCost(v) / DropDead(t)
 * @param distanceMeters 距离（米）
 * @param timeSeconds 时间（秒）
 * @returns VDOT（ml/kg/min）
 */
export const getVdotFromRace = (
  distanceMeters: number,
  timeSeconds: number,
): number => {
  if (distanceMeters <= 0 || timeSeconds <= 0) return 0;

  // 1）计算持续时间（分钟）
  const durationMin = timeSeconds / 60;

  // 2）计算速度（米/分）并得到耗氧成本（需求侧）
  const speedMmin = (distanceMeters / timeSeconds) * 60;
  const oxygenCost = oxygenCostFormula(speedMmin);

  // 3）计算强度因子（供给侧：可用的 VO2max 百分比）
  const intensityFactor = dropDeadFormula(durationMin);

  // 4）计算 VDOT
  // VDOT * 强度因子 = 耗氧成本  =>  VDOT = 耗氧成本 / 强度因子
  if (intensityFactor <= 0) return 0;
  return round(oxygenCost / intensityFactor, 4);
};

export const vdotFromDurationAndSpeed = (
  durationMin: number,
  speedMmin: number,
): number => {
  if (durationMin <= 0 || speedMmin <= 0) return 0;
  const oxygenCost = oxygenCostFormula(speedMmin);
  const intensityFactor = dropDeadFormula(durationMin);
  if (intensityFactor <= 0) return 0;
  return oxygenCost / intensityFactor;
};

/**
 * Daniels/Gilbert：给定 VDOT 对应的 VO2max 速度（vVO2max）
 * 公式：29.54 + 5.000663 * VDOT - 0.007546 * VDOT^2
 * 来源：http://www.simpsonassociatesinc.com/runningmath3.htm
 */
export const vVo2MaxFromVDOT = (vdot: number): number => {
  return 29.54 + 5.000663 * vdot - 0.007546 * vdot * vdot;
};

/**
 * Daniels/Gilbert：使用牛顿迭代法求解「给定 VDOT 在指定距离下的等效时间」
 * 公式初值：t = d / vVO2max(vdot) / 0.9
 * 来源：http://www.simpsonassociatesinc.com/runningmath3.htm
 */
export const eqvTime = (vdot: number, distMeters: number): number => {
  if (vdot <= 0 || distMeters <= 0) return 0;
  let t = distMeters / vVo2MaxFromVDOT(vdot) / 0.9;
  let iter = 100;
  let f = 0;
  let fp = 0;
  do {
    f =
      (0.000104 * distMeters * distMeters * Math.pow(t, -2) +
        0.182258 * distMeters * Math.pow(t, -1) -
        4.6) /
        dropDeadFormula(t) -
      vdot;
    fp =
      (dropDeadFormula(t) *
        (-0.000208 * distMeters * distMeters * Math.pow(t, -3) -
          0.182258 * distMeters * Math.pow(t, -2)) -
        (0.000104 * distMeters * distMeters * Math.pow(t, -2) +
          0.182258 * distMeters * Math.pow(t, -1) -
          4.6) *
          (-0.1932605 * 0.2989558 * Math.exp(-0.1932605 * t) +
            -0.012778 * 0.1894393 * Math.exp(-0.012778 * t))) /
      Math.pow(dropDeadFormula(t), 2);
    t -= f / fp;
    iter--;
  } while (Math.abs(f / fp) > 1e-3 && iter > 0);
  return t;
};

// 从采样记录构建累计的 时间-距离 序列（用于窗口扫描）
const buildDistanceSeries = (
  records: SensorData[],
): Array<{ tMs: number; dM: number }> => {
  if (!records || records.length < 2) return [];
  let startMs: number | null = null;
  let prevTimeMs: number | null = null;
  let prevDistance: number | null = null;
  const series: Array<{ tMs: number; dM: number }> = [];

  for (const r of records) {
    const timeStr = r.time;
    const distanceStr = r.distance;
    if (!timeStr || !distanceStr) continue;
    const timeMs = new Date(timeStr).getTime();
    const distance = Number(distanceStr);
    if (!Number.isFinite(timeMs) || !Number.isFinite(distance)) continue;
    if (startMs == null) startMs = timeMs;
    const tMs = timeMs - startMs;
    if (tMs < 0) continue;
    if (prevTimeMs != null && tMs <= prevTimeMs) continue;
    if (prevDistance != null && distance < prevDistance) continue;
    series.push({ tMs, dM: distance });
    prevTimeMs = tMs;
    prevDistance = distance;
  }
  return series;
};

// 从 4 分钟到 4 小时扫描最佳 VDOT（行为对齐 C++ VDOT.cpp）
export const getVdotFromDistanceSeries = (
  series: Array<{ tMs: number; dM: number }>,
  options?: {
    minSec?: number;
    maxSec?: number;
  },
): number => {
  if (!series || series.length < 2) return 0;
  const minSec = options?.minSec ?? 240;
  const maxSec = options?.maxSec ?? 14400;
  const totalDurationSec = Math.floor(series[series.length - 1].tMs / 1000);
  const upperSec = Math.min(totalDurationSec, maxSec);
  if (upperSec < minSec) return 0;

  let best = 0;
  for (let sec = minSec; sec <= upperSec; sec++) {
    const bestDistance = findBestDistanceForTime(series, sec);
    if (bestDistance <= 0) continue;
    const vdot = getVdotFromRace(bestDistance, sec);
    if (vdot > best) best = vdot;
  }
  return best;
};

/**
 * 从原始记录（SensorData[]）直接估算最佳 VDOT
 * 本质是：records → 构建时间-距离序列 → 在指定时间窗内扫描最佳 VDOT
 */
export const getVdotFromRecords = (
  records: SensorData[],
  options?: {
    minSec?: number;
    maxSec?: number;
  },
): number => {
  const series = buildDistanceSeries(records);
  return getVdotFromDistanceSeries(series, options);
};

// =============================================================================
// VO2max 估算器
// =============================================================================

/**
 * 基于心率和速度估算跑步 VO2max (最大摄氧量)
 *
 * 算法来源:
 * 该算法参考了 Jack Daniels 的 VDOT 理论以及 Firstbeat 的 VO2max 估算模型。
 * 核心思想是通过心率百分比 (%HRmax) 推算出当前的摄氧量百分比 (%VO2max)，
 * 进而结合当前配速（对应的氧气消耗量）反推出 100% 强度下的最大摄氧量。
 *
 * 计算步骤:
 * 1. 根据当前心率百分比 (AvgHR / MaxHR) 估算当前的 %VO2max。
 *    (使用公式或查表，例如 %VO2max ≈ (%HRmax - 37) / (100 - 37) 或更复杂的拟合公式)
 * 2. 计算当前配速下的理论氧气消耗量 (Oxygen Cost)。
 * 3. 归一化：VO2max = 当前氧气消耗量 / %VO2max。
 *
 * @param speedMmin 速度 (米/分)
 * @param maxHrPercent 最大心率百分比 (avgHr / hrMax)
 * @param correctionFactor 可选的校正因子 (默认: 1.0)
 * @returns VO2max (ml/kg/min) 或 undefined (如果输入无效)
 */
export function estimateVo2maxRunByHeartRate({
  speedMmin,
  maxHrPercent,
  correctionFactor = 1.0,
}: {
  speedMmin: number;
  maxHrPercent: number;
  correctionFactor?: number;
}): number | undefined {
  if (!speedMmin || !maxHrPercent || maxHrPercent <= 0.0) return undefined;

  // 1. 根据心率估算当前的 %VO2max 强度
  const percentageEstimateByHR = getExpectedPercentageOfVO2maxAt(maxHrPercent);
  if (percentageEstimateByHR <= 0) return undefined;

  // 2. 计算 100% VO2max 时的理论速度 (Effective VDOT Speed)
  // 即：如果当前以 maxHrPercent 的强度跑了 speedMmin，那么全速 (100%) 能跑多快？
  const speedEstimateAt100Percent = speedMmin / percentageEstimateByHR; // m/min

  // 3. 将该理论最大速度转换为 VO2max 值 (基于 Daniels' Oxygen Cost 公式)
  const vo2max = round(
    oxygenCostFormula(speedEstimateAt100Percent) * correctionFactor,
    2,
  );
  return clamp(vo2max, 10, 85);
}

/**
 * 估算骑行 VO2max（ml/kg/min）
 *
 * VO2max = 1.74 * (MAP * 6.12 / 体重(kg)) + 3.5
 *
 * 公式来源：
 * Kokkinos P, et al. A new generalized cycle ergometry equation for predicting maximal oxygen uptake (FRIEND).
 * Eur J Prev Cardiol. 2018;25(10):1077-1082. doi: 10.1177/2047487318772667.
 * https://pubmed.ncbi.nlm.nih.gov/29692203/
 */
export const estimateVo2maxCycling = (
  maxAerobicPowerWatts: number,
  weightKg: number,
): number | undefined => {
  if (
    typeof maxAerobicPowerWatts !== 'number' ||
    !Number.isFinite(maxAerobicPowerWatts) ||
    maxAerobicPowerWatts <= 0
  ) {
    return undefined;
  }
  if (
    typeof weightKg !== 'number' ||
    !Number.isFinite(weightKg) ||
    weightKg <= 0
  ) {
    return undefined;
  }
  const vo2max = 1.74 * ((maxAerobicPowerWatts * 6.12) / weightKg) + 3.5;
  return round(vo2max, 2);
};

export const estimateVo2maxSwim = (): number => {
  return 0.0;
};
