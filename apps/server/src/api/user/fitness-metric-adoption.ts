/**
 * MANUAL 只表示一次明确的用户采用或外部导入。
 *
 * `SYSTEM_CALCULATED` 只能和 AUTO / ESTIMATED 一起出现。2026 年 7–8 月的旧
 * 写入会在自动更新时再插一条 `source=MANUAL, changeSource=SYSTEM_CALCULATED`，
 * 同一时刻 MANUAL 压过 AUTO，异常估算因此变成粘性生效值。该写入已从当前
 * Public Core 删除。这里把组合变成不可能，并让生效值、校验上下文和
 * Replay / DATA_REPAIR 忽略仍留在表里的历史行。
 *
 * 不改写、不删除这些行，也不把它们悄悄改成 AUTO。建议值继续留在 AUTO 或
 * ESTIMATED。用户在设置或评估里确认采用时，才写 MANUAL + USER_MANUAL。
 */

export type FitnessMetricAdoptionRow = {
  source?: string | null;
  changeSource?: string | null;
};

export const SYSTEM_CALCULATED_MANUAL_MIRROR = {
  source: 'MANUAL',
  changeSource: 'SYSTEM_CALCULATED',
} as const;

export function isSystemCalculatedManualMirror(
  row: FitnessMetricAdoptionRow,
): boolean {
  return (
    row.source === SYSTEM_CALCULATED_MANUAL_MIRROR.source &&
    row.changeSource === SYSTEM_CALCULATED_MANUAL_MIRROR.changeSource
  );
}

/** 拒绝写入。调用方不得改成别的 source 或 changeSource 后再落库。 */
export function rejectSystemCalculatedManualWrite(
  row: FitnessMetricAdoptionRow,
): void {
  if (isSystemCalculatedManualMirror(row)) {
    throw new Error('SYSTEM_CALCULATED_MANUAL_FORBIDDEN');
  }
}

export function withoutSystemCalculatedManualMirrors<
  T extends FitnessMetricAdoptionRow,
>(rows: readonly T[]): T[] {
  return rows.filter((row) => !isSystemCalculatedManualMirror(row));
}

/**
 * 在查询里排除历史镜像。WHERE 先于 DISTINCT，避免最新的伪 MANUAL
 * 占住 MANUAL 名额、把更早的真实用户值挤掉。
 */
export function excludeSystemCalculatedManualMirror<T extends object>(
  where: T,
): T {
  const current = (where as { NOT?: unknown }).NOT;
  const exclusion = { ...SYSTEM_CALCULATED_MANUAL_MIRROR };
  const NOT =
    current == null
      ? exclusion
      : Array.isArray(current)
        ? [...current, exclusion]
        : [current, exclusion];
  // 调用点把结果直接交给 Prisma。NOT 的运行时形状是排除条件或条件数组；
  // 收窄成 T 是为了不把 Prisma 类型引进这个与 Core 共用的模块。
  return { ...where, NOT } as T;
}
