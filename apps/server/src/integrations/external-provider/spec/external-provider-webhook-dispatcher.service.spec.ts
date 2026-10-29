import { describe, expect, it, jest } from '@jest/globals';
import { ExternalProviderWebhookDispatcherService } from '../external-provider-webhook-dispatcher.service';
import type { ExternalProviderWebhookInboxEvent } from '../external-provider-webhook-inbox.service';

describe('ExternalProviderWebhookDispatcherService', () => {
  function createService() {
    const inbox = {
      claim: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
      countOutstanding: jest.fn(async () => 0),
      markDone: jest.fn(async () => ({})),
      markIgnored: jest.fn(async () => ({})),
      markFailed: jest.fn(async () => ({})),
    };
    const service = new ExternalProviderWebhookDispatcherService(
      {
        get: jest.fn((key: string) => {
          if (key === 'thirdPartyWebhookWorker.batchSize') return 10;
          if (key === 'thirdPartyWebhookWorker.maxAttempts') return 8;
          return undefined;
        }),
      } as never,
      inbox as never,
      { subscribe: jest.fn() } as never,
    );
    return { inbox, service };
  }

  it('owns DONE and IGNORED transitions for provider adapters', async () => {
    const { inbox, service } = createService();
    inbox.claim.mockResolvedValue([
      {
        id: 'event-1',
        event_type: 'handled',
        external_user_id: 'athlete-1',
        attempts: 1,
        payload: {},
      },
      {
        id: 'event-2',
        event_type: 'ignored',
        external_user_id: 'athlete-1',
        attempts: 1,
        payload: {},
      },
    ]);
    service.register<Record<string, never>>({
      provider: 'intervals_icu',
      label: 'Intervals.icu',
      process: jest.fn(
        async (
          event: ExternalProviderWebhookInboxEvent<Record<string, never>>,
        ) => (event.event_type === 'ignored' ? 'IGNORED' : 'DONE'),
      ),
    });

    await service.drainAll();

    expect(inbox.markDone).toHaveBeenCalledWith('event-1');
    expect(inbox.markIgnored).toHaveBeenCalledWith('event-2');
  });

  it('owns retry transitions when a provider adapter throws', async () => {
    const { inbox, service } = createService();
    inbox.claim.mockResolvedValue([
      {
        id: 'event-3',
        event_type: 'failed',
        external_user_id: 'athlete-1',
        attempts: 2,
        payload: {},
      },
    ]);
    service.register<Record<string, never>>({
      provider: 'wahoo',
      label: 'Wahoo',
      process: jest.fn(async () => {
        throw new Error('provider failed');
      }),
    });

    await service.drainAll();

    expect(inbox.markFailed).toHaveBeenCalledWith({
      id: 'event-3',
      attempts: 2,
      maxAttempts: 8,
      error: expect.objectContaining({ message: 'provider failed' }),
    });
  });
});
