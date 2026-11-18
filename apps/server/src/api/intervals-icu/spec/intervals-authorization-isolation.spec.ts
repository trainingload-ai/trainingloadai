import { ConfigService } from '@nestjs/config';
import { isMatch } from 'lodash';
import { IntervalsIcuWebhookService } from '../intervals-icu-webhook.service';
import { intervalsAuthorization } from '@/integrations/intervals-icu/intervals-icu-authorization';

function fixture() {
  let connection: any = {
    id: 'connection-A',
    userId: 'user-A',
    provider: 'intervals_icu',
    status: 'ACTIVE',
    externalAthleteId: 'i123',
    syncScheduledActivities: true,
    credentialFingerprint: 'key-A',
    metadata: { authorizationRevision: 'grant-A' },
  };
  let queued: any;
  const model = {
    findFirst: jest.fn(async ({ where }: any) => {
      if (!connection) return null;
      const { externalAthleteId, ...identity } = where;
      return isMatch(connection, identity) &&
        (!externalAthleteId ||
          externalAthleteId.in.includes(connection.externalAthleteId))
        ? connection
        : null;
    }),
  };
  const lifecycle = { deactivateProviderData: jest.fn(async () => ({})) };
  const service = new IntervalsIcuWebhookService(
    new ConfigService({ intervalsIcu: { webhook: { secret: 'fixture' } } }),
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {
      checksum: (s: string) => s,
      enqueue: async (args: any) => {
        queued = args;
        return { enqueued: true };
      },
    } as any,
    { model: () => model } as any,
    lifecycle as any,
  );
  const enqueue = () =>
    service.enqueue({
      secret: 'fixture',
      events: [
        {
          type: 'ACTIVITY_DELETED',
          athlete_id: 'i123',
          activity: { id: 'activity' },
        },
      ],
    });
  return {
    service,
    lifecycle,
    enqueue,
    get queued() {
      return queued;
    },
    get connection() {
      return connection;
    },
    set connection(v) {
      connection = v;
    },
  };
}
describe('Intervals webhook authorization isolation', () => {
  it('processes an unchanged grant', async () => {
    const f = fixture();
    await f.enqueue();
    expect(await f.service.processEvent(f.queued.payload)).toBe('DONE');
    expect(f.lifecycle.deactivateProviderData).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-A' }),
    );
  });
  it.each([
    'new-user',
    'new-account',
    'same-account-new-grant',
    'revoked',
    'missing-context',
  ])('rejects a stale event: %s', async (change) => {
    const f = fixture();
    await f.enqueue();
    if (change === 'new-user')
      f.connection = { ...f.connection, id: 'connection-B', userId: 'user-B' };
    if (change === 'new-account') f.connection.externalAthleteId = 'i456';
    if (change === 'same-account-new-grant')
      f.connection.metadata.authorizationRevision = 'grant-B';
    if (change === 'revoked') f.connection.status = 'REVOKED';
    if (change === 'missing-context') delete f.queued.payload.authorization;
    expect(await f.service.processEvent(f.queued.payload)).toBe('IGNORED');
    expect(f.lifecycle.deactivateProviderData).not.toHaveBeenCalled();
  });
  it('does not assign an unbound event to a subsequent connection', async () => {
    const f = fixture(),
      connection = f.connection;
    f.connection = null;
    await f.enqueue();
    f.connection = connection;
    expect(await f.service.processEvent(f.queued.payload)).toBe('IGNORED');
  });
  it('scopes deduplication to the grant', async () => {
    const f = fixture();
    await f.enqueue();
    const first = f.queued.dedupeKey;
    f.connection.metadata.authorizationRevision = 'grant-B';
    await f.enqueue();
    expect(f.queued.dedupeKey).not.toBe(first);
  });
  it('does not trust a remote-supplied authorization', async () => {
    const f = fixture();
    await f.service.enqueue({
      secret: 'fixture',
      events: [
        {
          type: 'ACTIVITY_DELETED',
          athlete_id: 'i123',
          activity: { id: 'activity' },
          authorization: { userId: 'attacker' },
        },
      ],
    });
    expect(f.queued.payload.authorization).toEqual(
      intervalsAuthorization(f.connection),
    );
  });
  it('supports a legacy connection without a stored fingerprint while fencing its original encrypted credential', async () => {
    const f = fixture();
    f.connection.metadata = {};
    f.connection.credentialFingerprint = null;
    f.connection.credentialCiphertext = 'sealed-key-A';
    await f.enqueue();
    expect(await f.service.processEvent(f.queued.payload)).toBe('DONE');
    f.lifecycle.deactivateProviderData.mockClear();
    f.connection.credentialCiphertext = 'sealed-key-B';
    expect(await f.service.processEvent(f.queued.payload)).toBe('IGNORED');
    expect(f.lifecycle.deactivateProviderData).not.toHaveBeenCalled();
  });
});
