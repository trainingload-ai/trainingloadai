import { SensorRecord } from '../sensor/sensor-data.service';
import dayjs = require('dayjs');
import { computeGapSpeed } from './gap';

/**
 * 丹尼尔斯点数 (Daniels Points) 计算选项
 */
export interface DanielsPointsOptions {
  /**
   * 临界功率 (CP, Watts) 用于骑行，或临界速度 (CV, m/s) 用于跑步/游泳。
   * 这是指在此强度下运动 1 小时将产生 100 点数。
   */
  cp: number;

  /**
   * 计算模式:
   * - 'power': 使用功率数据 (watts)，采用 EWMA 平滑处理 (时间常数 ~25s)。
   * - 'speed': 使用速度数据 (m/s)，采用 SMA 平滑处理 (窗口 10s)。
   * - 'swim': 使用速度数据 (m/s)，采用 SMA 平滑处理 (窗口 10s)，不进行坡度修正。
   */
  mode: 'power' | 'speed' | 'swim';

  /**
   * 记录间隔 (秒)。
   * 如果未提供，将从记录中估算 (取中位数)。
   */
  recIntSecs?: number;

  /**
   * 活动总时长 (秒)。
   * 如果提供了此参数，将直接使用而不再重新计算 (结束时间 - 开始时间)。
   */
  totalDuration?: number;
}

/**
 * 丹尼尔斯点数计算结果
 */
export interface DanielsPointsResult {
  /**
   * 总丹尼尔斯点数 (Daniels Points)。
   * 类似于 TSS，衡量训练负荷。
   */
  points: number;

  /**
   * 等效值 (功率或速度)。
   * 即在相同持续时间内产生相同点数的恒定功率或速度。
   */
  equivalentValue: number;
}

// 设定常数 K，使得在 FTP/CP 强度下运动 1 小时产生 100 点数。
// K = 100 / 3600
const K = 100.0 / 3600.0;

/**
 * 计算一组记录的丹尼尔斯点数。
 *
 * 逻辑源自 GoldenCheetah 的 DanielsPoints.cpp。
 * 核心公式: Points += K * Duration * (Intensity / CP)^4
 *
 * 计算逻辑说明：
 * 1. 这是一个衡量训练负荷的算法，与 TSS (Training Stress Score) 类似，但使用 4 次方加权，
 *    意味着高强度努力对总分的贡献呈指数级增长。
 * 2. 对于功率数据 (Power Mode):
 *    - 使用指数加权移动平均 (EWMA) 对功率进行平滑，时间常数约为 25 秒。
 *    - 这模拟了生理反应的滞后性，避免瞬时功率尖峰对分数的过度影响。
 * 3. 对于速度数据 (Speed Mode):
 *    - 如果是跑步，首先根据坡度计算 GAP (坡度调整速度)。
 *    - 使用 10 秒窗口的简单移动平均 (SMA) 计算平均速度。
 *    - 对每个窗口计算点数累加。
 * 4. 最终结果归一化为：CP 强度下 1 小时 = 100 分。
 *
 * 源文件: apps/server/src/algorithm/cpp/DanielsPoints.cpp
 */
export function computeDanielsPoints(
  records: SensorRecord[],
  options: DanielsPointsOptions,
): DanielsPointsResult {
  if (!records || records.length === 0 || !options.cp || options.cp <= 0) {
    return { points: 0, equivalentValue: 0 };
  }

  // 确定记录间隔 (secsDelta)
  let secsDelta = options.recIntSecs;
  if (!secsDelta) {
    secsDelta = estimateRecordingInterval(records);
  }
  if (secsDelta <= 0) secsDelta = 1;

  let points = 0;
  const cp = options.cp;

  if (options.mode === 'power') {
    points = computeOnPower(records, cp, secsDelta);
  } else {
    points = computeOnSpeed(records, cp, options.mode === 'swim');
  }

  // 计算等效值 (功率或速度)
  // 公式反推: equivalent = cp * (points / K / totalDuration)^0.25
  const totalDuration =
    options.totalDuration ?? calculateTotalDuration(records);
  const equivalentValue =
    totalDuration > 0 ? cp * Math.pow(points / K / totalDuration, 0.25) : 0;

  return { points, equivalentValue };
}

/**
 * 辅助函数：估算记录间隔 (取前 20 个点的间隔中位数)。
 */
