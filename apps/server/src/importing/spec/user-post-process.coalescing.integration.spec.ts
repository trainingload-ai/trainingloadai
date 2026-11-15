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
import { Prisma, PrismaClient } from '@prisma/client';
import { ImportingJobRepository } from '../persistence/importing-job.repository';
import { ImportingJobService } from '../importing-job.service';
import { ImportBatchService } from '../import-batch.service';
import { ImportItemWorkerService } from '../import-item.worker';
import { UserPostProcessWorkerService } from '../user-post-process.worker';
import { FitnessEvidenceRevisionDriftError } from '@/analyze/chronological-activity-replay.service';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { NotificationRepository } from '@/notification/persistence/notification.repository';

jest.mock('@/api/activity/activity.service', () => ({
  ActivityService: class {},
}));

type Claimed = {
  id: string;
  userId: string;
  batchJobId: string;
  lockToken: string;
};
type Scheduler = {
  claimBatch(limit: number, now?: Date): Promise<Claimed[]>;
  processJob(job: Claimed): Promise<void>;
};
type ItemCompletion = {
  activeLeaseTokens: Map<string, string>;
  completeActivityItem(jobId: string, batchJobId: string): Promise<void>;
};
const at = (time: Date, delta: number) => new Date(time.getTime() + delta);
const trainingTime = (day: number) => new Date(Date.UTC(2025, 0, day));
const realPostgres = Boolean(process.env.CORE_MIGRATION_TEST_POSTGRES_URL);
const concurrent = realPostgres ? it : it.skip;

