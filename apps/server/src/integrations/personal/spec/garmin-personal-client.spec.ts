import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { GarminPersonalClient } from '../../garmin-personal/garmin-personal.client';
import { PersonalConnectionService } from '../personal-connection.service';
import { PersonalProviderError } from '../personal-errors';

afterEach(() => jest.restoreAllMocks());
describe('Garmin personal transport', () => {
  it('exchanges the personal key for raw JWT text without assuming OAuth JSON', async () => {
    const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.signature`;
    const request = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(token));
    const credential = await new GarminPersonalClient().exchange(
      'cn',
      'fixture-only-key',
    );
    expect(credential.token).toBe(token);
    expect(request.mock.calls[0][0].toString()).toBe(
      'https://personal.connectapi.garmin.cn/personalapitoken-service/personal-api/personal-api-key/token',
    );
    expect(request.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: 'ApiKey fixture-only-key' },
    });
  });
  it('does not fall back to another region on authorization failure or leak the body', async () => {
    const request = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('private upstream message', { status: 401 }),
      );
    await expect(
      new GarminPersonalClient().get(
        'cn',
        'fixture-token',
        '/userprofile-service/userprofile/settings',
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_REQUIRED' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('respects 429 and preserves 204 as missing data', async () => {
    const request = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'retry-after': '120' } }),
      );
    const client = new GarminPersonalClient();
    expect(
      await client.get(
        'global',
        'fixture-token',
        '/hrv-service/hrv/2026-10-31',
      ),
    ).toBeNull();
    await expect(
      client.get('global', 'fixture-token', '/hrv-service/hrv/2026-10-31'),
    ).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      retryAfterMs: 120000,
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('refreshes and retries an authorized READ at most once', async () => {
    const prisma = {
      externalProviderConnection: { findUnique: async () => null },
    };
    const service = new PersonalConnectionService(
      prisma as never,
      { model: (client?: any) => (client ?? prisma).externalProviderConnection } as never,
      { preferredTimezone: async () => 'UTC' } as never,
      null!,
      null!,
      null!,
      null!,
    );
    const credential = jest.spyOn(service, 'credential').mockResolvedValue({
      connection: { id: 'c' } as never,
      token: 'fixture-token',
    });
    const work = jest
      .fn<() => Promise<never>>()
      .mockRejectedValue(new PersonalProviderError('PROVIDER_AUTH_REQUIRED'));
    await expect(service.authorized('c', work)).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_REQUIRED',
    });
    expect(work).toHaveBeenCalledTimes(2);
    expect(credential.mock.calls).toEqual([
      ['c'],
      ['c', true, 'fixture-token'],
    ]);
    expect(
      new PersonalProviderError(
        'PROVIDER_AUTH_REQUIRED',
        undefined,
        401,
      ).getStatus(),
    ).toBe(409);
  });
  it('download sends the multi-value zip Accept Garmin needs (single application/zip is 406)', async () => {
    const request = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(new Uint8Array([0x50, 0x4b]), { status: 200 }),
      );
    await new GarminPersonalClient().download(
      'global',
      'fixture-token',
      '12345',
    );
    expect(request.mock.calls[0][0].toString()).toBe(
      'https://personal.connectapi.garmin.com/download-service/files/activity/12345',
    );
    expect(request.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      headers: {
        Authorization: 'Bearer fixture-token',
        Accept:
          'application/zip, application/x-zip-compressed, application/octet-stream',
      },
    });
  });
  it('activities map startTimeLocal into day and pass the full date window', async () => {
    const request = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json([
        {
          activityId: 9,
          activityName: 'Run',
          startTimeLocal: '2026-03-15 07:01:02',
        },
      ]),
    );
    const rows = await new GarminPersonalClient().activities(
      'cn',
      'fixture-token',
      '2026-01-01',
      '2026-09-30',
      0,
    );
    expect(rows).toEqual([{ id: '9', title: 'Run', day: '2026-03-15' }]);
    const url = request.mock.calls[0][0].toString();
    expect(url).toContain('startDate=2026-01-01');
    expect(url).toContain('endDate=2026-09-30');
    expect(url).toContain('start=0');
  });
});