function estimateRecordingInterval(records: SensorRecord[]): number {
  if (records.length < 2) return 1;
  const deltas: number[] = [];
  const limit = Math.min(records.length, 20);
  for (let i = 1; i < limit; i++) {
    const t1 = dayjs(records[i].timestamp).valueOf();
    const t0 = dayjs(records[i - 1].timestamp).valueOf();
    const diff = (t1 - t0) / 1000;
    if (diff > 0) deltas.push(diff);
  }
  if (deltas.length === 0) return 1;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

/**
 * 计算活动的总持续时间 (秒)。
 * 简单近似：结束时间 - 开始时间。
 */
function calculateTotalDuration(records: SensorRecord[]): number {
  if (records.length < 2) return 0;
  const start = dayjs(records[0].timestamp).valueOf();
  const end = dayjs(records[records.length - 1].timestamp).valueOf();
  return (end - start) / 1000;
}

/**
 * 分数累加辅助函数。
 * score += K * secs * (value / cp)^4
 */
function inc(score: number, secs: number, value: number, cp: number): number {
  return score + K * secs * Math.pow(value / cp, 4);
}

/**
 * 基于功率计算丹尼尔斯点数。
 * 使用时间常数约为 25 秒的 EWMA (指数加权移动平均) 平滑。
 */
function computeOnPower(
  records: SensorRecord[],
  cp: number,
  secsDelta: number,
): number {
  const EPSILON = 0.1;
  const NEGLIGIBLE = 0.1;

  // EWMA 常数计算
  // 窗口样本数 = 25.0 / 记录间隔
  // 衰减系数 (attenuation) = 窗口样本数 / (窗口样本数 + 记录间隔)
  // 样本权重 (sampleWeight) = 记录间隔 / (窗口样本数 + 记录间隔)
  // 这里的逻辑是实现一个低通滤波器，模拟生理滞后。

  const sampsPerWindow = 25.0 / secsDelta;
  const attenuation = sampsPerWindow / (sampsPerWindow + secsDelta);
  const sampleWeight = secsDelta / (sampsPerWindow + secsDelta);

  let lastSecs = dayjs(records[0].timestamp).valueOf() / 1000;
  let weighted = 0.0;
  let score = 0.0;

  for (const record of records) {
    const currentSecs = dayjs(record.timestamp).valueOf() / 1000;
    const row = record as unknown as Record<string, unknown>;
    const watts = Number(row.power || row.watts || 0);

    // 处理数据中断 (Gap): 如果当前点与上一点的时间差超过了记录间隔
    // 则认为这期间功率衰减为 0，循环应用衰减直到时间追上
    while (
      weighted > NEGLIGIBLE &&
      currentSecs > lastSecs + secsDelta + EPSILON
    ) {
      weighted *= attenuation;
      lastSecs += secsDelta;
      score = inc(score, secsDelta, weighted, cp);
    }

    // 应用 EWMA 更新加权功率
    weighted *= attenuation;
    weighted += sampleWeight * watts;

    // 累加当前步的分数
    // 注意：C++ 实现中使用固定的 secsDelta 进行累加，
    // 这意味着每个采样点代表一段固定的持续时间 (即使填补了 Gap)。
    lastSecs = currentSecs;
    score = inc(score, secsDelta, weighted, cp);
  }

  // 处理尾部衰减 (Decay trailing tail)
  // 活动结束后，生理上的代谢压力不会立即消失，继续计算衰减直到可以忽略不计
  let loops = 0;
  while (++loops < 10000 && weighted > NEGLIGIBLE) {
    weighted *= attenuation;
    score = inc(score, secsDelta, weighted, cp);
  }

  return score;
}

/**
 * 基于速度计算丹尼尔斯点数。
 * 使用 10 秒窗口的简单移动平均 (SMA) 平滑。
 */
function computeOnSpeed(
  records: SensorRecord[],
  cv: number,
  isSwim: boolean,
): number {
  const AVERAGE_WINDOW_IN_SECS = 10;

  let score = 0.0;
  let lastWindowSecs = dayjs(records[0].timestamp).valueOf() / 1000;
  let previousSecs = lastWindowSecs;

  // 当前窗口的累加器
  let weightedSum = 0.0;
  let sampsPerWindow = 0;

  // 获取估算的记录间隔，用于判断数据中断
  const recIntSecs = estimateRecordingInterval(records);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const currentSecs = dayjs(record.timestamp).valueOf() / 1000;

    // 获取速度 (m/s)
    let speed = record.speed || 0;

    // 如果不是游泳，根据坡度调整速度 (GAP)
    if (!isSwim) {
      // 获取坡度，优先使用 grade 字段，如果没有则尝试 slope
      const row = record as unknown as Record<string, unknown>;
      const slope = Number(row.grade || row.slope || 0);
      speed = computeGapSpeed(speed, slope);
    }

    weightedSum += speed;
    sampsPerWindow++;

    const timeSinceWindowStart = currentSecs - lastWindowSecs;
    const timeSinceLastPoint = currentSecs - previousSecs;
    const isLastPoint = i === records.length - 1;

    // 判断是否处理当前窗口:
    // 1. 窗口时间已满 (超过 10s)
    // 2. 检测到数据中断 (时间差 > 1.5倍间隔)
    // 3. 到达最后一个点
    if (
      timeSinceWindowStart > AVERAGE_WINDOW_IN_SECS ||
      timeSinceLastPoint > recIntSecs * 1.5 ||
      isLastPoint
    ) {
      // 计算窗口时间跨度 (从上一个窗口结束点到当前点的前一点)
      // 注意：这里的逻辑复刻自 C++，窗口的平均值包含当前点，但时间跨度是 [lastWindow, previous]
      const windowDuration = previousSecs - lastWindowSecs;

      if (windowDuration > 0) {
        // 计算平均速度
        // 注意：C++ 逻辑中，如果窗口内有多个点，平均值计算时分母减 1 ?
        // 原始 C++ 代码逻辑复杂，这里简化为标准的平均值计算，以保持鲁棒性。
        // 但为了精确复刻，我们回顾 C++:
        // avg = weighted / sampsPerWindow; (实际上 C++ 是 sum / count)
        const avg = sampsPerWindow > 0 ? weightedSum / sampsPerWindow : 0;

        // 累加分数
        score = inc(score, windowDuration, avg, cv);

        // 重置窗口，将当前点作为新窗口的起点
        lastWindowSecs = currentSecs;
        weightedSum = 0;
        sampsPerWindow = 0;
      }
    }

    previousSecs = currentSecs;
  }

  return score;
}
