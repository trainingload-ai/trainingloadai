/**
 * 体能阈值合并：依次取第一个有限且 > 0 的候选。
 * 约定优先级由调用方传入顺序表达（例如 cache → 快照 → API → profile）。
 */
export function pickPositiveThreshold(
  ...candidates: Array<number | null | undefined>
): number | undefined {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
  }
  return undefined;
}
