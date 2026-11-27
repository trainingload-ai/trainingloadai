import { importingJobRepository } from '@/importing/spec/importing-job.fixture';
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
import { Prisma, PrismaClient, type ImportSourceKind } from '@prisma/client';
import { ImportingJobService } from '../importing-job.service';
import { ImportBatchService } from '../import-batch.service';
import { ImportItemWorkerService } from '../import-item.worker';
import { UserPostProcessWorkerService } from '../user-post-process.worker';
import { FitnessEvidenceRevisionDriftError } from '@/analyze/chronological-activity-replay.service';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { NotificationRepository } from '@/notification/persistence/notification.repository';
import { ActivityImportDraftService } from '@/api/activity/activity-import-draft.service';
import { lockFitnessUser } from '@/prisma/fitness-write-lock';

jest.mock('@/api/activity/activity.service', () => ({
  ActivityService: class {},
  ActivityAnalyzeMode: { LIGHT: 'LIGHT' },
}));

type Claimed = {
  id: string;
  userId: string;
  batchJobId: string;
  lockToken: string;
};
type Scheduler = {
  drain(): Promise<void>;
  claimBatch(limit: number, now?: Date): Promise<Claimed[]>;
  processJob(job: Claimed): Promise<void>;
};
type ItemCompletion = {
  activeLeaseTokens: Map<string, string>;
  claimBatch(limit: number): Promise<ItemClaim[]>;
  processJob(job: ItemClaim): Promise<void>;
  completeActivityItem(jobId: string, batchJobId: string): Promise<void>;
};
type ItemClaim = {
  id: string;
  userId: string;
  batchJobId: string;
  sourceObjectId: string;
  sourceKind: ImportSourceKind;
  lockToken: string;
};
const at = (time: Date, delta: number) => new Date(time.getTime() + delta);
const trainingTime = (day: number) => new Date(Date.UTC(2025, 0, day));
const nativePostgres = Boolean(process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN);
const realPostgres =
  nativePostgres || Boolean(process.env.CORE_MIGRATION_TEST_POSTGRES_URL);
const concurrent = realPostgres ? it : it.skip;

