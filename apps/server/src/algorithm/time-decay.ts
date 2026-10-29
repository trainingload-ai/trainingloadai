/**
 * 带时间戳的指数加权估算器 (Time Decay Exponential Weighted Estimator)
 *
 * 用于根据历史数据点计算用户指标（如 VO2max, FTP, CP）。
 * 该算法解决了以下问题：
 * 1. 不规则的时间间隔（时间衰减）
 * 2. 数据更新乱序（与顺序无关的加权平均）
 * 3. 性能优化（截断旧数据）
 * 4. 冷启动处理（数据量少时的自适应）
 */

export interface TimeDecayDataPoint {
  date: Date | string | number; // 数据点的时间
  value: number; // 数据点的值
}

export interface TimeDecayOptions {
  /**
   * 衰减常数 (Tau)，单位：天。
   * 控制权重随时间降低的速度。
   * @default 60
   */
  decayDays?: number;

  /**
   * 截断倍数。
   * 早于 (decayDays * truncationMultiple) 的数据点将被忽略。
   * @default 3 (覆盖约 95% 的权重)
   */
  truncationMultiple?: number;

  /**
   * 计算的参考日期（通常是“现在”）。
   * 权重是相对于此日期计算的。
   * @default Date.now()
   */
  referenceDate?: Date | number;
}

// 默认配置常量
const DEFAULT_DECAY_DAYS = 60;
const DEFAULT_TRUNCATION_MULTIPLE = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 转换日期为时间戳
 */
const toTimestamp = (date: Date | string | number): number =>
  date instanceof Date
    ? date.getTime()
    : typeof date === 'number'
      ? date
      : new Date(date).getTime();

/**
 * 计算单个数据点的权重
 */
const calculateWeight = (
  pointTs: number,
  nowTs: number,
  tauMs: number,
  truncationLimitDays: number,
): number => {
  const diffMs = nowTs - pointTs;
  // 处理未来日期：视为“现在”（diff=0）
  const safeDiffMs = Math.max(0, diffMs);
  const diffDays = safeDiffMs / MS_PER_DAY;

  // 数据截断：如果数据太旧，权重为 0
  if (diffDays > truncationLimitDays) {
    return 0;
  }

  // w = e^(-dt / tau)
  return Math.exp(-safeDiffMs / tauMs);
};

/**
 * 计算特定参考时间点的指数加权平均值 (Functional Style)
 *
 * 公式:
 * Value = Sum(Vi * Wi) / Sum(Wi)
 * 其中 Wi = exp(-(T_ref - Ti) / Tau)
 *
 * @param data 数据点数组（顺序不影响结果）
 * @param options 配置选项
 * @returns 加权平均值，如果没有有效数据则返回 null
 */
export const calculateTimeDecay = (
  data: TimeDecayDataPoint[],
  options: TimeDecayOptions = {},
): number | null => {
  if (!data || data.length === 0) {
    return null;
  }

  // 1. 设置参数
  const decayDays = options.decayDays ?? DEFAULT_DECAY_DAYS;
  const truncationMultiple =
    options.truncationMultiple ?? DEFAULT_TRUNCATION_MULTIPLE;

  // 确保参数为正数
  if (decayDays <= 0) throw new Error('decayDays (衰减常数) 必须为正数');
  if (truncationMultiple <= 0)
    throw new Error('truncationMultiple (截断倍数) 必须为正数');

  const truncationLimitDays = decayDays * truncationMultiple;
  const nowTs = toTimestamp(options.referenceDate ?? Date.now());
  const tauMs = decayDays * MS_PER_DAY;

  // 2. 使用 reduce 进行函数式计算 (Map-Reduce 思想)
  // 将遍历、计算权重、累加合并为一步 reduce 操作
  const { weightedSum, totalWeight } = data.reduce(
    (acc, point) => {
      const pointTs = toTimestamp(point.date);
      const weight = calculateWeight(
        pointTs,
        nowTs,
        tauMs,
        truncationLimitDays,
      );

      if (weight === 0) {
        return acc;
      }

      return {
        weightedSum: acc.weightedSum + point.value * weight,
        totalWeight: acc.totalWeight + weight,
      };
    },
    { weightedSum: 0, totalWeight: 0 },
  );

  // 3. 计算最终结果
  // 如果总权重为 0（说明所有数据都被截断或为空），返回 null
  return totalWeight === 0 ? null : weightedSum / totalWeight;
};

// 保留类接口以兼容旧代码风格（可选，如果项目倾向于使用类）
export class TimeDecayEstimator {
  static calculate(
    data: TimeDecayDataPoint[],
    options: TimeDecayOptions = {},
  ): number | null {
    return calculateTimeDecay(data, options);
  }
}
