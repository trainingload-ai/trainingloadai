import {
  IntervalsIcuApiError,
  IntervalsIcuClient,
} from '../intervals-icu.client';

describe('IntervalsIcuClient event verification', () => {
  const client = new IntervalsIcuClient({ get: () => undefined } as never);
  afterEach(() => jest.restoreAllMocks());

  it('reads an event by identity without restricting its calendar date', async () => {
    const fetcher = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 123, name: 'Moved' })),
      );
    await expect(client.getEvent('test-key', '123')).resolves.toMatchObject({
      id: 123,
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://intervals.icu/api/v1/athlete/0/events/123',
      expect.anything(),
    );
  });

  it('deletes exactly one event and explicitly disables deleting other events', async () => {
    const fetcher = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    await client.deleteEvent('test-key', '123');
    expect(fetcher).toHaveBeenCalledWith(
      'https://intervals.icu/api/v1/athlete/0/events/123?others=false',
      expect.objectContaining({ method: 'DELETE', body: undefined }),
    );
  });

  it.each([401, 403, 404, 503])(
    'preserves HTTP %s as a typed API failure',
    async (status) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('upstream failure', { status }));
      await expect(client.getEvent('test-key', '123')).rejects.toMatchObject({
        status,
        name: 'IntervalsIcuApiError',
      });
      await expect(
        client.deleteEvent('test-key', '123'),
      ).rejects.toBeInstanceOf(IntervalsIcuApiError);
    },
  );
});
