import {
  IntervalsIcuApiError,
  IntervalsIcuClient,
} from '../intervals-icu.client';

describe('IntervalsIcuClient event verification', () => {
  const client = new IntervalsIcuClient({ get: () => undefined } as never);
  afterEach(() => jest.restoreAllMocks());

  it('downloads the edited FIT and never silently falls back to the original file', async () => {
    const fetcher = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('edited-fit'));
    expect(
      (
        await client.downloadActivityFile('test-key', '123', {
          preferEdited: true,
        })
      ).endpoint,
    ).toBe('fit-file');
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://intervals.icu/api/v1/activity/123/fit-file',
    );
    fetcher.mockClear();
    fetcher.mockResolvedValue(new Response('not ready', { status: 503 }));
    await expect(
      client.downloadActivityFile('test-key', '123', { preferEdited: true }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

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
