import { importingJobRepository } from '@/importing/spec/importing-job.fixture';
import { ImportingJobService } from '../importing-job.service';
import { ThirdPartyActivityProjectorService } from '../third-party-activity-projector.service';
import { describe, expect, it, jest } from '@jest/globals';
import type { CanonicalActivityPayload } from '../canonical-activity.types';

function createService(prisma: unknown) {
  return new ThirdPartyActivityProjectorService(
    prisma as never,
    new ImportingJobService(importingJobRepository(prisma as never)),
  );
}

function payload(kind: string): CanonicalActivityPayload {
  return {
    source: { kind, sourceUid: `${kind}:activity-1#0`, externalId: '123' },
    identity: { dedupeKey: 'd', datasetChecksum: 'a'.repeat(64) },
    summary: { sportType: 'RUN' },
    laps: [],
    records: [],
    lengths: [],
    metadata: { region: 'china' },
  } as never;
}

describe('ThirdPartyActivityProjectorService', () => {
  it('does not create a pseudo third-party activity for manual upload', async () => {
    const service = createService({} as never);
    await expect(
      service.project({
        userId: 'user-1',
        sourceObjectId: 'source-1',
        batchJobId: 'batch-1',
        payload: payload('FILE'),
      }),
    ).resolves.toBeNull();
  });

  it('preserves a provider child activity identity', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(async () => 1),
      thirdPartyActivity: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async (args: { create: Record<string, unknown> }) => ({
          id: 1,
          ...args.create,
        })),
      },
    };
    const prisma = {
      thirdPartyActivity: tx.thirdPartyActivity,
      $transaction: jest.fn(async (callback: (client: never) => unknown) =>
        callback(tx as never),
      ),
    };
    const service = createService(prisma as never);
    await service.project({
      userId: 'user-1',
      sourceObjectId: 'source-1',
      batchJobId: 'batch-1',
      payload: payload('INTERVALS_ICU'),
    });

    expect(tx.thirdPartyActivity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider_externalId: {
            userId: 'user-1',
            provider: 'intervals_icu',
            externalId: '123#0',
          },
        },
      }),
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))::text AS lock',
      JSON.stringify(['user-1', 'intervals_icu', '123#0']),
    );
  });

  it('does not mutate an identity concurrently owned by another user', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(async () => 1),
      thirdPartyActivity: {
        findUnique: jest.fn(async () => ({ id: 1, userId: 'user-2' })),
        upsert: jest.fn(),
      },
    };
    const service = createService({
      thirdPartyActivity: tx.thirdPartyActivity,
      $transaction: jest.fn(async (callback: (client: never) => unknown) =>
        callback(tx as never),
      ),
    } as never);

    await expect(
      service.project({
        userId: 'user-1',
        sourceObjectId: 'source-1',
        batchJobId: 'batch-1',
        payload: payload('INTERVALS_ICU'),
      }),
    ).rejects.toThrow('belongs to another user');
    expect(tx.thirdPartyActivity.upsert).not.toHaveBeenCalled();
  });

  it('reactivates a preferred projection and migrates it to the normalized identity', async () => {
    const preferred = {
      id: 7,
      userId: 'user-1',
      provider: 'intervals_icu',
      externalId: '123',
      state: 0,
    };
    const tx = {
      $executeRawUnsafe: jest.fn(async () => 1),
      thirdPartyActivity: {
        findUnique: jest.fn(async () => null),
        update: jest.fn(async (args: { data: Record<string, unknown> }) => ({
          ...preferred,
          ...args.data,
        })),
        upsert: jest.fn(),
      },
      activityThirdPartyMapping: { updateMany: jest.fn() },
    };
    const service = createService({
      thirdPartyActivity: { findUnique: jest.fn(async () => preferred) },
      $transaction: jest.fn(async (callback: (client: never) => unknown) =>
        callback(tx as never),
      ),
    } as never);

    await service.project({
      userId: 'user-1',
      sourceObjectId: 'source-1',
      batchJobId: 'batch-1',
      payload: payload('INTERVALS_ICU'),
      preferredThirdPartyActivityId: 7,
    });

    expect(tx.thirdPartyActivity.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({
        externalId: '123#0',
        state: 1,
        rawData: expect.objectContaining({
          importProjection: expect.anything(),
        }),
      }),
    });
  });
});

it('does not overwrite another remote account when one owner has conflicting activity IDs', async () => {
  const tx = {
    $executeRawUnsafe: jest.fn(async () => 1),
    thirdPartyActivity: {
      findUnique: jest.fn(async () => ({
        id: 1,
        userId: 'user',
        externalUserId: 'account-A',
      })),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = createService({
    $transaction: async (fn: any) => fn(tx),
  } as never);
  const input = payload('STRAVA');
  input.source.accountRef = 'account-B';
  await expect(
    service.project({
      userId: 'user',
      sourceObjectId: 'source',
      batchJobId: 'batch',
      payload: input,
    }),
  ).rejects.toThrow('different remote account');
  expect(tx.thirdPartyActivity.upsert).not.toHaveBeenCalled();
  expect(tx.thirdPartyActivity.update).not.toHaveBeenCalled();
});
