import { describe, expect, it, jest } from '@jest/globals';
import { ActivityAnalysisLeaseService } from '../activity-analysis-lease.service';

function setup(args?: {
  active?: number;
  repairs?: number;
  existing?: object;
}) {
  const lease = {
    deleteMany: jest.fn(async () => ({ count: 0 })),
    findUnique: jest.fn(async () => args?.existing ?? null),
    count: jest
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(args?.active ?? 0)
      .mockResolvedValueOnce(args?.repairs ?? 0),
    create: jest.fn(async () => ({})),
    updateMany: jest.fn(async () => ({ count: 1 })),
  };
  const tx = {
    $queryRaw: jest.fn(async () => []),
    activityAnalysisLease: lease,
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    activityAnalysisLease: lease,
  };
  const service = new ActivityAnalysisLeaseService(
    prisma as never,
    {
      get: jest.fn(() => undefined),
    } as never,
  );
  return { service, lease };
}

describe('ActivityAnalysisLeaseService', () => {
  it('enforces one active Replay for the same user', async () => {
    const { service, lease } = setup({ existing: { ownerToken: 'other' } });
    const result = await service.acquire({
      userId: 'user-1',
      sourceJobType: 'USER_POST_PROCESS',
      sourceJobId: 'job-1',
      priority: 100,
      dataRepair: false,
    });
    expect(result).toBeNull();
    expect(lease.create).not.toHaveBeenCalled();
  });

  it('enforces global Replay capacity and DATA_REPAIR capacity', async () => {
    const full = setup({ active: 2 });
    await expect(
      full.service.acquire({
        userId: 'user-1',
        sourceJobType: 'ACTIVITY_RECOMPUTE',
        sourceJobId: 'job-1',
        priority: 100,
        dataRepair: false,
      }),
    ).resolves.toBeNull();

    const repair = setup({ active: 1, repairs: 1 });
    await expect(
      repair.service.acquire({
        userId: 'user-2',
        sourceJobType: 'ACTIVITY_RECOMPUTE',
        sourceJobId: 'job-2',
        priority: 10,
        dataRepair: true,
      }),
    ).resolves.toBeNull();
  });

  it('does not revive an already expired owner token during heartbeat', async () => {
    const { service, lease } = setup();
    lease.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.heartbeat({
        userId: 'user-1',
        sourceJobType: 'USER_POST_PROCESS',
        sourceJobId: 'job-1',
        priority: 100,
        dataRepair: false,
        ownerToken: 'owner',
        leaseExpiresAt: new Date(Date.now() - 1),
      }),
    ).resolves.toBe(false);
    expect(lease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerToken: 'owner',
          leaseExpiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
  });
});
