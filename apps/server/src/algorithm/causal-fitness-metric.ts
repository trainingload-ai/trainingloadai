/**
 * 因果时间线对 AUTO 日历日零点的准入规则。
 *
 * 旧写入把 AUTO 的 recordedAt 压成日历日标签的 UTC 零点
 * （`YYYY-MM-DDT00:00:00.000Z`）。这是日期桶，不是活动结束或设备采样时刻，
 * 会在当天首项活动之前形成错误区间边界。
 *
 * 这类历史行可以继续留在表里。Replay / DATA_REPAIR 选 seed 时忽略它们；
 * 新的同类写入直接拒绝并记日志，不改写成另一个时间。
 * 落在替换窗口内、且不再属于当前时间线的旧 AUTO，仍由
 * `applyTimelineProjectionBatch` 归档后删除。本模块不删除行，也不生成阈值。
 *
 * MANUAL 继续使用日历日语义。活动结束恰好是该 UTC 零点、且 origin 带有
 * 活动或设备证据时，AUTO 仍然进入因果集。
 */

export type CausalFitnessMetricInput = {
  source: string;
  recordedAt: Date;
  originPayload?: unknown;
};

export function isCalendarDayMidnightSnap(recordedAt: Date): boolean {
  if (!Number.isFinite(recordedAt.getTime())) return false;
  return (
    recordedAt.getUTCHours() === 0 &&
    recordedAt.getUTCMinutes() === 0 &&
    recordedAt.getUTCSeconds() === 0 &&
    recordedAt.getUTCMilliseconds() === 0
  );
}

function payloadRecord(
  originPayload: unknown,
): Record<string, unknown> | null {
  if (
    originPayload == null ||
    typeof originPayload !== 'object' ||
    Array.isArray(originPayload)
  ) {
    return null;
  }
  return originPayload as Record<string, unknown>;
}

/** 时间戳来自活动结束或设备峰值，而不是日历日压缩。 */
export function hasActivityOrDeviceObservationTime(
  originPayload: unknown,
): boolean {
  const payload = payloadRecord(originPayload);
  if (!payload) return false;
  const ids = payload.sourceActivityIds;
  if (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every((id) => typeof id === 'number' && Number.isInteger(id) && id > 0)
  ) {
    return true;
  }
  const activityId = payload.activityId;
  return (
    typeof activityId === 'number' &&
    Number.isInteger(activityId) &&
    activityId > 0
  );
}

export function isCausalTimelineFitnessMetric(
  row: CausalFitnessMetricInput,
): boolean {
  if (row.source !== 'AUTO') return true;
  if (!isCalendarDayMidnightSnap(row.recordedAt)) return true;
  return hasActivityOrDeviceObservationTime(row.originPayload);
}

export function selectCausalTimelineFitnessMetrics<
  T extends CausalFitnessMetricInput,
>(rows: readonly T[]): T[] {
  return rows.filter((row) => isCausalTimelineFitnessMetric(row));
}
