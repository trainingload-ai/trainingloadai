import { intervalsAuthorization } from '@/integrations/intervals-icu/intervals-icu-authorization';
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

it('keeps the legacy credential generation on scheduled discovery snapshots', async () => {
  const task = new IntervalsIcuScheduledSyncTask(
    {
      $queryRawUnsafe: async () => [
        {
          id: 'connection',
          user_id: 'user',
          external_athlete_id: 'athlete',
          credential_ciphertext: 'key',
          credential_fingerprint: 'legacy-generation',
          metadata: {},
          status: 'ACTIVE',
        },
      ],
    } as never,
    {} as never,
  );
  const [connection] = await (task as any).claimDueConnections({
    startHourLocal: 4,
    staleStartedMinutes: 75,
    batchSize: 12,
  });
  expect(intervalsAuthorization(connection)).toEqual({
    connectionId: 'connection',
    userId: 'user',
    athleteId: 'athlete',
    revision: 'legacy-generation',
  });
});
