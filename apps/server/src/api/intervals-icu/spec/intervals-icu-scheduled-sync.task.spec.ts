import { describe, expect, it, jest } from '@jest/globals';

import { IntervalsIcuScheduledSyncTask } from '../intervals-icu-scheduled-sync.task';

describe('IntervalsIcuScheduledSyncTask', () => {
  it('uses the shared scheduler context when claiming connections', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(async () => []),
    };
    const service = new IntervalsIcuScheduledSyncTask(
      prisma as never,
      { syncConnectionLatest: jest.fn() } as never,
    );
    const context = {
      startHourLocal: 4,
      staleStartedMinutes: 75,
      batchSize: 12,
    };

    await expect(
      (
        service as never as {
          claimDueConnections: (...args: unknown[]) => Promise<unknown>;
        }
      ).claimDueConnections(context),
    ).resolves.toEqual([]);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('>= $1'),
      4,
      '75 minutes',
      12,
      true,
    );
  });
});
