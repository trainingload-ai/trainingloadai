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
import {
  Prisma,
  PrismaClient,
  type ActivityRecomputeJob,
} from '@prisma/client';
import { ActivityRecomputeJobService } from '../activity-recompute-job.service';
import { ActivityRecomputeWorkerService } from '@/workers/workers/activity-recompute.worker';

const crypto = require('node:crypto') as typeof import('node:crypto');
const postgres = process.env.CORE_MIGRATION_TEST_POSTGRES_URL
  ? describe
  : describe.skip;
type Scheduler = {
  upsertScheduledJob(
    data: Prisma.ActivityRecomputeJobUncheckedCreateInput,
  ): Promise<{ job: ActivityRecomputeJob }>;
};
const day = (value: number) => new Date(Date.UTC(2026, 0, value));
const input = (from = 10, to = 30, dedupeKey = 'fixture') => ({
  userId: 'owner',
  dedupeKey,
  metricType: 'MHR',
  recomputeFrom: day(from),
  recomputeTo: day(to),
  lookbackDays: 0,
  status: 'SCHEDULED' as const,
  availableAt: new Date(),
  replayCheckpoint: Prisma.DbNull,
  attempts: 0,
  startedAt: null,
  completedAt: null,
});

postgres('recompute scheduling / real PostgreSQL', () => {
  let database: ChildProcess;
  let db: PrismaClient;
  let scheduler: Scheduler;
  beforeAll(async () => {
    database = fork(resolve(__dirname, 'activity-recompute-postgres.mjs'), [], {
      execArgv: [],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const url = await new Promise<string>((done, fail) => {
      database.once('message', (value: { databaseUrl: string }) =>
        done(value.databaseUrl),
      );
      database.once('error', fail);
      database.once('exit', (code) =>
        fail(new Error(`Test PostgreSQL exited: ${code}`)),
      );
    });
    const target = new URL(url);
    target.searchParams.set('connection_limit', '8');
    db = new PrismaClient({ datasourceUrl: target.href });
    await db.$connect();
    await db.t_user.create({
      data: {
        id: 'owner',
        name: 'Fixture',
        email: 'owner@example.invalid',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    scheduler = new ActivityRecomputeJobService(
      db as never,
      {} as never,
      {} as never,
    ) as unknown as Scheduler;
  }, 30_000);
  beforeEach(() => db.activityRecomputeJob.deleteMany());
  afterAll(async () => {
    await db?.$disconnect();
    if (database && database.exitCode === null)
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
  }, 30_000);

  async function waitForBlockedSchedulers(count: number) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const [row] = await db.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database() AND state = 'active'
          AND wait_event_type = 'Lock' AND query LIKE '%t_activity_recompute_job%'
      `;
      if (row.count >= count) return;
      await new Promise((done) => setTimeout(done, 10));
    }
    throw new Error('Schedulers did not reach the expected database lock wait');
  }

  it('deduplicates simultaneous first inserts and keeps the union', async () => {
    await Promise.all([
      scheduler.upsertScheduledJob(input(1, 20)),
      scheduler.upsertScheduledJob(input(5, 30)),
    ]);
    const jobs = await db.activityRecomputeJob.findMany();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      recomputeFrom: day(1),
      recomputeTo: day(30),
      status: 'SCHEDULED',
    });
  });

  it('preserves exact UTC bounds when the database timezone is not UTC', async () => {
    const before = Date.now() - 1000;
    const data = input();
    const { job } = await scheduler.upsertScheduledJob(data);
    expect(job).toMatchObject({
      recomputeFrom: data.recomputeFrom,
      recomputeTo: data.recomputeTo,
      availableAt: data.availableAt,
    });
    expect(job.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(job.createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('makes the actual worker skip an uncommitted scheduler merge, then claim the merged range', async () => {
    await db.activityRecomputeJob.create({ data: input() });
    let ready!: () => void;
    let release!: () => void;
    const merged = new Promise<void>((done) => {
      ready = done;
    });
    const released = new Promise<void>((done) => {
      release = done;
    });
    const held = {
      $transaction: (
        work: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: {
          isolationLevel?: Prisma.TransactionIsolationLevel;
          maxWait?: number;
          timeout?: number;
        },
      ) =>
        db.$transaction(async (tx) => {
          const result = await work(tx);
          ready();
          await released;
          return result;
        }, options),
    };
    const heldScheduler = new ActivityRecomputeJobService(
      held as never,
      {} as never,
      {} as never,
    ) as unknown as Scheduler;
    const worker = new ActivityRecomputeWorkerService(
      db as never,
      {} as never,
      {} as never,
    ) as unknown as {
      claimBatch(
        size: number,
      ): Promise<Array<{ id: string; recomputeFrom: Date; recomputeTo: Date }>>;
    };
    const pending = heldScheduler.upsertScheduledJob(input(1, 31));
    try {
      await Promise.race([merged, pending]);
      expect(await worker.claimBatch(1)).toEqual([]);
    } finally {
      release();
    }
    const { job } = await pending;
    expect(await worker.claimBatch(1)).toEqual([
      expect.objectContaining({
        id: job.id,
        recomputeFrom: day(1),
        recomputeTo: day(31),
      }),
    ]);
  });

  it('rolls back the seeded row when the transaction cannot commit', async () => {
    const error = new Error('fixture commit failure');
    const failing = {
      $transaction: (
        work: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        db.$transaction(async (tx) => {
          await work(tx);
          throw error;
        }),
    };
    const failingScheduler = new ActivityRecomputeJobService(
      failing as never,
      {} as never,
      {} as never,
    ) as unknown as Scheduler;
    await expect(failingScheduler.upsertScheduledJob(input())).rejects.toBe(
      error,
    );
    expect(await db.activityRecomputeJob.count()).toBe(0);
  });

  it('reads the latest range after two schedulers actually wait on the same row', async () => {
    const existing = await db.activityRecomputeJob.create({ data: input() });
    let pending!: Array<Promise<{ job: ActivityRecomputeJob }>>;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM t_activity_recompute_job WHERE id = ${existing.id} FOR UPDATE`;
      pending = [
        scheduler.upsertScheduledJob(input(1, 30)),
        scheduler.upsertScheduledJob(input(5, 31)),
      ];
      await waitForBlockedSchedulers(2);
    });
    await Promise.all(pending);
    expect(
      await db.activityRecomputeJob.findUnique({ where: { id: existing.id } }),
    ).toMatchObject({ recomputeFrom: day(1), recomputeTo: day(31) });
  });

  it('preserves a worker claim made while the scheduler waits and creates a followup', async () => {
    const existing = await db.activityRecomputeJob.create({ data: input() });
    const lease = new Date(Date.now() + 60_000);
    const startedAt = new Date();
    let pending!: Promise<{ job: ActivityRecomputeJob }>;
    await db.$transaction(async (tx) => {
      await tx.activityRecomputeJob.update({
        where: { id: existing.id },
        data: {
          status: 'RUNNING',
          lockToken: 'worker',
          leaseExpiresAt: lease,
          startedAt,
          attempts: 1,
          replayCheckpoint: { cursor: 'saved-progress' },
        },
      });
      pending = scheduler.upsertScheduledJob(input(1, 31));
      await waitForBlockedSchedulers(1);
    });
    const result = await pending;
    expect(
      await db.activityRecomputeJob.findUnique({ where: { id: existing.id } }),
    ).toMatchObject({
      status: 'RUNNING',
      lockToken: 'worker',
      leaseExpiresAt: lease,
      startedAt,
      attempts: 1,
      replayCheckpoint: { cursor: 'saved-progress' },
      recomputeFrom: day(10),
      recomputeTo: day(30),
    });
    expect(result.job).toMatchObject({
      dedupeKey: 'fixture:followup',
      status: 'SCHEDULED',
      recomputeFrom: day(1),
      recomputeTo: day(31),
    });
  });

  it('merges one queued followup without touching either active predecessor', async () => {
    const parent = await db.activityRecomputeJob.create({
      data: { ...input(), status: 'RUNNING', lockToken: 'parent' },
    });
    const child = await db.activityRecomputeJob.create({
      data: {
        ...input(10, 30, 'fixture:followup'),
        status: 'RUNNING',
        lockToken: 'child',
        replayCheckpoint: { cursor: 'child-progress' },
      },
    });
    await Promise.all([
      scheduler.upsertScheduledJob(input(1, 30)),
      scheduler.upsertScheduledJob(input(5, 31)),
    ]);
    expect(await db.activityRecomputeJob.count()).toBe(3);
    expect(
      await db.activityRecomputeJob.findUnique({ where: { id: parent.id } }),
    ).toMatchObject({ status: 'RUNNING', lockToken: 'parent' });
    expect(
      await db.activityRecomputeJob.findUnique({ where: { id: child.id } }),
    ).toMatchObject({
      status: 'RUNNING',
      lockToken: 'child',
      replayCheckpoint: { cursor: 'child-progress' },
    });
    expect(
      await db.activityRecomputeJob.findUnique({
        where: { dedupeKey: 'fixture:followup:followup' },
      }),
    ).toMatchObject({
      status: 'SCHEDULED',
      recomputeFrom: day(1),
      recomputeTo: day(31),
    });
  });

  it('reschedules a completed job with a wider window', async () => {
    const previous = await db.activityRecomputeJob.create({
      data: {
        ...input(),
        status: 'COMPLETED',
        completedAt: new Date(),
        replayCheckpoint: { cursor: 'finished' },
      },
    });
    const result = await scheduler.upsertScheduledJob(input(1, 31));
    expect(result.job).toMatchObject({
      id: previous.id,
      status: 'SCHEDULED',
      recomputeFrom: day(1),
      recomputeTo: day(31),
      replayCheckpoint: null,
      completedAt: null,
    });
  });

  it('propagates unrelated primary-key conflicts instead of swallowing them', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    await db.activityRecomputeJob.create({ data: { ...input(), id } });
    const uuid = jest.spyOn(crypto, 'randomUUID').mockReturnValue(id);
    try {
      await expect(
        scheduler.upsertScheduledJob(input(1, 31, 'different-key')),
      ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23505' } });
      expect(await db.activityRecomputeJob.count()).toBe(1);
    } finally {
      uuid.mockRestore();
    }
  });
});
