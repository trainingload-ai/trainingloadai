import { describe, expect, it, jest } from '@jest/globals';
import { ImportItemWorkerService } from '../import-item.worker';
import { ImportingJobService } from '../importing-job.service';
import { ImportingJobRepository } from '../persistence/importing-job.repository';

function createService(prisma: unknown, config: unknown = {}) {
  return new ImportItemWorkerService(
    prisma as never,
    config as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    new ImportingJobService(
      new ImportingJobRepository(prisma as never),
    ) as never,
    {} as never,
    {} as never,
  );
}

describe('ImportItemWorkerService leases', () => {
  it('reclaims expired in-progress items with a fresh lease', async () => {
    const $queryRawUnsafe = jest.fn(async (..._args: unknown[]) => [
      {
        id: 'item-1',
        batch_job_id: 'batch-1',
        user_id: 'user-1',
        source_object_id: 'source-1',
        source_kind: 'UNKNOWN',
        lock_token: 'claimed-token',
      },
    ]);
    const service = createService(
      { $queryRawUnsafe },
      { get: jest.fn(() => 60_000) },
    );

    await expect(
      (
        service as unknown as { claimBatch: (...args: unknown[]) => unknown }
      ).claimBatch(2),
    ).resolves.toEqual([
      {
        id: 'item-1',
        batchJobId: 'batch-1',
        userId: 'user-1',
        sourceObjectId: 'source-1',
        sourceKind: 'UNKNOWN',
        lockToken: 'claimed-token',
      },
    ]);
    const [sql, now, limit, token, leaseExpiresAt] =
      $queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("status IN ('NORMALIZING','DEDUPING'");
    expect(sql).toContain('lease_expires_at IS NULL');
    expect(now).toBeInstanceOf(Date);
    expect(limit).toBe(2);
    expect(typeof token).toBe('string');
    expect(leaseExpiresAt).toBeInstanceOf(Date);
  });

  it('rejects status writes after another worker owns the item', async () => {
    const updateMany = jest.fn(async () => ({ count: 0 }));
    const service = createService({ importItemJob: { updateMany } });
    (
      service as unknown as { activeLeaseTokens: Map<string, string> }
    ).activeLeaseTokens.set('item-1', 'old-token');

    await expect(
      (
        service as unknown as { markStatus: (...args: unknown[]) => unknown }
      ).markStatus('item-1', 'MATERIALIZING'),
    ).rejects.toThrow('lease lost');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1', lockToken: 'old-token' },
      }),
    );
  });

  it('fans out canonical payloads with one bulk insert', async () => {
    const aggregate = jest.fn(async () => ({ _max: { position: 4 } }));
    const createMany = jest.fn(async () => ({ count: 2 }));
    const update = jest.fn(async () => ({ id: 'parent-item' }));
    const service = createService({
      importItemJob: { aggregate, createMany, update },
    });
    const payloads = [
      { source: { kind: 'UNKNOWN', sourceUid: 'activity-1' } },
      { source: { kind: 'UNKNOWN', sourceUid: 'activity-2' } },
    ];

    await (
      service as unknown as {
        fanOutCanonicalPayloads: (...args: unknown[]) => unknown;
      }
    ).fanOutCanonicalPayloads({
      jobId: 'parent-item',
      batchJobId: 'batch-1',
      userId: 'user-1',
      sourceObjectId: 'source-1',
      payloads,
    });

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          sourceUid: 'activity-1',
          position: 5,
          status: 'QUEUED',
        }),
        expect.objectContaining({
          sourceUid: 'activity-2',
          position: 6,
          status: 'QUEUED',
        }),
      ],
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'parent-item' },
      data: expect.objectContaining({
        status: 'SKIPPED',
        lastErrorCode: 'spawned_child_items',
        lastError: 'Spawned 2 canonical item jobs',
      }),
    });
  });
});
