import { describe, expect, it, jest } from '@jest/globals';
import {
  PersonalConnectionService,
  defaultPersonalSettings,
} from '../personal-connection.service';

const connection = {
  id: 'connection',
  userId: 'owner',
  provider: 'garmin',
  externalAthleteId: 'vendor-owner',
  status: 'ACTIVE',
  credentialFingerprint: 'old-version',
  metadata: {
    connectionMode: 'personal_api',
    region: 'global',
    settings: defaultPersonalSettings,
  },
};
function harness() {
  const tx = {
    $executeRaw: jest.fn<() => Promise<unknown>>().mockResolvedValue(1),
    externalProviderConnection: {
      findUnique: jest.fn<() => Promise<any>>().mockResolvedValue(connection),
      updateMany: jest.fn<() => Promise<any>>().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn<() => Promise<any>>()
        .mockResolvedValue(connection),
      create: jest.fn<() => Promise<any>>(),
    },
    personalProviderJob: {
      updateMany: jest.fn<() => Promise<any>>().mockResolvedValue({ count: 1 }),
    },
  };
  const db = {
    externalProviderConnection: {
      findUnique: jest.fn<() => Promise<any>>().mockResolvedValue(connection),
    },
    personalProviderJob: {
      findMany: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    },
    $transaction: async (work: (transaction: typeof tx) => Promise<unknown>) =>
      work(tx),
  };
  const garmin = {
    exchange: jest.fn<() => Promise<any>>().mockResolvedValue({
      apiKey: 'fixture-only-key',
      token: 'fixture-only-token',
    }),
    profile: jest
      .fn<() => Promise<any>>()
      .mockResolvedValue({ accountId: 'vendor-owner' }),
  };
  const service = new PersonalConnectionService(
    db as never,
    {
      encrypt: () => 'fixture-sealed',
      fingerprint: () => 'new-version',
      last4: () => '-key',
    } as never,
    {} as never,
    garmin as never,
    {} as never,
  );
  return { service, db, tx, garmin };
}
const request = {
  apiKey: 'fixture-only-key',
  region: 'global',
  settings: defaultPersonalSettings,
  confirmed: true,
};

describe('personal connection lifecycle', () => {
  it('rejects an old authorization after another connection replaced its credential', async () => {
    const { service, tx } = harness();
    tx.externalProviderConnection.findUnique.mockResolvedValue({
      ...connection,
      credentialFingerprint: 'other-version',
    });
    await expect(service.connectGarmin('owner', request)).rejects.toThrow(
      'PROVIDER_CONNECTION_CHANGED',
    );
    expect(tx.personalProviderJob.updateMany).not.toHaveBeenCalled();
    expect(tx.externalProviderConnection.updateMany).not.toHaveBeenCalled();
  });
  it('fences a replacement against an intervening refresh or disconnect', async () => {
    const { service, tx } = harness();
    tx.externalProviderConnection.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.connectGarmin('owner', request)).rejects.toThrow(
      'PROVIDER_CONNECTION_CHANGED',
    );
    expect(tx.externalProviderConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: connection.id, credentialFingerprint: 'old-version' },
      }),
    );
    expect(tx.externalProviderConnection.create).not.toHaveBeenCalled();
  });
  it('does not exchange a replacement key before explicit confirmation', async () => {
    const { service, garmin } = harness();
    await expect(
      service.connectGarmin('owner', { ...request, confirmed: false }),
    ).rejects.toThrow('PROVIDER_RECONNECT_CONFIRM_REQUIRED');
    expect(garmin.exchange).not.toHaveBeenCalled();
  });
  it('freezes terminal SYNC counts so a later sync cannot rewrite history', async () => {
    const { service, db } = harness();
    db.personalProviderJob.findMany
      .mockResolvedValueOnce([
        {
          id: 'sync-old',
          kind: 'SYNC',
          status: 'FAILED',
          attempts: 0,
          result: {
            childIds: ['a', 'b'],
            discovered: 49,
            downloading: 0,
            importing: 0,
            imported: 0,
            healthDays: 0,
            failed: 38,
            pending: 0,
          },
          payload: {
            accountRef: 'vendor-owner',
            startDate: '2026-01-01',
            endDate: '2026-10-31',
            trigger: 'manual',
          },
        },
        {
          id: 'sync-new',
          kind: 'SYNC',
          status: 'WAITING',
          attempts: 0,
          result: { childIds: ['a', 'b'] },
          payload: {
            accountRef: 'vendor-owner',
            startDate: '2026-01-01',
            endDate: '2026-10-30',
            trigger: 'manual',
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'a',
          kind: 'ACTIVITY',
          status: 'SUCCEEDED',
          result: { imported: 1 },
        },
        {
          id: 'b',
          kind: 'ACTIVITY',
          status: 'WAITING',
          result: { serialHeld: false },
        },
      ]);
    const status = await service.status('owner', 'garmin');
    expect(status.jobs[0]).toMatchObject({
      id: 'sync-old',
      status: 'FAILED',
      startDate: '2026-01-01',
      endDate: '2026-10-31',
      trigger: 'manual',
      // Frozen snapshot — not the live child ledger (imported 1 / downloading 1).
      result: {
        discovered: 49,
        downloading: 0,
        importing: 0,
        imported: 0,
        failed: 38,
        pending: 0,
      },
    });
    expect(status.jobs[1]).toMatchObject({
      id: 'sync-new',
      status: 'WAITING',
      result: {
        discovered: 2,
        downloading: 1,
        importing: 0,
        imported: 1,
        pending: 1,
      },
    });
  });
});
