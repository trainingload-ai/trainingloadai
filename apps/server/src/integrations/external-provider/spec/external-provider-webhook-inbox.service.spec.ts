import { describe, expect, it, jest } from '@jest/globals';
import { ExternalProviderWebhookInboxService } from '../external-provider-webhook-inbox.service';

describe('ExternalProviderWebhookInboxService', () => {
  it('uses provider + dedupe key as the durable identity', async () => {
    const createMany = jest.fn(async () => ({ count: 1 }));
    const notify = jest.fn();
    const service = new ExternalProviderWebhookInboxService(
      {
        externalProviderWebhookEvent: { createMany },
      } as never,
      { notify } as never,
    );
    const result = await service.enqueue({
      provider: 'wahoo',
      eventType: 'workout_summary',
      externalUserId: 'athlete-1',
      dedupeKey: 'workout_summary:1',
      payload: { id: 1 },
    });
    expect(result).toMatchObject({
      enqueued: true,
      eventId: expect.any(String),
    });
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: result.eventId,
            status: 'PENDING',
            rawChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        ],
        skipDuplicates: true,
      }),
    );
    expect(notify).toHaveBeenCalledWith('wahoo');
  });

  it('returns an existing id without waking the dispatcher for duplicates', async () => {
    const notify = jest.fn();
    const service = new ExternalProviderWebhookInboxService(
      {
        externalProviderWebhookEvent: {
          createMany: jest.fn(async () => ({ count: 0 })),
          findUnique: jest.fn(async () => ({ id: 'event-existing' })),
        },
      } as never,
      { notify } as never,
    );

    await expect(
      service.enqueue({
        provider: 'intervals_icu',
        eventType: 'ACTIVITY_UPLOADED',
        dedupeKey: 'activity:1',
        payload: { id: 1 },
      }),
    ).resolves.toEqual({
      accepted: true,
      enqueued: false,
      eventId: 'event-existing',
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('moves terminal and retry states through one implementation', async () => {
    const update = jest.fn(async (args: { data: unknown }) => args.data);
    const service = new ExternalProviderWebhookInboxService({
      externalProviderWebhookEvent: { update },
    } as never);
    await service.markDone('event-1');
    await service.markIgnored('event-2');
    await service.markFailed({
      id: 'event-3',
      attempts: 8,
      error: new Error('failed'),
    });
    expect(update).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DEAD',
          lastError: 'failed',
        }),
      }),
    );
  });

  it('reclaims stale processing rows after a worker crash', async () => {
    const query = jest.fn<(...args: unknown[]) => Promise<unknown[]>>(
      async () => [],
    );
    const service = new ExternalProviderWebhookInboxService({
      $queryRawUnsafe: query,
    } as never);

    await service.claim('suunto', { staleAfterMs: 120_000 });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'PROCESSING'"),
      'suunto',
      8,
      10,
      120,
    );
    expect(query.mock.calls[0]?.[0]).toContain('locked_at <=');
  });
});