describe('durable user post-process coalescing', () => {
  let database: ChildProcess;
  let db: PrismaClient;
  let jobs: ImportingJobService;
  let batches: ImportBatchService;
  let sequence = 0;
  const translate = { t: (key: string) => key };
  const users = { getPreferredLocale: async () => 'en' };

  beforeAll(async () => {
    database = fork(
      resolve(
        __dirname,
        realPostgres
          ? '../../analyze/spec/activity-recompute-postgres.mjs'
          : '../../api/ai/core/spec/coach-run-postgres.mjs',
      ),
      [],
      {
        execArgv: [],
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      },
    );
    const address = await new Promise<string>((done, fail) => {
      database.once(
        'message',
        (value: { address?: string; databaseUrl?: string }) =>
          done(
            value.databaseUrl ??
              `postgresql://postgres:postgres@${value.address}/postgres?sslmode=disable`,
          ),
      );
      database.once('error', fail);
      database.once('exit', (code) =>
        fail(new Error(`Test database exited: ${code}`)),
      );
    });
    const url = new URL(address);
    url.searchParams.set('connection_limit', realPostgres ? '8' : '1');
    db = new PrismaClient({ datasourceUrl: url.href });
    await db.$connect();
    // This isolated domain fixture also covers Managed's multiple athletes.
    await db.$executeRawUnsafe('DROP INDEX IF EXISTS t_user_single_owner_key');
    // The shared PGLite helper adds convenience defaults. Restore the migrated
    // identity requirements so both database modes exercise the same fixture.
    await db.$executeRaw`ALTER TABLE t_user
      ALTER COLUMN name DROP DEFAULT,
      ALTER COLUMN email DROP DEFAULT,
      ALTER COLUMN email_verified DROP DEFAULT,
      ALTER COLUMN created_at DROP DEFAULT,
      ALTER COLUMN updated_at DROP DEFAULT`;
    jobs = new ImportingJobService(new ImportingJobRepository(db as never));
    batches = new ImportBatchService(
      db as never,
      {} as never,
      translate as never,
      jobs,
      {} as never,
      {} as never,
    );
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (database && database.exitCode === null) {
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
    }
  });

  beforeEach(async () => {
    await db.$executeRaw`DELETE FROM t_user`;
    const now = new Date();
    await db.t_user.createMany({
      data: ['athlete-a', 'athlete-b'].map((id) => ({
        id,
        name: 'Synthetic athlete',
        email: `${id}@example.invalid`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })),
    });
  });

  async function seed(args: {
    user?: string;
    createdAt: Date;
    from?: Date;
    pendingItem?: boolean;
    checkpoint?: Prisma.InputJsonValue;
  }) {
    const suffix = ++sequence;
    const userId = args.user ?? 'athlete-a';
    const batch = await db.importBatchJob.create({
      data: {
        userId,
        sourceKind: 'FILE',
        totalCount: 1,
        successCount: args.pendingItem ? 0 : 1,
        status: args.pendingItem ? 'RUNNING' : 'POST_PROCESSING',
        requestContext: { suppressAthleteStateReassessment: true },
      },
    });
    const activity = await db.activity.create({
      data: {
        userId,
        hashId: `coalescing-activity-${suffix}`,
        sportType: 'RUN',
        startTime: args.from ?? trainingTime(20),
        processingStatus: 'ANALYZING',
        createdByBatchJobId: batch.id,
      },
    });
    const source = await db.importSourceObject.create({
      data: {
        userId,
        sourceKind: 'FILE',
        sourceUid: `coalescing-source-${suffix}`,
      },
    });
    const item = await db.importItemJob.create({
      data: {
        batchJobId: batch.id,
        userId,
        sourceObjectId: source.id,
        activityId: activity.id,
        sourceKind: 'FILE',
        sourceUid: source.sourceUid,
        status: args.pendingItem ? 'ANALYZING' : 'DONE',
        lockToken: args.pendingItem ? 'item-owner' : null,
      },
    });
    const post = args.pendingItem
      ? null
      : await db.userPostProcessJob.create({
          data: {
            userId,
            batchJobId: batch.id,
            createdAt: args.createdAt,
            availableAt: at(new Date(), -60_000),
            recomputeFrom: activity.startTime,
            recomputeTo: activity.startTime,
            replayCheckpoint: args.checkpoint ?? Prisma.DbNull,
          },
        });
    return { batch, activity, item, post };
  }

  function scheduler(
    replay = jest.fn(async (_request: Record<string, unknown>) => ({
      runId: 'synthetic-run',
      completed: true,
      nextCheckpoint: null,
    })),
  ) {
    const runBatchAiReviewWhenAllowed = jest.fn(async () => undefined);
    const runBatchThirdPartyExports = jest.fn(async () => ({
      failedProviders: [],
      failedCount: 0,
    }));
    const service = new UserPostProcessWorkerService(
      db as never,
      { get: () => undefined } as never,
      { replay } as never,
      { emitAsync: async () => [] } as never,
      new NotificationDomainService(new NotificationRepository(db as never)),
      {} as never,
      {} as never,
      translate as never,
      users as never,
      jobs,
      {} as never,
    );
    Object.assign(service, {
      runBatchAiReviewWhenAllowed,
      runBatchThirdPartyExports,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    return {
      service,
      worker: service as unknown as Scheduler,
      replay,
      runBatchAiReviewWhenAllowed,
      runBatchThirdPartyExports,
    };
  }

  function completion() {
    const service = new ImportItemWorkerService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      batches,
      {} as never,
      {} as never,
      undefined,
      jobs,
      {} as never,
      {} as never,
    );
    return service as unknown as ItemCompletion;
  }

  it.each(['UTC', 'Asia/Shanghai', 'America/Los_Angeles'])(
    'waits for quiet and unfinished imports in database timezone %s',
    async (timezone) => {
      await db.$executeRawUnsafe(`SET TIME ZONE '${timezone}'`);
      const now = new Date();
      const first = await seed({ createdAt: now });
      const incoming = await seed({
        createdAt: at(now, 2_000),
        pendingItem: true,
        from: trainingTime(10),
      });
      const { worker } = scheduler();
      expect(await worker.claimBatch(5, at(now, 1_000))).toEqual([]);
      expect(await worker.claimBatch(5, at(now, 4_000))).toEqual([]);
      const done = completion();
      done.activeLeaseTokens.set(incoming.item.id, 'item-owner');
      await done.completeActivityItem(incoming.item.id, incoming.batch.id);
      const enqueued = await db.userPostProcessJob.findUniqueOrThrow({
        where: { batchJobId: incoming.batch.id },
      });
      expect(Math.abs(enqueued.createdAt.getTime() - Date.now())).toBeLessThan(
        3_000,
      );
      // Simulate the committed second request arriving three seconds later.
      await db.userPostProcessJob.update({
        where: { batchJobId: incoming.batch.id },
        data: { createdAt: at(now, 3_000) },
      });
      expect(await worker.claimBatch(5, at(now, 5_000))).toEqual([]);
      const claimed = await worker.claimBatch(5, at(now, 6_001));
      expect(claimed.map((job) => job.id)).toEqual([first.post!.id]);
    },
  );

  it('caps waiting despite continuous input and does not delay another user', async () => {
    const now = new Date();
    const first = await seed({ createdAt: now });
    await seed({ createdAt: at(now, 14_000) });
    await seed({ createdAt: now, pendingItem: true });
    const other = await seed({
      createdAt: at(now, -20_000),
      user: 'athlete-b',
    });
    const { worker } = scheduler();
    const early = await worker.claimBatch(5, at(now, 1_000));
    expect(early.map((job) => job.id)).toEqual([other.post!.id]);
    const bounded = await worker.claimBatch(5, at(now, 15_001));
    expect(bounded.map((job) => job.id)).toEqual([first.post!.id]);
    expect(await worker.claimBatch(5, at(now, 20_000))).toEqual([]);
  });

  it.each([
    { nextEffectiveFrom: '2025-01-10T00:00:00.000Z' },
    { pendingPmcRecomputeFrom: '2025-01-10T00:00:00.000Z' },
    { replaySatisfiedThrough: '2025-01-21T00:00:00.000Z' },
  ])(
    'resumes checkpoint work without another coalescing delay: %j',
    async (checkpoint) => {
      const now = new Date();
      // An older fresh request must not hold up an existing replay cursor.
      await seed({ createdAt: at(now, -1_000) });
      const resumed = await seed({ createdAt: now, checkpoint });
      await seed({ createdAt: now, pendingItem: true });
      const { worker } = scheduler();
      expect(
        (await worker.claimBatch(5, at(now, 1))).map((job) => job.id),
      ).toEqual([resumed.post!.id]);
    },
  );

  it('reclaims an expired lease while retaining pending PMC work', async () => {
    const now = new Date();
    const original = await seed({
      createdAt: now,
      checkpoint: { pendingPmcRecomputeFrom: '2025-01-10T00:00:00.000Z' },
    });
    await db.userPostProcessJob.update({
      where: { id: original.post!.id },
      data: {
        status: 'RUNNING',
        lockToken: 'expired-owner',
        leaseExpiresAt: at(now, -1),
      },
    });
    const { worker } = scheduler();
    const [claimed] = await worker.claimBatch(5, now);
    expect(claimed.id).toBe(original.post!.id);
    expect(claimed.lockToken).not.toBe('expired-owner');
    expect(
      (
        await db.userPostProcessJob.findUniqueOrThrow({
          where: { id: claimed.id },
        })
      ).replayCheckpoint,
    ).toEqual({ pendingPmcRecomputeFrom: '2025-01-10T00:00:00.000Z' });
  });

  it('coalesces an earlier late arrival once and preserves a new request created during replay', async () => {
    const now = new Date();
    const later = await seed({
      createdAt: at(now, -10_000),
      from: trainingTime(20),
    });
    const earlier = await seed({
      createdAt: at(now, -5_000),
      from: trainingTime(10),
    });
    let arrived: Awaited<ReturnType<typeof seed>> | undefined;
    const replay = jest.fn(async (_request: Record<string, unknown>) => {
      if (!arrived)
        arrived = await seed({ createdAt: now, from: trainingTime(1) });
      return { runId: 'synthetic-run', completed: true, nextCheckpoint: null };
    });
    const { worker, runBatchAiReviewWhenAllowed, runBatchThirdPartyExports } =
      scheduler(replay);
    const [leader] = await worker.claimBatch(5, now);
    await worker.processJob(leader);
    expect(replay).toHaveBeenCalledTimes(1);
    expect(replay).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveFrom: trainingTime(10),
        includeActivityIds: [later.activity.id, earlier.activity.id],
      }),
    );
    expect(
      (
        await db.userPostProcessJob.findUniqueOrThrow({
          where: { id: arrived!.post!.id },
        })
      ).status,
    ).toBe('PENDING');
    const [sibling] = await worker.claimBatch(5, at(now, 1));
    expect(sibling.id).toBe(earlier.post!.id);
    await worker.processJob(sibling);
    expect(replay).toHaveBeenCalledTimes(1);
    expect(await db.notification.count()).toBe(2);
    expect(runBatchAiReviewWhenAllowed).toHaveBeenCalledTimes(2);
    expect(runBatchThirdPartyExports).toHaveBeenCalledTimes(2);
    const [next] = await worker.claimBatch(5, at(now, 4_000));
    expect(next.id).toBe(arrived!.post!.id);
    await worker.processJob(next);
    expect(replay).toHaveBeenCalledTimes(2);
    expect(replay.mock.calls[1][0]).toMatchObject({
      effectiveFrom: trainingTime(1),
    });
    expect(await db.notification.count()).toBe(3);
  });

  it('rolls back DONE if creation of the durable replay request fails', async () => {
    const row = await seed({ createdAt: new Date(), pendingItem: true });
    const done = completion();
    done.activeLeaseTokens.set(row.item.id, 'item-owner');
    const broken = jest
      .spyOn(batches, 'createPostProcessJob')
      .mockRejectedValueOnce(new Error('queue unavailable'));
    await expect(
      done.completeActivityItem(row.item.id, row.batch.id),
    ).rejects.toThrow('queue unavailable');
    broken.mockRestore();
    expect(
      (await db.importItemJob.findUniqueOrThrow({ where: { id: row.item.id } }))
        .status,
    ).toBe('ANALYZING');
    expect(await db.userPostProcessJob.count()).toBe(0);
    await done.completeActivityItem(row.item.id, row.batch.id);
    expect(
      (await db.importItemJob.findUniqueOrThrow({ where: { id: row.item.id } }))
        .status,
    ).toBe('DONE');
    expect(await db.userPostProcessJob.count()).toBe(1);
  });

  it('does not publish completion after the import item lease is replaced', async () => {
    const row = await seed({ createdAt: new Date(), pendingItem: true });
    const done = completion();
    done.activeLeaseTokens.set(row.item.id, 'old-owner');
    await expect(
      done.completeActivityItem(row.item.id, row.batch.id),
    ).rejects.toThrow('lease lost');
    expect(await db.userPostProcessJob.count()).toBe(0);
    expect(
      (await db.importItemJob.findUniqueOrThrow({ where: { id: row.item.id } }))
        .status,
    ).toBe('ANALYZING');
  });

  it('bounds short drift deferrals and retains checkpoint work before normal failure escalation', async () => {
    const now = new Date();
    const row = await seed({
      createdAt: at(now, -20_000),
      checkpoint: { pendingPmcRecomputeFrom: '2025-01-01T00:00:00.000Z' },
    });
    const replay = jest.fn(
      async (_request: Record<string, unknown>): Promise<never> => {
        throw new FitnessEvidenceRevisionDriftError();
      },
    );
    const { worker } = scheduler(replay);
    for (let turn = 0; turn < 4; turn += 1) {
      const [claimed] = await worker.claimBatch(1, at(now, (turn + 1) * 5_000));
      expect(claimed).toBeDefined();
      await worker.processJob(claimed);
      const stored = await db.userPostProcessJob.findUniqueOrThrow({
        where: { id: row.post!.id },
      });
      expect(stored.replayCheckpoint).toMatchObject({
        pendingPmcRecomputeFrom: '2025-01-01T00:00:00.000Z',
        evidenceDriftDeferrals: Math.min(turn + 1, 3),
      });
      expect(stored.status).toBe(turn < 3 ? 'PENDING' : 'FAILED');
      expect(stored.attempts).toBe(turn < 3 ? 0 : 1);
      expect(stored.lockToken).toBeNull();
    }
  });

  it.each(['UTC', 'Asia/Shanghai', 'America/Los_Angeles'])(
    'honors retry availability and round-trips lease instants in %s',
    async (timezone) => {
      await db.$executeRawUnsafe(`SET TIME ZONE '${timezone}'`);
      const now = new Date();
      const row = await seed({ createdAt: now });
      await db.userPostProcessJob.update({
        where: { id: row.post!.id },
        data: {
          status: 'FAILED',
          attempts: 1,
          availableAt: at(now, 60_000),
        },
      });
      const { worker } = scheduler();
      expect(await worker.claimBatch(1, at(now, 30_000))).toEqual([]);
      const claimedAt = at(now, 61_000);
      const [claimed] = await worker.claimBatch(1, claimedAt);
      const stored = await db.userPostProcessJob.findUniqueOrThrow({
        where: { id: claimed.id },
      });
      expect(stored.startedAt).toEqual(claimedAt);
      expect(stored.leaseExpiresAt).toEqual(at(claimedAt, 15 * 60_000));
    },
  );

  it('keeps completed checkpoint and notification deduplication after final publication fails', async () => {
    const now = new Date();
    const row = await seed({
      createdAt: at(now, -20_000),
      checkpoint: {
        completedAt: now.toISOString(),
        runId: 'completed-run',
      },
    });
    const { worker, service } = scheduler();
    const complete = jest
      .spyOn(
        service as unknown as {
          completeClaimedJob(...args: unknown[]): Promise<void>;
        },
        'completeClaimedJob',
      )
      .mockRejectedValueOnce(new Error('synthetic process interruption'));
    const [first] = await worker.claimBatch(1, now);
    await worker.processJob(first);
    expect(await db.notification.count()).toBe(1);
    const failed = await db.userPostProcessJob.findUniqueOrThrow({
      where: { id: row.post!.id },
    });
    expect(failed.status).toBe('FAILED');
    expect(failed.attempts).toBe(1);
    expect(failed.replayCheckpoint).toMatchObject({ runId: 'completed-run' });
    complete.mockRestore();
    const [retry] = await worker.claimBatch(1, at(now, 121_000));
    await worker.processJob(retry);
    expect(
      (
        await db.userPostProcessJob.findUniqueOrThrow({
          where: { id: row.post!.id },
        })
      ).status,
    ).toBe('COMPLETED');
    expect(await db.notification.count()).toBe(1);
  });

  concurrent('claims each user once across competing schedulers', async () => {
    const now = new Date();
    await seed({ createdAt: at(now, -20_000) });
    await seed({ createdAt: at(now, -19_000) });
    await seed({ createdAt: at(now, -18_000), user: 'athlete-b' });
    const [first, second] = await Promise.all([
      scheduler().worker.claimBatch(1, now),
      scheduler().worker.claimBatch(1, now),
    ]);
    const claimed = [...first, ...second];
    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map((job) => job.userId)).size).toBe(2);
    expect(
      await db.userPostProcessJob.count({
        where: { userId: 'athlete-a', status: 'RUNNING' },
      }),
    ).toBe(1);
  });

  concurrent(
    'serializes simultaneous item completions with batch counts and a single replay request',
    async () => {
      const row = await seed({ createdAt: new Date(), pendingItem: true });
      await db.importBatchJob.update({
        where: { id: row.batch.id },
        data: { totalCount: 2 },
      });
      const earlier = await db.activity.create({
        data: {
          userId: 'athlete-a',
          hashId: 'concurrent-earlier',
          sportType: 'RUN',
          startTime: trainingTime(10),
          processingStatus: 'ANALYZING',
        },
      });
      const second = await db.importItemJob.create({
        data: {
          batchJobId: row.batch.id,
          userId: 'athlete-a',
          sourceObjectId: row.item.sourceObjectId,
          sourceKind: 'FILE',
          sourceUid: 'concurrent-second',
          position: 1,
          activityId: earlier.id,
          status: 'ANALYZING',
          lockToken: 'second-owner',
        },
      });
      const firstWorker = completion();
      const secondWorker = completion();
      firstWorker.activeLeaseTokens.set(row.item.id, 'item-owner');
      secondWorker.activeLeaseTokens.set(second.id, 'second-owner');
      await Promise.all([
        firstWorker.completeActivityItem(row.item.id, row.batch.id),
        secondWorker.completeActivityItem(second.id, row.batch.id),
      ]);
      const batch = await db.importBatchJob.findUniqueOrThrow({
        where: { id: row.batch.id },
      });
      expect(batch).toMatchObject({
        status: 'POST_PROCESSING',
        totalCount: 2,
        successCount: 2,
      });
      expect(
        await db.userPostProcessJob.count({ where: { batchJobId: batch.id } }),
      ).toBe(1);
      expect(
        (
          await db.userPostProcessJob.findUniqueOrThrow({
            where: { batchJobId: batch.id },
          })
        ).recomputeFrom,
      ).toEqual(trainingTime(10));
    },
  );
});