describe('durable user post-process coalescing', () => {
  let database: ChildProcess;
  let db: PrismaClient;
  let jobs: ImportingJobService;
  let repository: ReturnType<typeof importingJobRepository>;
  let batches: ImportBatchService;
  let sequence = 0;
  const translate = { t: (key: string) => key };
  const users = { getPreferredLocale: async () => 'en' };

  beforeAll(async () => {
    const databaseFixture = nativePostgres
      ? '../../api/plan/spec/plan-sync-native-postgres.mjs'
      : realPostgres
        ? '../../analyze/spec/activity-recompute-postgres.mjs'
        : '../../api/ai/core/spec/coach-run-postgres.mjs';
    database = fork(resolve(__dirname, databaseFixture), [], {
      execArgv: [],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
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
    repository = importingJobRepository(db as never);
    jobs = new ImportingJobService(repository);
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

  function completion(database: Prisma.TransactionClient = db) {
    const service = new ImportItemWorkerService(
      database as never,
      { get: () => undefined } as never,
      { getFileWithKey: async () => Buffer.from('synthetic fit') } as never,
      {} as never,
      {} as never,
      undefined,
      {} as never,
      {} as never,
      {} as never,
      { normalize: async () => ({ payloads: [] }) } as never,
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
    'keeps active import leases and retry times in UTC in database timezone %s',
    async (timezone) => {
      const now = new Date();
      const inline = await seed({ createdAt: now, pendingItem: true });
      const expired = await seed({ createdAt: now, pendingItem: true });
      const retry = await seed({ createdAt: now, pendingItem: true });
      await db.importItemJob.update({
        where: { id: inline.item.id },
        data: {
          status: 'MATERIALIZING',
          lockToken: 'draft-inline:active',
          leaseExpiresAt: at(now, 15 * 60_000),
        },
      });
      await db.importItemJob.update({
        where: { id: expired.item.id },
        data: { leaseExpiresAt: at(now, -60_000) },
      });
      await db.importItemJob.update({
        where: { id: retry.item.id },
        data: { status: 'FAILED', availableAt: at(now, 60_000) },
      });

      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
        const queuedItem = {
          batchJobId: inline.batch.id,
          userId: inline.batch.userId,
          sourceObjectId: inline.item.sourceObjectId,
          sourceKind: 'FILE' as const,
          sourceUid: inline.item.sourceUid,
        };
        const queued = await tx.importItemJob.create({
          data: { ...queuedItem, position: 1 },
        });
        const bulkItemId = 'bulk-queued-item';
        await tx.importItemJob.createMany({
          data: [{ ...queuedItem, id: bulkItemId, position: 2 }],
        });

        const claimStartedAt = Date.now();
        const claims = await completion(tx).claimBatch(10);
        const claimFinishedAt = Date.now();
        expect(claims.map(({ id }) => id).sort()).toEqual(
          [expired.item.id, queued.id, bulkItemId].sort(),
        );
        const claimed = await tx.importItemJob.findUniqueOrThrow({
          where: { id: expired.item.id },
        });
        expect(claimed.startedAt).toEqual(claimed.updatedAt);
        expect(claimed.updatedAt.getTime()).toBeGreaterThanOrEqual(
          claimStartedAt,
        );
        expect(claimed.updatedAt.getTime()).toBeLessThanOrEqual(
          claimFinishedAt,
        );
        expect(claimed.leaseExpiresAt).toEqual(
          at(claimed.updatedAt, 15 * 60_000),
        );
      });
    },
  );

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
      .spyOn(repository, 'createPostProcessJob')
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
    expect(
      await db.importBatchJob.findUnique({ where: { id: row.batch.id } }),
    ).toMatchObject({ status: 'POST_PROCESSING', successCount: 1 });
  });

  it('replays through the last accepted activity and rejects imports beyond 24 hours across retry and pagination', async () => {
    const now = new Date('2026-01-15T12:00:00.000Z');
    const boundary = at(now, 86_400_000);
    const row = await seed({ createdAt: at(new Date(), -30_000), from: now });
    const addActivity = async (position: number, startTime: Date) => {
      const activity = await db.activity.create({
        data: {
          userId: 'athlete-a',
          hashId: `future-import-${position}`,
          sportType: 'RUN',
          startTime,
          processingStatus: 'ANALYZING',
          createdByBatchJobId: row.batch.id,
        },
      });
      await db.importItemJob.create({
        data: {
          batchJobId: row.batch.id,
          userId: 'athlete-a',
          sourceObjectId: row.item.sourceObjectId,
          sourceKind: 'FILE',
          sourceUid: `future-import-${position}`,
          activityId: activity.id,
          position,
          status: 'DONE',
        },
      });
      return activity.id;
    };
    const near = await addActivity(1, at(now, 2 * 3_600_000));
    const exact = await addActivity(2, boundary);
    const invalid = await addActivity(3, at(boundary, 1));
    await db.importItemJob.create({
      data: {
        batchJobId: row.batch.id,
        userId: 'athlete-a',
        sourceObjectId: row.item.sourceObjectId,
        sourceKind: 'FILE',
        sourceUid: 'reused-future-activity',
        activityId: invalid,
        position: 4,
        status: 'DONE',
        analysisRequired: false,
      },
    });
    await db.importBatchJob.update({
      where: { id: row.batch.id },
      data: { totalCount: 5, successCount: 5 },
    });
    await db.userPostProcessJob.update({
      where: { id: row.post!.id },
      data: { recomputeFrom: at(now, 1_000), recomputeTo: at(boundary, 1) },
    });

    const replay = jest
      .fn(async (request: Record<string, unknown>) => {
        await db.activity.updateMany({
          where: { id: { in: request.includeActivityIds as number[] } },
          data: { processingStatus: 'READY' },
        });
        return {
          runId: 'future-replay',
          completed: true,
          nextCheckpoint: null,
        };
      })
      .mockRejectedValueOnce(new Error('retry the replay'))
      .mockImplementationOnce(async () => {
        await db.activity.updateMany({
          where: { id: { in: [row.activity.id, near] } },
          data: { processingStatus: 'READY' },
        });
        const nextCheckpoint = {
          nextEffectiveFrom: boundary.toISOString(),
          lastActivityId: near,
        };
        await db.userPostProcessJob.update({
          where: { id: row.post!.id },
          data: { replayCheckpoint: nextCheckpoint },
        });
        return {
          runId: 'future-replay',
          completed: false,
          nextCheckpoint: null,
        };
      });
    const { worker } = scheduler(replay);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    try {
      const [first] = await worker.claimBatch(1);
      await worker.processJob(first);
      expect(replay).toHaveBeenCalledWith(
        expect.objectContaining({
          effectiveFrom: now,
          effectiveTo: boundary,
          includeActivityIds: expect.arrayContaining([
            row.activity.id,
            near,
            exact,
          ]),
        }),
      );
      expect(replay.mock.calls[0][0].includeActivityIds).not.toContain(invalid);
      expect(
        await db.importItemJob.count({
          where: {
            activityId: invalid,
            status: 'DEAD',
            lastErrorCode: 'IMPORT_ACTIVITY_START_IN_FUTURE',
          },
        }),
      ).toBe(2);
      expect(
        await db.activity.findUnique({ where: { id: invalid } }),
      ).toMatchObject({ processingStatus: 'FAILED' });

      clock.mockReturnValue(now.getTime() + 1_000);
      const [second] = await worker.claimBatch(1);
      await worker.processJob(second);
      expect(replay.mock.calls[1][0]).toMatchObject({ effectiveTo: boundary });
      expect(replay.mock.calls[1][0].includeActivityIds).not.toContain(invalid);
      const [third] = await worker.claimBatch(1);
      await worker.processJob(third);
      expect(replay.mock.calls[2][0]).toMatchObject({
        effectiveFrom: boundary,
        effectiveTo: boundary,
      });
      expect(replay.mock.calls[2][0].includeActivityIds).not.toContain(invalid);
      expect(
        await db.activity.count({
          where: {
            id: { in: [row.activity.id, near, exact] },
            processingStatus: 'READY',
          },
        }),
      ).toBe(3);
      expect(
        await db.importBatchJob.findUnique({ where: { id: row.batch.id } }),
      ).toMatchObject({
        status: 'PARTIAL_FAILED',
        successCount: 3,
        failedCount: 2,
      });
      expect(
        await batches.getBatchSummary(row.batch.id, 'athlete-a'),
      ).toMatchObject({
        counts: {
          readyActivities: 3,
          processingActivities: 0,
          analysisFailedActivities: 0,
        },
      });
      expect(await db.notification.findMany()).toMatchObject([
        { kind: 'IMPORT_BATCH_PARTIAL_FAILED' },
      ]);
      expect(
        (await batches.getBatchItems(row.batch.id, 'athlete-a')).items[3],
      ).toMatchObject({
        lastError: 'common.error.import_activity_start_in_future',
      });
    } finally {
      clock.mockRestore();
    }
  });

  it('does not claim coverage for a sibling whose activity moved into the future', async () => {
    const now = new Date();
    const later = at(now, 6 * 3_600_000);
    const earlier = at(now, 2 * 3_600_000);
    const leader = await seed({ createdAt: at(now, -10_000), from: later });
    const sibling = await seed({
      createdAt: at(now, -5_000),
      from: at(now, -30_000),
    });
    await db.activity.update({
      where: { id: sibling.activity.id },
      data: { startTime: earlier },
    });
    const { worker, replay } = scheduler();
    const [first] = await worker.claimBatch(1, now);
    expect(first.id).toBe(leader.post!.id);
    await worker.processJob(first);
    expect(replay.mock.calls[0][0]).toMatchObject({
      effectiveTo: later,
      includeActivityIds: [leader.activity.id],
    });
    const [second] = await worker.claimBatch(1, now);
    expect(second.id).toBe(sibling.post!.id);
    await worker.processJob(second);
    expect(replay.mock.calls[1][0]).toMatchObject({
      effectiveTo: earlier,
      includeActivityIds: [sibling.activity.id],
    });
  });

  concurrent(
    'takes the fitness lock before writing an out-of-range activity',
    async () => {
      const now = new Date();
      const row = await seed({
        createdAt: at(now, -30_000),
        from: at(now, 2 * 86_400_000),
      });
      const [job] = await scheduler().worker.claimBatch(1, now);
      const locked = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const replay = db.$transaction(async (tx) => {
        await lockFitnessUser(tx, job.userId);
        locked.resolve();
        await release.promise;
        await tx.$queryRaw`SELECT id FROM t_activity WHERE id = ${row.activity.id} FOR UPDATE NOWAIT`;
      });
      await Promise.race([locked.promise, replay]);
      const rejection = jobs.rejectFutureActivities({
        ...job,
        jobId: job.id,
        cutoff: at(now, 86_400_000),
      });
      try {
        let waitingForLock = false;
        for (let attempt = 0; attempt < 50 && !waitingForLock; attempt++) {
          const [lock] = await db.$queryRaw<Array<{ waiting: boolean }>>`
          SELECT EXISTS(SELECT 1 FROM pg_locks
            WHERE locktype = 'advisory' AND NOT granted) AS waiting
        `;
          waitingForLock = lock.waiting;
          if (!waitingForLock)
            await new Promise((done) => setTimeout(done, 10));
        }
        expect(waitingForLock).toBe(true);
      } finally {
        release.resolve();
        await Promise.all([replay, rejection]);
      }
      expect(
        await db.activity.findUnique({ where: { id: row.activity.id } }),
      ).toMatchObject({ processingStatus: 'FAILED' });
    },
  );

  it('recovers a historical terminal batch at startup and respects the recovery interval', async () => {
    const now = new Date();
    const finished = await seed({ createdAt: now, pendingItem: true });
    const registering = await seed({ createdAt: now, pendingItem: true });
    const retrying = await seed({ createdAt: now, pendingItem: true });
    await db.importItemJob.updateMany({
      where: { id: { in: [finished.item.id, registering.item.id] } },
      data: { status: 'DONE', lockToken: null, completedAt: now },
    });
    await db.importBatchJob.update({
      where: { id: registering.batch.id },
      data: { totalCount: 2 },
    });
    await db.importItemJob.update({
      where: { id: retrying.item.id },
      data: { status: 'FAILED', lockToken: null },
    });

    const replay = jest.fn(async (_request: Record<string, unknown>) => {
      await db.activity.update({
        where: { id: finished.activity.id },
        data: { processingStatus: 'READY', readyAt: now },
      });
      return { runId: 'recovered-run', completed: true, nextCheckpoint: null };
    });
    const { worker } = scheduler(replay);
    const recover = jest.spyOn(jobs, 'recoverFinishedBatches');
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    try {
      await worker.drain();
      const [recovered] = await worker.claimBatch(5, at(now, 60_000));
      expect(recovered?.batchJobId).toBe(finished.batch.id);
      await worker.processJob(recovered);
      expect(await db.userPostProcessJob.findMany()).toMatchObject([
        { batchJobId: finished.batch.id, status: 'COMPLETED' },
      ]);
      expect(
        await db.importBatchJob.findUnique({
          where: { id: finished.batch.id },
        }),
      ).toMatchObject({ status: 'COMPLETED', successCount: 1 });
      expect(await db.notification.count()).toBe(1);
      expect(
        await db.activity.findUnique({ where: { id: finished.activity.id } }),
      ).toMatchObject({ processingStatus: 'READY' });
      expect(replay).toHaveBeenCalledWith(
        expect.objectContaining({ includeActivityIds: [finished.activity.id] }),
      );

      clock.mockReturnValue(now.getTime() + 5 * 60_000 - 1);
      await worker.drain();
      expect(recover).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(now.getTime() + 5 * 60_000);
      await worker.drain();
      expect(recover).toHaveBeenCalledTimes(2);
      expect(await db.userPostProcessJob.count()).toBe(1);
      expect(
        await db.importBatchJob.count({ where: { status: 'RUNNING' } }),
      ).toBe(2);
    } finally {
      clock.mockRestore();
      recover.mockRestore();
    }
  });

  concurrent(
    'recovers after terminal item publication across two workers and skips a locked batch',
    async () => {
      const now = new Date();
      const locked = await seed({ createdAt: now, pendingItem: true });
      const available = await seed({ createdAt: now, pendingItem: true });
      await db.importBatchJob.updateMany({
        where: { id: { in: [locked.batch.id, available.batch.id] } },
        data: { status: 'QUEUED' },
      });
      await db.importItemJob.update({
        where: { id: locked.item.id },
        data: { status: 'DEAD', lockToken: null, completedAt: now },
      });
      await db.importItemJob.update({
        where: { id: available.item.id },
        data: {
          status: 'QUEUED',
          lockToken: null,
          activityId: null,
          sourceRef: { fileKey: 'synthetic.fit' },
        },
      });
      const importer = completion();
      const [claimed] = await importer.claimBatch(1);
      expect(claimed.id).toBe(available.item.id);
      const interrupted = jest
        .spyOn(batches, 'refreshBatchProgress')
        .mockRejectedValueOnce(new Error('worker stopped before aggregation'));
      try {
        await expect(importer.processJob(claimed)).rejects.toThrow(
          'worker stopped before aggregation',
        );
      } finally {
        interrupted.mockRestore();
      }
      expect(
        await db.importItemJob.findUnique({ where: { id: available.item.id } }),
      ).toMatchObject({ status: 'SKIPPED', lastErrorCode: 'no_payloads' });
      expect(
        await db.importBatchJob.findUnique({
          where: { id: available.batch.id },
        }),
      ).toMatchObject({ status: 'QUEUED' });
      expect(await db.userPostProcessJob.count()).toBe(0);

      const first = scheduler().worker;
      const second = scheduler().worker;
      const lockAcquired = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const holdingLock = db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM t_import_batch_job
        WHERE id = ${locked.batch.id} FOR UPDATE`;
        lockAcquired.resolve();
        await release.promise;
      });
      try {
        await Promise.race([lockAcquired.promise, holdingLock]);
        await Promise.all([first.drain(), second.drain()]);
        expect(await db.userPostProcessJob.findMany()).toMatchObject([
          { batchJobId: available.batch.id },
        ]);
      } finally {
        release.resolve();
        await holdingLock;
      }
      const [recovered] = await first.claimBatch(5, at(now, 60_000));
      expect(recovered.batchJobId).toBe(available.batch.id);
      await first.processJob(recovered);
      expect(
        await db.importBatchJob.findUnique({
          where: { id: available.batch.id },
        }),
      ).toMatchObject({ status: 'COMPLETED', skippedCount: 1 });
      await expect(jobs.recoverFinishedBatches()).resolves.toBe(1);
      await expect(jobs.recoverFinishedBatches()).resolves.toBe(0);
      expect(await db.userPostProcessJob.count()).toBe(2);
      expect(
        await db.importBatchJob.findUnique({
          where: { id: locked.batch.id },
        }),
      ).toMatchObject({ status: 'POST_PROCESSING', failedCount: 1 });
    },
  );

  async function draftWriter(
    interrupt?: (args: { draftId: string; itemJobId: string }) => Promise<void>,
  ) {
    const userId = 'athlete-a';
    const source = await db.importSourceObject.create({
      data: { userId, sourceKind: 'FILE', sourceUid: 'draft-source' },
    });
    const draft = await db.activityImportDraft.create({
      data: {
        userId,
        sourceObjectId: source.id,
        sourceUid: source.sourceUid,
        payload: {
          identity: { dedupeKey: 'draft-dedupe' },
          summary: {},
          records: [],
          laps: [],
        },
      },
    });
    const service = new ActivityImportDraftService(
      db as never,
      {} as never,
      {} as never,
      {
        materialize: async (args: {
          batchJobId: string;
          itemJobId: string;
        }) => {
          await interrupt?.({ ...args, draftId: draft.id });
          const activity = await db.activity.create({
            data: {
              userId,
              hashId: `draft-${args.batchJobId}`,
              sportType: 'RUN',
              startTime: trainingTime(20),
              createdByBatchJobId: args.batchJobId,
            },
          });
          return { activity };
        },
      } as never,
      { generateParquetFileByCanonicalPayload: async () => undefined } as never,
      {} as never,
      batches,
      translate as never,
      jobs,
    );
    return {
      service,
      request: { draftId: draft.id, userId, sessionRpe: null },
    };
  }

  it('rolls back draft completion and replay publication together before a successful retry', async () => {
    const { service, request } = await draftWriter();
    const createPostProcessJob =
      repository.createPostProcessJob.bind(repository);
    const interrupted = jest
      .spyOn(repository, 'createPostProcessJob')
      .mockImplementationOnce(async (batchId, tx) => {
        await createPostProcessJob(batchId, tx);
        throw new Error('interrupted before draft completion');
      });
    try {
      await expect(service.commitDraft(request)).rejects.toThrow(
        'interrupted before draft completion',
      );
    } finally {
      interrupted.mockRestore();
    }
    expect(await db.userPostProcessJob.count()).toBe(0);
    expect(await db.importItemJob.findMany()).toMatchObject([
      { status: 'DEAD', activityId: null },
    ]);
    expect(await db.importBatchJob.findMany()).toMatchObject([
      { status: 'CANCELLED', failedCount: 1 },
    ]);
    await expect(completion().claimBatch(1)).resolves.toEqual([]);
    expect(
      await db.activityImportDraft.findUnique({
        where: { id: request.draftId },
      }),
    ).toMatchObject({ status: 'READY', committedActivityId: null });

    const committed = await service.commitDraft(request);
    expect(committed.preview).toMatchObject({ status: 'COMMITTED' });
    expect(
      await db.importItemJob.findUnique({
        where: { id: committed.importItemId },
      }),
    ).toMatchObject({ status: 'DONE', activityId: committed.activityId });
    expect(
      await db.importBatchJob.findUnique({ where: { id: committed.batchId } }),
    ).toMatchObject({ status: 'POST_PROCESSING', successCount: 1 });
    expect(await db.userPostProcessJob.findMany()).toMatchObject([
      { batchJobId: committed.batchId, status: 'PENDING' },
    ]);
  });

  it.each(['draft', 'item'])(
    'does not overwrite a reclaimed inline %s lease',
    async (reclaimed) => {
      const newClaimAt = at(new Date(), 1_000);
      const { service, request } = await draftWriter(
        async ({ draftId, itemJobId }) => {
          if (reclaimed === 'draft') {
            await db.activityImportDraft.update({
              where: { id: draftId },
              data: { updatedAt: newClaimAt },
            });
          } else {
            await db.importItemJob.update({
              where: { id: itemJobId },
              data: { status: 'NORMALIZING', lockToken: 'background-owner' },
            });
          }
        },
      );
      await expect(service.commitDraft(request)).rejects.toThrow(
        reclaimed === 'draft' ? 'already being committed' : 'lease lost',
      );
      expect(await db.userPostProcessJob.count()).toBe(0);
      if (reclaimed === 'draft') {
        expect(
          await db.activityImportDraft.findUnique({
            where: { id: request.draftId },
          }),
        ).toMatchObject({ status: 'COMMITTING', updatedAt: newClaimAt });
      } else {
        expect(await db.importItemJob.findMany()).toMatchObject([
          { status: 'NORMALIZING', lockToken: 'background-owner' },
        ]);
      }
    },
  );

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
