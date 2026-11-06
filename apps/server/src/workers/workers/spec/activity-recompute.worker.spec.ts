import { describe, expect, it, jest } from '@jest/globals';
import { ActivityRecomputeWorkerService } from '../activity-recompute.worker';

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    userId: 'user-1',
    metricType: 'ACTIVITY_INPUT' as const,
    sportType: undefined,
    recomputeFrom: new Date('2026-01-01T00:00:00.000Z'),
    recomputeTo: new Date('2026-01-31T00:00:00.000Z'),
    lookbackDays: 60,
    priority: 100,
    replayCheckpoint: {
      schemaVersion: 1,
      nextEffectiveFrom: '2026-01-10T00:00:00.000Z',
      lastActivityId: 42,
    },
    includeActivityIds: [42],
    lockToken: 'owner-old',
    ...overrides,
  };
}

describe('ActivityRecomputeWorkerService claim fencing', () => {
  it('uses the UTC claim instant for audit timestamps as well as the lease', async () => {
    const $queryRaw = jest.fn(async (..._args: unknown[]) => []);
    const worker = new ActivityRecomputeWorkerService(
      { $queryRaw } as never,
      {} as never,
      {} as never,
    );
    await (worker as unknown as { claimBatch(size: number): Promise<unknown> }).claimBatch(1);
    const [parts, ...parameters] = $queryRaw.mock.calls[0];
    const sql = (parts as TemplateStringsArray).join('?');
    expect(sql).toContain('started_at=COALESCE(j.started_at, ?)');
    expect(sql).toContain('updated_at=?');
    expect(sql).not.toContain('NOW()');
    const claimTime = parameters[0] as Date;
    expect(claimTime).toBeInstanceOf(Date);
    const dates = parameters.filter((value): value is Date => value instanceof Date);
    expect(dates.filter(value => value === claimTime)).toHaveLength(5);
  });

  it('passes the persisted cursor and owner token into Replay', async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const prisma = {
      activityRecomputeJob: { updateMany },
      $transaction: jest.fn(),
    };
    const executor = {
      executeMetricChangeRecompute: jest.fn(async () => ({
        completed: true,
        nextCheckpoint: null,
        processedActivities: 12,
      })),
    };
    const worker = new ActivityRecomputeWorkerService(
      prisma as never,
      { get: jest.fn(() => 3) } as never,
      executor as never,
    );

    await (
      worker as unknown as { processJob(input: unknown): Promise<void> }
    ).processJob(job());

    expect(executor.executeMetricChangeRecompute).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceJobId: 'job-1',
        effectiveFrom: new Date('2026-01-10T00:00:00.000Z'),
        sourceLockToken: 'owner-old',
        includeActivityIds: [42],
        maxActivities: 100,
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'job-1',
          status: 'RUNNING',
          lockToken: 'owner-old',
        },
        data: expect.objectContaining({ status: 'COMPLETED', lockToken: null }),
      }),
    );
  });

  it('does not let a stale worker overwrite the new owner result', async () => {
    const prisma = {
      activityRecomputeJob: {
        // Completion fenced out because another worker already claimed it.
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      $transaction: jest.fn(),
    };
    const executor = {
      executeMetricChangeRecompute: jest.fn(async () => ({
        completed: true,
        nextCheckpoint: null,
        processedActivities: 12,
      })),
    };
    const worker = new ActivityRecomputeWorkerService(
      prisma as never,
      { get: jest.fn(() => 3) } as never,
      executor as never,
    );

    await (
      worker as unknown as { processJob(input: unknown): Promise<void> }
    ).processJob(job());

    expect(prisma.activityRecomputeJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lockToken: 'owner-old' }),
      }),
    );
    // A fenced result is discarded; it must not enter the generic failure
    // transaction and mutate attempts/checkpoint owned by the new worker.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
