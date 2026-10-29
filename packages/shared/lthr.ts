/**
 * 缺少真实 LTHR 时，用于运行时计算的最大心率比例。
 *
 * 估算值只允许参与负荷、强度和区间换算，不代表用户真实 LTHR，
 * 不应写入体能指标、历史指标快照或作为实测结果展示。
 */
export const ESTIMATED_LTHR_MAX_HR_RATIO = 0.88;

export type LthrCalculationSource = "PROFILE" | "ESTIMATED_MAX_HR";

export type LthrCalculationResolution = {
  value: number;
  source: LthrCalculationSource;
};

function positiveFinite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/**
 * 解析一次计算使用的 LTHR。真实值优先；否则按 MAXHR × 88% 运行时估算。
 */
export function resolveLthrForCalculation(input: {
  lthr?: number | null;
  maxHeartRate?: number | null;
}): LthrCalculationResolution | undefined {
  const actualLthr = positiveFinite(input.lthr);
  if (actualLthr != null) {
    return { value: actualLthr, source: "PROFILE" };
  }

  const maxHeartRate = positiveFinite(input.maxHeartRate);
  if (maxHeartRate == null) return undefined;

  return {
    value: Math.round(maxHeartRate * ESTIMATED_LTHR_MAX_HR_RATIO),
    source: "ESTIMATED_MAX_HR",
  };
}
