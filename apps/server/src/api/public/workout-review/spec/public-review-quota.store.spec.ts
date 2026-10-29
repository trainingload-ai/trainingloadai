import { describe, expect, it, jest } from '@jest/globals';
import { PostgresPublicReviewQuotaStore } from '../public-review-quota.store';

describe('PostgresPublicReviewQuotaStore rolling-window boundary', () => {
  it('locks global and independent subjects before rejecting an active visitor reservation', async () => {
    const executeRaw = jest.fn(async (_query: unknown) => 1);
    const queryRaw = jest.fn(async (_query: unknown) => [
      {
        visitorHash: 'visitor',
        ipHash: 'old-ip',
        activityHash: 'old-activity',
        expiresAt: new Date('2026-08-11T10:00:00.000Z'),
      },
    ]);
    const tx = { $executeRaw: executeRaw, $queryRaw: queryRaw };
    const prisma = {
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const store = new PostgresPublicReviewQuotaStore(prisma as never);

    await expect(
      store.reserve(
        {
          admissionNonce: 'nonce',
          visitorHash: 'visitor',
          ipHash: 'ip',
          activityHash: 'activity',
          reservedWt: 8_000,
          subjects: [
            { scope: 'VISITOR', subjectHash: 'visitor' },
            { scope: 'IP', subjectHash: 'ip' },
            { scope: 'ACTIVITY', subjectHash: 'activity' },
            { scope: 'GLOBAL', subjectHash: 'GLOBAL' },
          ],
        },
        {
          visitorSuccesses: 1,
          activitySuccesses: 1,
          ipSuccesses: 3,
          ipModelStarts: 6,
          globalWeightedTokens: 100_000,
          maxReservationWeightedTokens: 8_000,
          reservationLeaseSeconds: 360,
        },
      ),
    ).rejects.toMatchObject({
      code: 'VISITOR_LIMIT_REACHED',
      nextRecoveryAt: '2026-08-11T10:00:00.000Z',
    });
    expect(executeRaw).toHaveBeenCalledTimes(4);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('derives counters and recovery times from the last 24 hours', async () => {
    const queryRaw = jest.fn(async (_query: unknown) => [
      {
        attempts: 3,
        modelStarts: 3,
        successes: 2,
        failures: 1,
        reservedWt: 0,
        usedWt: 5_000,
        nextSuccessRecoveryAt: new Date('2026-08-11T09:00:00.000Z'),
        nextModelStartRecoveryAt: new Date('2026-08-11T08:00:00.000Z'),
        nextTokenRecoveryAt: new Date('2026-08-11T09:00:00.000Z'),
      },
    ]);
    const store = new PostgresPublicReviewQuotaStore({
      $queryRaw: queryRaw,
    } as never);

    const snapshots = await store.snapshots([
      { scope: 'VISITOR', subjectHash: 'visitor' },
    ]);

    expect(snapshots.get('VISITOR')).toMatchObject({
      successes: 2,
      failures: 1,
      nextSuccessRecoveryAt: '2026-08-11T09:00:00.000Z',
    });
    expect(String((queryRaw.mock.calls[0]?.[0] as { sql: unknown }).sql)).toContain(
      "INTERVAL '24 hours'",
    );
    expect(String((queryRaw.mock.calls[0]?.[0] as { sql: unknown }).sql)).not.toContain(
      'CURRENT_DATE',
    );
  });

  it('settles only the reservation event; no aggregate bucket is updated', async () => {
    const executeRaw = jest.fn(async (_query: unknown) => 1);
    const queryRaw = jest.fn(async (_query: unknown) => [
      { id: 'reservation-1', reservedWt: 8_000 },
    ]);
    const tx = { $executeRaw: executeRaw, $queryRaw: queryRaw };
    const prisma = {
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const store = new PostgresPublicReviewQuotaStore(prisma as never);

    await store.settle({
      reservationId: 'reservation-1',
      outcome: 'SUCCEEDED',
      actualWt: 3_000,
    });

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const updateSql = String(
      (executeRaw.mock.calls[0]?.[0] as { sql: unknown }).sql,
    );
    expect(updateSql).toContain('"actual_wt"');
    expect(updateSql).not.toContain('quota_bucket');
  });

  it('records upstream tokens for a failed review so shared cost remains accurate', async () => {
    const executeRaw = jest.fn(async (_query: unknown) => 1);
    const queryRaw = jest.fn(async (_query: unknown) => [
      { id: 'reservation-2', reservedWt: 8_000 },
    ]);
    const tx = { $executeRaw: executeRaw, $queryRaw: queryRaw };
    const prisma = {
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const store = new PostgresPublicReviewQuotaStore(prisma as never);

    await store.settle({
      reservationId: 'reservation-2',
      outcome: 'FAILED',
      actualWt: 9_500,
    });

    const updateQuery = executeRaw.mock.calls[0]?.[0] as {
      sql: unknown;
      values: unknown[];
    };
    expect(String(updateQuery.sql)).toContain('"actual_wt"');
    expect(updateQuery.values).toContain(9_500);
  });
});
