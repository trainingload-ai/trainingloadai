import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { AthleteStateUpdateQueue } from '../athlete-state-update-queue.service';
import {
  guardAthleteStateWrite,
  withAthleteStateLease,
} from '../athlete-state-execution-context';

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../../packages/prisma/core/migrations/0026_athlete_state_updates/migration.sql',
  ),
  'utf8',
);
const engines = [
  'pglite',
  ...(process.env.ATHLETE_STATE_TEST_POSTGRES_URL ? ['postgres'] : []),
];

for (const engine of engines)
  describe(`durable Athlete State queue (${engine})`, () => {
    let db: any;
    let queue: AthleteStateUpdateQueue;
    let query: (sql: string, params?: unknown[]) => Promise<any>;
    let close: () => Promise<void>;
    beforeAll(async () => {
      if (engine === 'pglite') {
        const artifacts = dirname(require.resolve('@electric-sql/pglite'));
        const pg = new PGlite({
          pgliteWasmModule: await WebAssembly.compile(
            readFileSync(resolve(artifacts, 'pglite.wasm')),
          ),
          initdbWasmModule: await WebAssembly.compile(
            readFileSync(resolve(artifacts, 'initdb.wasm')),
          ),
          fsBundle: new Blob([readFileSync(resolve(artifacts, 'pglite.data'))]),
        });
        query = (sql, params) => pg.query(sql, params);
        const adapter = (client: any): any => ({
          $queryRawUnsafe: async (sql: string, ...params: unknown[]) =>
            (await client.query(sql, params)).rows,
          $executeRawUnsafe: async (sql: string, ...params: unknown[]) =>
            (await client.query(sql, params)).affectedRows,
        });
        db = {
          ...adapter(pg),
          $transaction: (run: any) =>
            pg.transaction((tx: any) => run(adapter(tx))),
        };
        close = () => pg.close();
        await pg.exec(
          `CREATE TYPE enum_setting_category AS ENUM ('AI_REVIEW_MODE'); CREATE TABLE t_user(id TEXT PRIMARY KEY); ${migration}`,
        );
      } else {
        const admin = new Pool({
          connectionString: process.env.ATHLETE_STATE_TEST_POSTGRES_URL,
        });
        const schema = `state_queue_${process.pid}_${Date.now()}`;
        await admin.query(`CREATE SCHEMA "${schema}"`);
        const pg = new Pool({
          connectionString: process.env.ATHLETE_STATE_TEST_POSTGRES_URL,
          options: `-c search_path=${schema}`,
          max: 12,
        });
        query = (sql, params) => pg.query(sql, params);
        const adapter = (client: any): any => ({
          $queryRawUnsafe: async (sql: string, ...params: unknown[]) =>
            (await client.query(sql, params)).rows,
          $executeRawUnsafe: async (sql: string, ...params: unknown[]) =>
            (await client.query(sql, params)).rowCount,
        });
        db = {
          ...adapter(pg),
          $transaction: async (run: any) => {
            const client = await pg.connect();
            try {
              await client.query('BEGIN');
              const value = await run(adapter(client));
              await client.query('COMMIT');
              return value;
            } catch (error) {
              await client.query('ROLLBACK');
              throw error;
            } finally {
              client.release();
            }
          },
        };
        close = async () => {
          await pg.end();
          await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
          await admin.end();
        };
        await pg.query(
          `CREATE TYPE enum_setting_category AS ENUM ('AI_REVIEW_MODE'); CREATE TABLE t_user(id TEXT PRIMARY KEY); ${migration}`,
        );
      }
      queue = new AthleteStateUpdateQueue(db);
      await query("INSERT INTO t_user VALUES ('athlete'), ('other')");
    }, 30_000);
    afterAll(async () => {
      await close?.();
    });
    beforeEach(async () => {
      await query('TRUNCATE t_athlete_state_update');
    });
    const request = (extra = {}) =>
      queue.requestUpdate({
        userId: 'athlete',
        triggerType: 'HEALTH_FACT_CHANGED',
        ...extra,
      });
    const ready = () =>
      query(
        "UPDATE t_athlete_state_update SET available_at = now() - interval '1 second'",
      );

    it('coalesces across providers without extending the first 20-minute window', async () => {
      const first = await request({ triggerRef: 'provider-a' });
      const second = await request({ triggerRef: 'provider-b' });
      expect(second.available_at).toEqual(first.available_at);
      expect(second.available_at!.getTime() - Date.now()).toBeGreaterThan(
        1_190_000,
      );
      expect(second.pending_triggers).toHaveLength(2);
      expect(second.requested_version).toBe(2);
      expect(await queue.claim()).toBeNull();
    });
    it('promotes the same task and grants only one concurrent lease', async () => {
      await request();
      await request({ mode: 'immediate' });
      const results = await Promise.all(
        Array.from({ length: 8 }, () => queue.claim('athlete')),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(results.find(Boolean)!.running_version).toBe(2);
    });
    it('retains changes arriving during execution and keeps their ordinary window', async () => {
      await request({ mode: 'immediate' });
      const job = (await queue.claim())!;
      const next = await request({ triggerType: 'FITNESS_FACT_CHANGED' });
      const done = await queue.finish(job);
      expect(done.status).toBe('PENDING');
      expect(done.completed_version).toBe(1);
      expect(done.requested_version).toBe(2);
      expect(done.available_at).toEqual(next.next_available_at);
      expect(await queue.claim()).toBeNull();
      await ready();
      expect((await queue.claim())!.running_version).toBe(2);
    });
    it('follows urgent changes immediately without stealing an active lease', async () => {
      await request({ mode: 'immediate' });
      const job = (await queue.claim())!;
      await request({
        mode: 'immediate',
        preserveCaseId: 'case',
        explicit: true,
      });
      expect(await queue.claim()).toBeNull();
      await queue.finish(job);
      const next = (await queue.claim())!;
      expect(next.running_triggers[0].preserveCaseId).toBe('case');
    });
    it('rolls back a request together with its fact transaction', async () => {
      await expect(
        db.$transaction(async (tx: any) => {
          await requestIn(tx);
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(
        (await query('SELECT * FROM t_athlete_state_update')).rows,
      ).toHaveLength(0);
    });
    async function requestIn(tx: any) {
      return queue.requestUpdate(
        { userId: 'athlete', triggerType: 'FACT' },
        tx,
      );
    }
    it('recovers an expired lease and fences the old executor writes and completion', async () => {
      await request({ mode: 'immediate' });
      const old = (await queue.claim())!;
      await query(
        "UPDATE t_athlete_state_update SET lease_expires_at = now() - interval '1 second'",
      );
      const recovered = (await queue.claim())!;
      expect(recovered.lease_token).not.toBe(old.lease_token);
      expect(recovered.running_triggers).toEqual(old.running_triggers);
      await expect(queue.finish(old)).rejects.toThrow('LEASE_LOST');
      await expect(
        withAthleteStateLease(old, () =>
          db.$transaction((tx: any) => guardAthleteStateWrite(tx)),
        ),
      ).rejects.toThrow('LEASE_LOST');
      await withAthleteStateLease(recovered, () =>
        db.$transaction((tx: any) => guardAthleteStateWrite(tx)),
      );
      await queue.finish(recovered);
    });
    it('backs off failures, preserves context, and revives a dead task on new facts', async () => {
      await request({ mode: 'immediate', preserveCaseId: 'case' });
      const job = (await queue.claim())!;
      await queue.fail(job, 'ASSESSMENT_FAILED');
      expect(await queue.claim()).toBeNull();
      const row = (await query('SELECT * FROM t_athlete_state_update')).rows[0];
      expect(row.status).toBe('RETRY_WAIT');
      expect(row.pending_triggers[0].preserveCaseId).toBe('case');
      await query(
        "UPDATE t_athlete_state_update SET status = 'DEAD', attempts = 8",
      );
      const revived = await request();
      expect(revived.status).toBe('PENDING');
      expect(revived.attempts).toBe(0);
    });
    it('keeps different users independent and makes a committed request recoverable without a signal', async () => {
      await request({ mode: 'immediate' });
      await queue.requestUpdate({
        userId: 'other',
        triggerType: 'FACT',
        mode: 'immediate',
      });
      const restarted = new AthleteStateUpdateQueue(db);
      const jobs = await Promise.all([queue.claim(), restarted.claim()]);
      expect(new Set(jobs.map((job) => job?.user_id)).size).toBe(2);
    });
  });
