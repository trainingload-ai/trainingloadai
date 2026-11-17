import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PlanExternalSyncService } from '../application/plan-external-sync.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { PlanLinkMatcherService } from '../application/plan-link-matcher.service';
import { ActivityReadService } from '../../activity/activity-read.service';
import { PlanWriteSupport } from '../application/plan-write.support';
import { PlanActivityLinkService } from '../application/plan-activity-link.service';
import { ActivityService } from '../../activity/activity.service';
import { readFileSync } from 'node:fs';

/** Disposable PostgreSQL engine only; never reads .env or an application database. */
describe('Planned workout synchronization / PostgreSQL invariants', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;
  let service: PlanExternalSyncService;
  let estimateWrites = false;
  const estimatedAt = new Date('2026-07-07T00:00:00Z');

  beforeAll(async () => {
    database = fork(
      process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN
        ? resolve(__dirname, 'plan-sync-native-postgres.mjs')
        : resolve(__dirname, '../../ai/core/spec/coach-run-postgres.mjs'),
      [],
      {
        execArgv: [],
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      },
    );
    const server = await new Promise<{
      address: string;
      connectionLimit?: number;
    }>((done, reject) => {
      database.once(
        'message',
        (value: { address: string; connectionLimit?: number }) => done(value),
      );
      database.once('error', reject);
      database.once('exit', (code) =>
        reject(new Error(`Test database exited: ${code}`)),
      );
    });
    prisma = new PrismaClient({
      datasourceUrl: `postgresql://postgres:postgres@${server.address}/postgres?connection_limit=${server.connectionLimit ?? 1}&sslmode=disable`,
    });
    await prisma.$connect();
    service = new PlanExternalSyncService(
      prisma as never,
      { buildWorkoutPlanSteps: () => [] } as never,
      {
        applyForWorkout: async (
          workoutId: string,
          { tx }: { tx: Prisma.TransactionClient },
        ) => {
          if (estimateWrites)
            await tx.planWorkout.update({
              where: { id: workoutId },
              data: {
                estimatedLoad: 50,
                estimatedLoadComputedAt: estimatedAt,
                updatedAt: estimatedAt,
              },
            });
        },
      } as never,
      new PlanRepository(prisma as never),
      new PlanWorkoutRepository(prisma as never),
      new PlanActivityLinkRepository(prisma as never),
      { assertMutable: () => undefined } as never,
      { getPreferredTimezone: async () => 'UTC' } as never,
    );
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (database && database.exitCode === null)
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
  });

  beforeEach(async () => {
    estimateWrites = false;
    await prisma.$disconnect();
    await prisma.$connect();
    await prisma.$executeRawUnsafe('DELETE FROM t_user');
    await prisma.$executeRawUnsafe(
      "INSERT INTO t_user(id) VALUES ('user'),('other')",
    );
  });

  const create = () =>
    service.createIndependentWorkout(
      {
        userId: 'user',
        scheduledDate: new Date('2026-07-06'),
        sportType: 'RUN',
        text: 'Run',
        blocks: [],
      },
      (row) => ({
        userId: 'user',
        provider: 'intervals_icu',
        planWorkoutId: row.id,
        externalEventId: '100',
      }),
    );

  it('commits one course and its mapping together', async () => {
    const row = await create();
    expect(await prisma.planWorkout.count()).toBe(1);
    expect(await prisma.planWorkoutExternalMapping.findFirst()).toMatchObject({
      planWorkoutId: row.id,
      externalEventId: '100',
    });
  });

  it.each([false, true])(
    'atomically recovers a failed first import, concurrent closure=%s',
    async (closed) => {
      const mapping = await prisma.planWorkoutExternalMapping.create({
        data: {
          userId: 'user',
          provider: 'intervals_icu',
          externalEventId: 'ordinary',
          syncState: 'FAILED',
        },
      });
      if (closed)
        await prisma.planWorkoutExternalMapping.update({
          where: { id: mapping.id },
          data: { localDeletedAt: new Date('2026-07-01') },
        });
      const importing = service.createIndependentWorkout(
        {
          userId: 'user',
          scheduledDate: new Date('2026-07-06'),
          sportType: 'RUN',
          name: 'Ordinary run',
          text: 'Ordinary run',
          structureKind: 'FREEFORM',
          plannedDurationSeconds: 1800,
          blocks: [],
        },
        (row) => ({
          id: mapping.id,
          userId: 'user',
          provider: 'intervals_icu',
          externalEventId: 'ordinary',
          planWorkoutId: row.id,
          syncState: 'SYNCED',
        }),
      );
      if (closed) {
        await expect(importing).rejects.toThrow(
          'INTERVALS_PLAN_LOCAL_REVISION_CHANGED',
        );
        expect(await prisma.planWorkout.count()).toBe(0);
      } else {
        const row = await importing;
        expect(row).toMatchObject({
          structureKind: 'FREEFORM',
          plannedDurationSeconds: 1800,
        });
        expect(await prisma.planWorkoutExternalMapping.count()).toBe(1);
        expect(
          await prisma.planWorkoutExternalMapping.findUnique({
            where: { id: mapping.id },
          }),
        ).toMatchObject({ planWorkoutId: row.id, syncState: 'SYNCED' });
      }
    },
  );

  function matcher() {
    return new PlanLinkMatcherService(
      prisma as never,
      { getPreferredTimezone: async () => 'UTC' } as never,
      new PlanRepository(prisma as never),
      new PlanWorkoutRepository(prisma as never),
      new PlanActivityLinkRepository(prisma as never),
      new ActivityReadService(prisma as never),
      undefined as never,
    );
  }

  function manualLinks() {
    const write = Object.create(PlanWriteSupport.prototype) as PlanWriteSupport;
    Object.assign(write, {
      prisma,
      plans: new PlanRepository(prisma as never),
      workouts: new PlanWorkoutRepository(prisma as never),
      links: new PlanActivityLinkRepository(prisma as never),
      activityRead: new ActivityReadService(prisma as never),
      planLinkMatcher: matcher(),
      userService: { getPreferredTimezone: async () => 'UTC' },
      loadReadout: { batchGetActualLoad: async () => new Map() },
      coachContext: { appendEvent: jest.fn(async () => undefined) },
    });
    return write;
  }

  async function independentScenario() {
    const f = await matchingScenario();
    await prisma.plan.delete({ where: { id: f.plan.id } });
    await prisma.activity.update({
      where: { id: f.activity.id },
      data: { processingStatus: 'READY' },
    });
    return f;
  }

  it('supports manual completion and undo with no training plan, preserving idempotency', async () => {
    const f = await independentScenario();
    const write = manualLinks();
    const candidates = await write.listActivityPlanCandidatesByHash(
      'user',
      f.activity.hashId,
    );
    expect(candidates.candidates).toEqual([
      expect.objectContaining({
        workoutId: f.independent.id,
        planId: null,
        expectedDurationSec: 1800,
      }),
    ]);
    await write.replaceActivityPlanLinkByHash('user', f.activity.hashId, {
      workoutId: f.independent.id,
    });
    await write.replaceActivityPlanLinkByHash('user', f.activity.hashId, {
      workoutId: f.independent.id,
    });
    expect(await prisma.plan.count()).toBe(0);
    expect(await prisma.planWorkoutActivityLink.count()).toBe(1);
    expect(await prisma.planWorkoutActivityLink.findFirst()).toMatchObject({
      planId: null,
      source: 'MANUAL',
      autoMarkedWorkoutDone: true,
    });
    expect(
      await prisma.planWorkout.findUnique({ where: { id: f.independent.id } }),
    ).toMatchObject({ status: 'DONE', completedAt: f.activity.startTime });
    expect(
      (await write.getActivityPlanLinkByHash('user', f.activity.hashId))
        .linkedPlanWorkout,
    ).toMatchObject({
      workoutId: f.independent.id,
      planId: null,
      planTitle: null,
      expectedDurationSec: 1800,
    });
    await write.removeActivityPlanLinkByHash('user', f.activity.hashId);
    expect(
      await prisma.planWorkout.findUnique({ where: { id: f.independent.id } }),
    ).toMatchObject({ status: 'PLANNED', completedAt: null });
    expect(
      await prisma.planWorkoutActivityLink.count({
        where: { unlinkedAt: null },
      }),
    ).toBe(0);
    await matcher().tryAutoLinkForActivity(f.activity.id);
    expect(
      await prisma.planWorkoutActivityLink.count({
        where: { unlinkedAt: null },
      }),
    ).toBe(0);
  });

  it('replaces independent associations atomically and does not undo an athlete-completed workout', async () => {
    const f = await independentScenario();
    const write = manualLinks();
    const other = await service.createIndependentWorkout({
      userId: 'user',
      scheduledDate: new Date('2026-07-06'),
      sportType: 'RUN',
      text: 'Another run',
      name: 'Another run',
      structureKind: 'FREEFORM',
      plannedDurationSeconds: null,
      blocks: [],
    });
    await write.replaceActivityPlanLinkByHash('user', f.activity.hashId, {
      workoutId: f.independent.id,
    });
    await write.replaceActivityPlanLinkByHash('user', f.activity.hashId, {
      workoutId: other.id,
    });
    expect(
      await prisma.planWorkout.findUnique({ where: { id: f.independent.id } }),
    ).toMatchObject({ status: 'PLANNED' });
    expect(
      await prisma.planWorkoutActivityLink.count({
        where: { unlinkedAt: null },
      }),
    ).toBe(1);
    await write.removeActivityPlanLinkByHash('user', f.activity.hashId);
    await prisma.planWorkout.update({
      where: { id: f.independent.id },
      data: { status: 'DONE' },
    });
    await write.replaceActivityPlanLinkByHash('user', f.activity.hashId, {
      workoutId: f.independent.id,
    });
    await write.removeActivityPlanLinkByHash('user', f.activity.hashId);
    expect(
      await prisma.planWorkout.findUnique({ where: { id: f.independent.id } }),
    ).toMatchObject({ status: 'DONE' });
  });

  it('rejects cross-athlete manual associations without modifying either endpoint', async () => {
    const f = await independentScenario();
    const otherActivity = await prisma.activity.create({
      data: {
        userId: 'other',
        hashId: 'other-activity',
        processingStatus: 'READY',
      },
    });
    await expect(
      manualLinks().replaceActivityPlanLinkByHash(
        'other',
        otherActivity.hashId,
        { workoutId: f.independent.id },
      ),
    ).rejects.toThrow();
    await expect(
      manualLinks().replaceActivityPlanLinkByHash('other', f.activity.hashId, {
        workoutId: f.independent.id,
      }),
    ).rejects.toThrow();
    expect(await prisma.planWorkoutActivityLink.count()).toBe(0);
    expect(
      await prisma.planWorkout.findUnique({ where: { id: f.independent.id } }),
    ).toMatchObject({ status: 'PLANNED' });
  });

  it('serializes concurrent manual selections for the same activity without duplicate active links', async () => {
    const f = await independentScenario();
    const other = await service.createIndependentWorkout({
      userId: 'user',
      scheduledDate: new Date('2026-07-06'),
      sportType: 'RUN',
      text: 'Second course',
      structureKind: 'FREEFORM',
      blocks: [],
    });
    await Promise.all(
      [f.independent.id, other.id].map((workoutId) =>
        manualLinks().replaceActivityPlanLinkByHash('user', f.activity.hashId, {
          workoutId,
        }),
      ),
    );
    expect(
      await prisma.planWorkoutActivityLink.count({
        where: { unlinkedAt: null },
      }),
    ).toBe(1);
    expect(await prisma.planWorkout.count({ where: { status: 'DONE' } })).toBe(
      1,
    );
  });

  it('expands the previous link schema without changing plan-owned training history', async () => {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "t_plan_workout_activity_link" ALTER COLUMN "plan_id" SET NOT NULL',
    );
    const f = await matchingScenario();
    const before = await prisma.planWorkoutActivityLink.create({
      data: {
        planId: f.plan.id,
        planWorkoutId: f.workout.id,
        activityId: f.activity.id,
        source: 'MANUAL',
      },
    });
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../../../../../packages/prisma/core/migrations/0030_independent_workout_activity_links/migration.sql',
      ),
      'utf8',
    );
    await prisma.$executeRawUnsafe(sql);
    expect(
      await prisma.planWorkoutActivityLink.findUnique({
        where: { id: before.id },
      }),
    ).toEqual(before);
    await prisma.planWorkoutActivityLink.update({
      where: { id: before.id },
      data: { unlinkedAt: new Date() },
    });
    await prisma.activity.update({
      where: { id: f.activity.id },
      data: { processingStatus: 'READY' },
    });
    await manualLinks().replaceActivityPlanLinkByHash(
      'user',
      f.activity.hashId,
      { workoutId: f.independent.id },
    );
    expect(
      await prisma.planWorkoutActivityLink.findFirst({
        where: { unlinkedAt: null },
      }),
    ).toMatchObject({ planId: null, planWorkoutId: f.independent.id });
  });

  async function matchingScenario() {
    const independent = await service.createIndependentWorkout({
      userId: 'user',
      scheduledDate: new Date('2026-07-06'),
      sportType: 'RUN',
      name: 'Ordinary run',
      text: 'Ordinary run',
      structureKind: 'FREEFORM',
      plannedDurationSeconds: 1800,
      blocks: [],
    });
    const plan = await prisma.plan.create({
      data: {
        userId: 'user',
        title: 'Active plan',
        periodWeeks: 1,
        status: 'ACTIVE',
        startDate: new Date('2026-07-06'),
      },
    });
    const activity = await prisma.activity.create({
      data: {
        hashId: 'synthetic-run',
        userId: 'user',
        sportType: 'RUN',
        activityName: 'Run',
        startTime: new Date('2026-07-05T23:30:00Z'),
        timerTime: 1800,
        state: 1,
        timezone: 'Asia/Shanghai',
      },
    });
    const workout = await prisma.planWorkout.create({
      data: {
        userId: 'user',
        planId: plan.id,
        scheduledDate: new Date('2026-07-06'),
        dayOffset: 0,
        sportType: 'RUN',
        text: 'work 30m',
        steps: {
          create: {
            orderIndex: 0,
            stepType: 'WORK',
            durationType: 'TIME',
            durationValue: 1800,
            durationUnit: 'SECONDS',
          },
        },
      },
    });
    return { independent, activity, plan, workout };
  }

  it('keeps ordinary independent courses out of active-plan matching and repeated analysis is idempotent', async () => {
    const f = await matchingScenario();
    await matcher().tryAutoLinkForActivity(f.activity.id);
    await matcher().tryAutoLinkForActivity(f.activity.id);
    expect(await prisma.planWorkoutActivityLink.count()).toBe(1);
    expect(await prisma.planWorkoutActivityLink.findFirst()).toMatchObject({
      planWorkoutId: f.workout.id,
      activityId: f.activity.id,
      source: 'AUTO',
    });
    expect(
      await prisma.planWorkout.findUnique({ where: { id: f.independent.id } }),
    ).toMatchObject({ status: 'PLANNED', completedAt: null });
  });

  it('creates only one association when activity analysis completes concurrently', async () => {
    const f = await matchingScenario();
    await Promise.all([
      matcher().tryAutoLinkForActivity(f.activity.id),
      matcher().tryAutoLinkForActivity(f.activity.id),
    ]);
    expect(await prisma.planWorkoutActivityLink.count()).toBe(1);
  });

  it('allows only one of two concurrent activities to complete the same workout', async () => {
    const f = await matchingScenario();
    const other = await prisma.activity.create({
      data: {
        hashId: 'second-run',
        userId: 'user',
        sportType: 'RUN',
        activityName: 'Second run',
        startTime: new Date('2026-07-06T02:00:00Z'),
        timerTime: 1800,
        state: 1,
        timezone: 'Asia/Shanghai',
      },
    });
    await Promise.all([
      matcher().tryAutoLinkForActivity(f.activity.id),
      matcher().tryAutoLinkForActivity(other.id),
    ]);
    expect(await prisma.planWorkoutActivityLink.count()).toBe(1);
  });

  const nativeIt = process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN
    ? it
    : it.skip;
  nativeIt.each(['workout', 'activity'])(
    'preserves completion history when deleting a %s concurrently with manual linking',
    async (target) => {
      const f = await independentScenario();
      const write = manualLinks();
      let held!: () => void;
      let release!: () => void;
      const locked = new Promise<void>((done) => {
        held = done;
      });
      const released = new Promise<void>((done) => {
        release = done;
      });
      const linking = prisma.$transaction(async (tx) => {
        await write.replaceActivityPlanLinkByHash(
          'user',
          f.activity.hashId,
          { workoutId: f.independent.id },
          undefined,
          undefined,
          { tx },
        );
        held();
        await released;
      });
      await locked;
      const activityService = Object.create(
        ActivityService.prototype,
      ) as ActivityService;
      Object.assign(activityService, {
        prisma,
        planActivityLinks: new PlanActivityLinkService(
          write,
          new PlanActivityLinkRepository(prisma as never),
          new PlanWorkoutRepository(prisma as never),
        ),
        i18n: { t: (key: string) => key },
        sensorFiles: { parquetFiles: () => ({ findMany: async () => [] }) },
        storageGarbageCollector: { enqueueObjects: async () => undefined },
      });
      const deleting = (
        target === 'workout'
          ? write.deleteIndependentWorkout('user', f.independent.id)
          : activityService.deleteActivity('user', f.activity.hashId)
      ).then(
        () => true,
        () => false,
      );
      try {
        let blocked = 0;
        for (let attempt = 0; attempt < 100; attempt++) {
          const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT count(*) FROM pg_stat_activity
            WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0
          `;
          blocked = Number(rows[0].count);
          if (blocked > 0) break;
          await new Promise((done) => setTimeout(done, 10));
        }
        expect(blocked).toBeGreaterThan(0);
      } finally {
        release();
        await linking;
      }
      expect(await deleting).toBe(target === 'activity');
      const course = await prisma.planWorkout.findUnique({
        where: { id: f.independent.id },
      });
      expect(course).toMatchObject({
        status: target === 'activity' ? 'PLANNED' : 'DONE',
      });
      expect(
        await prisma.planWorkoutActivityLink.count({
          where: { unlinkedAt: null },
        }),
      ).toBe(target === 'activity' ? 0 : 1);
    },
  );
  nativeIt.each(['activity', 'workout'])(
    'blocks a separate PostgreSQL session sharing the same %s until commit',
    async (target) => {
      const f = await matchingScenario();
      const otherActivity = await prisma.activity.create({
        data: {
          hashId: 'lock-test-run',
          userId: 'user',
          sportType: 'RUN',
        },
      });
      const links = new PlanActivityLinkRepository(prisma as never);
      let held: () => void;
      let release: () => void;
      const locked = new Promise<void>((done) => {
        held = done;
      });
      const released = new Promise<void>((done) => {
        release = done;
      });
      const first = prisma.$transaction(async (tx) => {
        await links.lockLinkTargets(f.activity.id, f.workout.id, tx);
        held();
        await released;
      });
      await locked;
      let acquired = false;
      const second = prisma.$transaction(async (tx) => {
        await links.lockLinkTargets(
          target === 'activity' ? f.activity.id : otherActivity.id,
          target === 'workout' ? f.workout.id : f.independent.id,
          tx,
        );
        acquired = true;
      });
      try {
        let blocked = 0;
        for (let attempt = 0; attempt < 100; attempt++) {
          const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT count(*) FROM pg_stat_activity
            WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0
          `;
          blocked = Number(rows[0].count);
          if (blocked > 0) break;
          await new Promise((done) => setTimeout(done, 10));
        }
        expect(blocked).toBeGreaterThan(0);
        expect(acquired).toBe(false);
      } finally {
        release();
        await Promise.all([first, second]);
      }
      expect(acquired).toBe(true);
    },
  );

  it.each([
    'wrong-day',
    'wrong-sport',
    'done',
    'paused',
    'missing-duration',
    'ambiguous',
    'manual-link',
  ])(
    'does not let an ordinary import weaken matching guards: %s',
    async (scenario) => {
      const f = await matchingScenario();
      if (scenario === 'wrong-day')
        await prisma.planWorkout.update({
          where: { id: f.workout.id },
          data: { scheduledDate: new Date('2026-07-07') },
        });
      if (scenario === 'wrong-sport')
        await prisma.planWorkout.update({
          where: { id: f.workout.id },
          data: { sportType: 'SWIM' },
        });
      if (scenario === 'done')
        await prisma.planWorkout.update({
          where: { id: f.workout.id },
          data: { status: 'DONE' },
        });
      if (scenario === 'paused')
        await prisma.plan.update({
          where: { id: f.plan.id },
          data: { status: 'PAUSED' },
        });
      if (scenario === 'missing-duration')
        await prisma.activity.update({
          where: { id: f.activity.id },
          data: { timerTime: null },
        });
      if (scenario === 'ambiguous')
        await prisma.planWorkout.create({
          data: {
            userId: 'user',
            planId: f.plan.id,
            dayOffset: 0,
            sessionIndex: 2,
            scheduledDate: new Date('2026-07-06'),
            sportType: 'RUN',
            text: 'work 30m',
            steps: {
              create: {
                orderIndex: 0,
                stepType: 'WORK',
                durationType: 'TIME',
                durationValue: 1800,
                durationUnit: 'SECONDS',
              },
            },
          },
        });
      if (scenario === 'manual-link')
        await prisma.planWorkoutActivityLink.create({
          data: {
            planId: f.plan.id,
            planWorkoutId: f.workout.id,
            activityId: f.activity.id,
            source: 'MANUAL',
            role: 'PRIMARY',
          },
        });
      await matcher().tryAutoLinkForActivity(f.activity.id);
      expect(
        await prisma.planWorkoutActivityLink.count({
          where: { source: 'AUTO' },
        }),
      ).toBe(0);
      expect(
        await prisma.planWorkout.findUnique({
          where: { id: f.independent.id },
        }),
      ).toMatchObject({ status: 'PLANNED', completedAt: null });
    },
  );

  it.each(['create', 'update'])(
    'returns the transaction snapshot after %s and load estimation',
    async (operation) => {
      estimateWrites = true;
      let row = await create();
      if (operation === 'update')
        row = await service.updateImportedWorkout({
          userId: 'user',
          workoutId: row.id,
          preferredSessionIndex: 1,
          scheduledDate: new Date('2026-07-06'),
          targetPlanId: null,
          targetPlanStartDate: null,
          sportType: 'RUN',
          status: 'PLANNED',
          blocks: [],
          dayOffset: 0,
          expectedUpdatedAt: row.updatedAt,
        });
      const stored = await prisma.planWorkout.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(row.updatedAt).toEqual(stored.updatedAt);
      expect(row.updatedAt).toEqual(estimatedAt);
      expect(row.estimatedLoad).toBe(50);
      expect(row.revision).toBe(operation === 'update' ? 2 : 1);
    },
  );

  it('rolls back the course when mapping persistence fails', async () => {
    await expect(
      service.createIndependentWorkout(
        {
          userId: 'user',
          scheduledDate: new Date('2026-07-06'),
          sportType: 'RUN',
          text: 'Run',
          blocks: [],
        },
        (row) => ({
          userId: 'missing-user',
          provider: 'intervals_icu',
          planWorkoutId: row.id,
          externalEventId: '100',
        }),
      ),
    ).rejects.toThrow();
    expect(await prisma.planWorkout.count()).toBe(0);
    expect(await prisma.planWorkoutExternalMapping.count()).toBe(0);
  });

  it('keeps the remote identity after deleting the unchanged local endpoint', async () => {
    const row = await create();
    await expect(
      service.deleteSyncedWorkout({
        userId: 'user',
        workoutId: row.id,
        updatedAt: row.updatedAt,
        revision: row.revision,
      }),
    ).resolves.toBe('deleted');
    expect(await prisma.planWorkout.count()).toBe(0);
    expect(await prisma.planWorkoutExternalMapping.findFirst()).toMatchObject({
      planWorkoutId: null,
      externalEventId: '100',
    });
  });

  it('does not delete a course edited after the synchronization snapshot', async () => {
    const row = await create();
    await prisma.planWorkout.update({
      where: { id: row.id },
      data: { name: 'Keep this edit', revision: { increment: 1 } },
    });
    await expect(
      service.deleteSyncedWorkout({
        userId: 'user',
        workoutId: row.id,
        updatedAt: row.updatedAt,
        revision: row.revision,
      }),
    ).resolves.toBe('changed');
    expect(
      await prisma.planWorkout.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ name: 'Keep this edit' });
  });

  it("does not delete another athlete's course", async () => {
    const row = await create();
    await expect(
      service.deleteSyncedWorkout({ userId: 'other', workoutId: row.id }),
    ).resolves.toBe('missing');
    expect(await prisma.planWorkout.count()).toBe(1);
  });

  it('retains completed training history', async () => {
    const row = await create();
    await prisma.planWorkout.update({
      where: { id: row.id },
      data: { status: 'DONE' },
    });
    await expect(
      service.deleteSyncedWorkout({ userId: 'user', workoutId: row.id }),
    ).resolves.toBe('protected');
    expect(await prisma.planWorkout.count()).toBe(1);
  });
});
