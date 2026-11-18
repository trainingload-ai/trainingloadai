import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { IntervalsIcuScheduledSyncTask } from '../intervals-icu-scheduled-sync.task';

describe('Intervals.icu scheduler local-day eligibility (PostgreSQL)', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;
  const context = { startHourLocal: 0, staleStartedMinutes: 0, batchSize: 20 };

  beforeAll(async () => {
    database = fork(
      resolve(__dirname, 'intervals-scheduler-postgres.mjs'),
      [],
      {
        execArgv: [],
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      },
    );
    const address = await new Promise<string>((resolveAddress, reject) => {
      database.once('message', (value: { address: string }) =>
        resolveAddress(value.address),
      );
      database.once('error', reject);
      database.once('exit', (code) =>
        reject(new Error(`Test database exited: ${code}`)),
      );
    });
    prisma = new PrismaClient({
      datasourceUrl: `postgresql://postgres:postgres@${address}/postgres?connection_limit=1&sslmode=disable`,
    });
    await prisma.$connect();
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (database && database.exitCode === null) {
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
    }
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM t_user');
  });

  async function connectAthlete(timezone: string) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO t_user(id) VALUES ($1)`,
      timezone,
    );
    await prisma.userBodyMetric.create({
      data: { userId: timezone, type: 'TIMEZONE', value: timezone },
    });
    return prisma.externalProviderConnection.create({
      data: {
        userId: timezone,
        provider: 'intervals_icu',
        credentialCiphertext: 'test-fixture',
        syncWellness: true,
      },
    });
  }

  it('does not re-claim a sync completed today across UTC, eastern and western timezones', async () => {
    for (const zone of [
      'UTC',
      'Asia/Shanghai',
      'Australia/Sydney',
      'America/Los_Angeles',
      'Pacific/Kiritimati',
      'Etc/GMT+12',
      'Invalid/Timezone',
    ]) {
      await connectAthlete(zone);
    }
    await prisma.$executeRawUnsafe(`UPDATE t_external_provider_connection
      SET last_sync_completed_at = NOW() AT TIME ZONE 'UTC'`);
    const syncConnectionLatest = jest.fn(async () => ({}));
    const service = new IntervalsIcuScheduledSyncTask(
      prisma as never,
      { syncConnectionLatest } as never,
    );
    await service.run(context);
    expect(syncConnectionLatest).not.toHaveBeenCalled();
  });

  it('claims an older sync once, then stops claiming it after successful completion', async () => {
    const connection = await connectAthlete('Pacific/Kiritimati');
    await prisma.$executeRawUnsafe(`UPDATE t_external_provider_connection
      SET last_sync_completed_at = (NOW() AT TIME ZONE 'UTC') - INTERVAL '3 days'`);
    const syncConnectionLatest = jest.fn(async () => {
      await prisma.$executeRawUnsafe(
        `UPDATE t_external_provider_connection
        SET last_sync_completed_at = NOW() AT TIME ZONE 'UTC' WHERE id=$1`,
        connection.id,
      );
      return { totalFetched: 0, queuedCount: 0 };
    });
    const service = new IntervalsIcuScheduledSyncTask(
      prisma as never,
      { syncConnectionLatest } as never,
    );
    await service.run(context);
    await service.run(context);
    expect(syncConnectionLatest).toHaveBeenCalledTimes(1);
  });
});
