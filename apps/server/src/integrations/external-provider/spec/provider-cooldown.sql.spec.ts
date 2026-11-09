import { execFileSync } from 'node:child_process';
import { ExternalProviderWebhookInboxService } from '../external-provider-webhook-inbox.service';

describe('durable response-driven provider cooldown SQL', () => {
  it('survives an empty queue, extends monotonically and never becomes runnable', async () => {
    const writes: any[] = [],
      claims: any[] = [];
    const service = new ExternalProviderWebhookInboxService({
      $executeRaw: async (q: any) => {
        writes.push({ text: q.text, values: q.values });
        return 0;
      },
      $queryRawUnsafe: async (text: string, ...values: unknown[]) => {
        claims.push({ text, values });
        return [];
      },
    } as never);
    const until = new Date(Date.now() + 120000);
    const args = {
      provider: 'garmin' as const,
      until,
      scopeKey: 'app:test',
      eventTypes: ['activityFiles'],
    };
    await service.pausePending(args);
    await service.pausePending({
      ...args,
      until: new Date(until.getTime() - 60000),
    });
    await service.claim('garmin');
    await service.pausePending(args);
    await service.claim('coros');
    // PGlite uses dynamic imports; execute the real captured SQL outside Jest's VM.
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        `
      const {PGlite}=require(process.argv[1]);
      (async()=>{
        const {writes,claims}=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
        const db=await PGlite.create();
        try {
          await db.exec(\`CREATE TYPE enum_third_party_provider AS ENUM ('garmin','coros');
            CREATE TABLE t_external_provider_webhook_event (
              id text PRIMARY KEY,provider enum_third_party_provider NOT NULL,event_type text NOT NULL,
              external_user_id text,dedupe_key text NOT NULL,raw_checksum text NOT NULL,payload jsonb NOT NULL,
              status text NOT NULL DEFAULT 'PENDING',attempts int NOT NULL DEFAULT 0,
              available_at timestamp NOT NULL DEFAULT NOW(),locked_at timestamp,processed_at timestamp,
              last_error text,received_at timestamp NOT NULL DEFAULT NOW(),updated_at timestamp NOT NULL DEFAULT NOW(),
              UNIQUE(provider,dedupe_key));\`);
          for(const q of writes.slice(0,2)) await db.query(q.text,q.values);
          const marker=(await db.query('SELECT * FROM t_external_provider_webhook_event')).rows;
          const empty=(await db.query(claims[0].text,claims[0].values)).rows;
          await db.exec(\`INSERT INTO t_external_provider_webhook_event (id,provider,event_type,dedupe_key,raw_checksum,payload)
            VALUES ('g','garmin','activityFiles','g','x','{}'),('c','coros','activityFiles','c','x','{}');\`);
          await db.query(writes[2].text,writes[2].values);
          const paused=(await db.query(claims[0].text,claims[0].values)).rows;
          const coros=(await db.query(claims[1].text,claims[1].values)).rows;
          process.stdout.write(JSON.stringify({marker,empty,paused,coros}));
        } finally {await db.close();}
      })().catch(e=>{console.error(e);process.exitCode=1;});
    `,
        require.resolve('@electric-sql/pglite'),
      ],
      {
        input: JSON.stringify({ writes, claims }),
        encoding: 'utf8',
        env: { ...process.env, TZ: 'UTC' },
        timeout: 20000,
      },
    );
    const { marker, empty, paused, coros } = JSON.parse(output);
    expect(marker).toHaveLength(1);
    expect(marker[0]).toMatchObject({
      event_type: 'provider_cooldown',
      status: 'DONE',
      last_error: 'PROVIDER_RATE_LIMITED',
    });
    expect(new Date(marker[0].available_at).getTime()).toBe(until.getTime());
    expect(empty).toEqual([]);
    expect(paused).toEqual([]);
    expect(coros.map((row: any) => row.id)).toEqual(['c']);
  }, 25000);
});
