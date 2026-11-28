import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ReviewCronService } from '../review-cron.service';

const native = Boolean(process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN);

(native ? describe : describe.skip)('ReviewCronService timezone selection / PostgreSQL', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;

  beforeAll(async () => {
    database = fork(resolve(__dirname, '../../api/plan/spec/plan-sync-native-postgres.mjs'), [], {
      execArgv: [],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const server = await new Promise<{ address: string }>((done, reject) => {
      database.once('message', done);
      database.once('error', reject);
      database.once('exit', (code) => reject(new Error(`Test database exited: ${code}`)));
    });
    prisma = new PrismaClient({
      datasourceUrl: `postgresql://postgres:postgres@${server.address}/postgres?sslmode=disable`,
    });
    await prisma.$connect();
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (database?.exitCode === null) {
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
    }
  });

  it('selects effective timezone history and handles fixed offsets and invalid settings', async () => {
    await prisma.$executeRaw`INSERT INTO t_user (id) VALUES ('history'), ('offset'), ('invalid')`;
    await prisma.userBodyMetric.createMany({
      data: [
        { userId: 'history', value: 'America/New_York', effectiveDate: new Date('2026-02-01'), createdAt: new Date('2026-02-01') },
        { userId: 'history', value: 'Asia/Shanghai', effectiveDate: new Date('2026-01-01'), createdAt: new Date('2026-03-01') },
        { userId: 'offset', value: '+05:30', effectiveDate: new Date('2026-01-01') },
        { userId: 'invalid', value: 'invalid/timezone', effectiveDate: new Date('2026-01-01') },
      ].map((entry) => ({ ...entry, type: 'TIMEZONE' })),
    });
    const cron = new ReviewCronService(prisma as never, {} as never);
    const cte = cron['enqueueCteSql']({ type: 'DAILY', extraDueWhereSql: '' });
    const records = await prisma.$queryRawUnsafe<Array<{ user_id: string; local_hour: number; local_minute: number }>>(`
      ${cte}
      SELECT user_id,
             EXTRACT(HOUR FROM ('2026-07-01 03:00:00Z'::timestamptz AT TIME ZONE timezone))::int AS local_hour,
             EXTRACT(MINUTE FROM ('2026-07-01 03:00:00Z'::timestamptz AT TIME ZONE timezone))::int AS local_minute
      FROM expanded ORDER BY user_id
    `);
    expect(records).toEqual([
      { user_id: 'history', local_hour: 23, local_minute: 0 },
      { user_id: 'invalid', local_hour: 3, local_minute: 0 },
      { user_id: 'offset', local_hour: 8, local_minute: 30 },
    ]);
  });
});
