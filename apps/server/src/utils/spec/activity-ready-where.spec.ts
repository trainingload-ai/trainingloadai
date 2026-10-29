import { describe, expect, it } from '@jest/globals';
import { ActivityProcessingStatus } from '@prisma/client';
import {
  READY_ACTIVITY_SQL_PREDICATE,
  readyActivityWhere,
  readyOrScopedActivityWhere,
} from '../activity-ready-where';

describe('readyActivityWhere', () => {
  it('将业务条件、软删除状态和 READY 兼容条件组合为 AND', () => {
    expect(readyActivityWhere({ userId: 'user-1', sportType: 'RUN' })).toEqual({
      AND: [
        { userId: 'user-1', sportType: 'RUN' },
        { state: 1 },
        {
          OR: [
            { processingStatus: ActivityProcessingStatus.READY },
            { readyAt: { not: null } },
          ],
        },
      ],
    });
  });

  it('原生 SQL 谓词与 Prisma 语义一致', () => {
    expect(READY_ACTIVITY_SQL_PREDICATE).toContain('"state" = 1');
    expect(READY_ACTIVITY_SQL_PREDICATE).toContain(
      '"processing_status" = \'READY\'',
    );
    expect(READY_ACTIVITY_SQL_PREDICATE).toContain('"ready_at" IS NOT NULL');
  });

  it('只额外放行显式作用域内的批次活动', () => {
    expect(
      readyOrScopedActivityWhere({ userId: 'user-1' }, [42, 42, -1, 43]),
    ).toEqual({
      AND: [
        { userId: 'user-1' },
        { state: 1 },
        {
          OR: [
            { processingStatus: ActivityProcessingStatus.READY },
            { readyAt: { not: null } },
            { id: { in: [42, 43] } },
          ],
        },
      ],
    });
  });
});
