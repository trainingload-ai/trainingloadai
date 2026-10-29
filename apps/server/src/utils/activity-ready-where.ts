import { ActivityProcessingStatus, type Prisma } from '@prisma/client';

/**
 * 用户侧可见活动的统一谓词。
 *
 * `readyAt` 是旧数据兼容兜底；新链路以 processingStatus=READY 为准。
 * 处理 worker、关联和失败恢复需要看到非 READY 活动，不应使用此 helper。
 */
export function readyActivityWhere(
  where: Prisma.ActivityWhereInput = {},
): Prisma.ActivityWhereInput {
  return readyOrScopedActivityWhere(where);
}

/**
 * 后处理指标聚合使用：读取所有 READY 活动，并额外放行调用方明确给出的当前批次活动。
 * 这样新导入活动能参与阈值刷新，同时不会读到其他并发批次的半成品。
 */
export function readyOrScopedActivityWhere(
  where: Prisma.ActivityWhereInput = {},
  scopedActivityIds: readonly number[] = [],
): Prisma.ActivityWhereInput {
  const ids = Array.from(
    new Set(
      scopedActivityIds.filter(
        (id) => Number.isInteger(id) && Number.isSafeInteger(id) && id > 0,
      ),
    ),
  );
  return {
    AND: [
      where,
      { state: 1 },
      {
        OR: [
          { processingStatus: ActivityProcessingStatus.READY },
          { readyAt: { not: null } },
          ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
        ],
      },
    ],
  };
}

/** PostgreSQL 原生查询使用的等价固定谓词。 */
export const READY_ACTIVITY_SQL_PREDICATE =
  '"state" = 1 AND ("processing_status" = \'READY\' OR "ready_at" IS NOT NULL)';
