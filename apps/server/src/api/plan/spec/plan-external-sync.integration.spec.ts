import { PlanCalendarValidationService } from '../application/plan-calendar-validation.service';
import { PlanCalendarRepository } from '../persistence/plan-calendar.repository';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PLAN_WORKOUTS_CHANGED_EVENT } from '../events/plan.events';
import { CoachBranchingService } from '../../ai/coach-branching.service';
import { PlanWorkoutsChangedEvent } from '../events/plan.events';
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
import { isPrismaSerializableConflict } from '@/prisma/prisma-transaction-errors';
import { readFileSync } from 'node:fs';
import {
  planStartFixture,
  raceWithPlanWriteCheckpoint,
  raceWithUncommittedPlanWrite,
} from './plan-start.fixture';

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
      new PlanCalendarValidationService(new PlanCalendarRepository()),
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

  it('rejects an imported course on the target plan rest day and rolls back the independent course', async () => {
    const before = await create();
    const plan = await prisma.plan.create({
      data: {
        userId: 'user',
        title: 'Rest day plan',
        periodWeeks: 1,
        status: 'ACTIVE',
        startDate: new Date('2026-11-22'),
        generationMetadata: {
          scheduleConstraints: {
            version: 1,
            revision: 1,
            calendarTimeZone: 'Asia/Shanghai',
            fixedRestWeekdays: [3, 5],
            unavailableDates: [],
            availableDateOverrides: [],
            effectiveFrom: '2026-11-22',
            confirmation: {
              source: 'USER',
              reference: 'synthetic-confirmation',
            },
          },
        },
      },
    });
    await expect(
      service.updateImportedWorkout({
        userId: 'user',
        workoutId: before.id,
        preferredSessionIndex: 1,
        scheduledDate: new Date('2026-11-25'),
        targetPlanId: plan.id,
        targetPlanStartDate: plan.startDate,
        sportType: 'RUN',
        text: 'Remote session',
        status: 'PLANNED',
        blocks: [],
        structureKind: 'FREEFORM',
        plannedDurationSeconds: 1800,
        dayOffset: 3,
        expectedUpdatedAt: before.updatedAt,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'PLAN_SCHEDULE_INVALID',
        issues: [{ code: 'FIXED_REST_DAY', date: '2026-11-25' }],
      },
    });
    expect(await service.findLocalWorkout('user', before.id)).toMatchObject({
      planId: null,
      scheduledDate: new Date('2026-07-06'),
      text: 'Run',
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

  function matcher(
    workouts = new PlanWorkoutRepository(prisma as never),
    links = new PlanActivityLinkRepository(prisma as never),
  ) {
    return new PlanLinkMatcherService(
      prisma as never,
      { getPreferredTimezone: async () => 'UTC' } as never,
      new PlanRepository(prisma as never),
      workouts,
      links,
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

  it('recovers a recently ready activity after the initial registration retries are exhausted', async () => {
    const f = await independentScenario();
    await prisma.activity.update({
      where: { id: f.activity.id },
      data: { processingUpdatedAt: new Date() },
    });
    const conflict = Object.assign(new Error('serialization conflict'), {
      code: 'P2034',
    });
    const transaction = jest.spyOn(prisma, '$transaction');
    const matching = matcher();
    try {
      transaction
        .mockRejectedValueOnce(conflict)
        .mockRejectedValueOnce(conflict)
        .mockRejectedValueOnce(conflict);
      await expect(matching.tryAutoLinkForActivity(f.activity.id)).rejects.toBe(
        conflict,
      );
    } finally {
      transaction.mockRestore();
    }
    expect(
      await prisma.planActivityMatchState.findUnique({
        where: { activityId: f.activity.id },
      }),
    ).toBeNull();

    await matching.rescanPendingMatches();
    await matching.rescanPendingMatches();

    const links = await prisma.planWorkoutActivityLink.findMany({
      where: { activityId: f.activity.id, unlinkedAt: null },
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      source: 'AUTO_MATCH',
      planWorkoutId: f.independent.id,
    });
    expect(
      await prisma.planWorkout.findUniqueOrThrow({
        where: { id: f.independent.id },
      }),
    ).toMatchObject({ status: 'DONE' });
  });

  it('automatically completes an independent ordinary course without a training plan', async () => {
    const f = await independentScenario();
    await matcher().tryAutoLinkForActivity(f.activity.id);
    expect(
      await manualLinks().getActivityPlanLinkByHash('user', f.activity.hashId),
    ).toMatchObject({
      linkedPlanWorkout: {
        planId: null,
        workoutId: f.independent.id,
        source: 'AUTO_MATCH',
        status: 'DONE',
      },
    });
    expect(await matcher().listMatchingReviews('user')).toEqual([]);
  });

  it('lets an athlete resolve a Coach review for a course with unknown sport through the manual candidate list', async () => {
    const f = await independentScenario();
    await prisma.planWorkout.update({
      where: { id: f.independent.id },
      data: { sportType: 'UNKNOWN', plannedDurationSeconds: null },
    });
    const matching = matcher();
    await matching.tryAutoLinkForActivity(f.activity.id);
    expect(await matching.listMatchingReviews('user')).toEqual([
      expect.objectContaining({
        reason: 'INSUFFICIENT_EVIDENCE',
        candidates: [expect.objectContaining({ workoutId: f.independent.id })],
      }),
    ]);
    const write = manualLinks();
    expect(
      (await write.listActivityPlanCandidatesByHash('user', f.activity.hashId))
        .candidates,
    ).toEqual([
      expect.objectContaining({
        workoutId: f.independent.id,
        sportType: 'UNKNOWN',
      }),
    ]);
    await write.replaceActivityPlanLinkByHash('user', f.activity.hashId, {
      workoutId: f.independent.id,
    });
    expect(
      (await write.getActivityPlanLinkByHash('user', f.activity.hashId))
        .linkedPlanWorkout,
    ).toMatchObject({
      workoutId: f.independent.id,
      source: 'MANUAL',
      status: 'DONE',
    });
    expect(await matching.listMatchingReviews('user')).toEqual([]);
  });

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
        processingStatus: 'READY',
        status: 'FINISHED',
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

  it('keeps equal plan and independent candidates unresolved and repeated analysis is idempotent', async () => {
    const f = await matchingScenario();
    await matcher().tryAutoLinkForActivity(f.activity.id);
    await matcher().tryAutoLinkForActivity(f.activity.id);
    expect(await prisma.planWorkoutActivityLink.count()).toBe(0);
    expect(await matcher().listMatchingReviews('user')).toEqual([
      expect.objectContaining({
        reason: 'AMBIGUOUS',
        candidates: expect.arrayContaining([
          expect.objectContaining({ workoutId: f.workout.id }),
          expect.objectContaining({ workoutId: f.independent.id }),
        ]),
      }),
    ]);
    expect(await prisma.planWorkout.count({ where: { status: 'DONE' } })).toBe(
      0,
    );
  });

  it('creates only one inferred association across concurrent analysis workers', async () => {
    const f = await independentScenario();
    await Promise.all([
      matcher().tryAutoLinkForActivity(f.activity.id),
      matcher().tryAutoLinkForActivity(f.activity.id),
    ]);
    expect(
      await prisma.planWorkoutActivityLink.count({
        where: { unlinkedAt: null },
      }),
    ).toBe(1);
    expect(await prisma.planWorkoutActivityLink.findFirst()).toMatchObject({
      source: 'AUTO_MATCH',
    });
  });

  it('leaves two indistinguishable activities competing for one course unresolved across workers', async () => {
    const f = await independentScenario();
    const other = await prisma.activity.create({
      data: {
        hashId: 'second-run',
        userId: 'user',
        sportType: 'RUN',
        startTime: f.activity.startTime,
        timerTime: 1800,
        state: 1,
        timezone: 'Asia/Shanghai',
        processingStatus: 'READY',
      },
    });
    await Promise.all([
      matcher().tryAutoLinkForActivity(f.activity.id),
      matcher().tryAutoLinkForActivity(other.id),
    ]);
    expect(
      await prisma.planWorkoutActivityLink.count({
        where: { unlinkedAt: null },
      }),
    ).toBe(0);
    expect(await matcher().listMatchingReviews('user')).toHaveLength(2);
  });

  it('compares courses in all active plans without privileging the first plan', async () => {
    const f = await matchingScenario();
    await prisma.planWorkout.update({
      where: { id: f.independent.id },
      data: { plannedDurationSeconds: 7200 },
    });
    const second = await prisma.plan.create({
      data: {
        userId: 'user',
        periodWeeks: 1,
        title: 'Second',
        status: 'ACTIVE',
        startDate: new Date('2026-07-06'),
      },
    });
    await prisma.planWorkout.update({
      where: { id: f.workout.id },
      data: { planId: second.id },
    });
    await matcher().tryAutoLinkForActivity(f.activity.id);
    expect(
      await prisma.planWorkoutActivityLink.findFirst({
        where: { unlinkedAt: null },
      }),
    ).toMatchObject({ planId: second.id, planWorkoutId: f.workout.id });
    expect(
      (
        await manualLinks().listActivityPlanCandidatesByHash(
          'user',
          f.activity.hashId,
        )
      ).candidates,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workoutId: f.independent.id }),
      ]),
    );
  });

  it('pairs two activities with two distinct courses as one day-wide assignment', async () => {
    const f = await matchingScenario();
    await prisma.planWorkout.update({
      where: { id: f.independent.id },
      data: { plannedDurationSeconds: 3600 },
    });
    const second = await prisma.activity.create({
      data: {
        hashId: 'long-run',
        userId: 'user',
        sportType: 'RUN',
        timerTime: 3600,
        startTime: f.activity.startTime,
        timezone: f.activity.timezone,
        state: 1,
        processingStatus: 'READY',
      },
    });
    await matcher().tryAutoLinkForActivity(f.activity.id);
    expect(
      await prisma.planWorkoutActivityLink.findMany({
        where: { unlinkedAt: null },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityId: f.activity.id,
          planWorkoutId: f.workout.id,
        }),
        expect.objectContaining({
          activityId: second.id,
          planWorkoutId: f.independent.id,
        }),
      ]),
    );
    expect(
      await prisma.planWorkoutActivityLink.count({
        where: { unlinkedAt: null },
      }),
    ).toBe(2);
  });

  it('rechecks a previous inference when another provider replaces the primary activity dataset', async () => {
    const f = await independentScenario();
    const matching = matcher();
    await matching.tryAutoLinkForActivity(f.activity.id);
    const activityService = Object.assign(
      Object.create(ActivityService.prototype) as ActivityService,
      {
        prisma,
        planLinkMatcher: matching,
        metricsPipeline: {
          runByMode: async () => {
            await prisma.activity.update({
              where: { id: f.activity.id },
              data: { timerTime: 3600 },
            });
          },
        },
      },
    );
    await activityService.runLightMetricsPipeline(f.activity.id, 'user');
    expect(
      (await manualLinks().getActivityPlanLinkByHash('user', f.activity.hashId))
        .linkedPlanWorkout,
    ).toBeNull();
    expect(
      await prisma.planWorkout.findUnique({ where: { id: f.independent.id } }),
    ).toMatchObject({ status: 'PLANNED', completedAt: null });
  });

  it('matches a Garmin activity to an Intervals course without counting its merged duplicate twice', async () => {
    const f = await independentScenario();
    await prisma.activity.update({
      where: { id: f.activity.id },
      data: { thirdPartyProvider: 'garmin' },
    });
    await prisma.planWorkoutExternalMapping.create({
      data: {
        userId: 'user',
        provider: 'intervals_icu',
        planWorkoutId: f.independent.id,
        externalEventId: 'intervals-course',
      },
    });
    await prisma.activity.create({
      data: {
        userId: 'user',
        hashId: 'merged-intervals-copy',
        thirdPartyProvider: 'intervals_icu',
        state: 0,
        mergedIntoActivityId: f.activity.id,
        processingStatus: 'READY',
        sportType: 'RUN',
        timerTime: 1800,
        startTime: f.activity.startTime,
        timezone: f.activity.timezone,
      },
    });
    const matching = matcher();
    await matching.tryAutoLinkForActivity(f.activity.id);
    await matching.tryAutoLinkForActivity(f.activity.id);
    expect(
      (await manualLinks().getActivityPlanLinkByHash('user', f.activity.hashId))
        .linkedPlanWorkout,
    ).toMatchObject({
      workoutId: f.independent.id,
      source: 'AUTO_MATCH',
      status: 'DONE',
    });
    expect(
      await prisma.planWorkoutActivityLink.count({
        where: { unlinkedAt: null },
      }),
    ).toBe(1);
    expect(await matching.listMatchingReviews('user')).toEqual([]);
  });

  it('keeps the existing Intervals match when a late Garmin course has an unknown prescription', async () => {
    const f = await independentScenario();
    const matching = matcher();
    await prisma.planWorkoutExternalMapping.create({
      data: {
        userId: 'user',
        provider: 'intervals_icu',
        planWorkoutId: f.independent.id,
        externalEventId: 'intervals-course',
      },
    });
    await matching.tryAutoLinkForActivity(f.activity.id);
    const garmin = await service.createIndependentWorkout(
      {
        userId: 'user',
        scheduledDate: new Date('2026-07-06'),
        sportType: 'RUN',
        structureKind: 'FREEFORM',
        name: 'Garmin run',
        text: 'Run',
        blocks: [],
      },
      (stored) => ({
        userId: 'user',
        provider: 'garmin',
        planWorkoutId: stored.id,
        externalEventId: 'garmin-course',
        externalSourceKey: 'garmin-schedule:course',
      }),
    );
    const events = new EventEmitter2();
    events.on(PLAN_WORKOUTS_CHANGED_EVENT, (event) =>
      matching.onWorkoutsChanged(event),
    );
    Object.assign(service, { events });
    try {
      await service.notifyWorkoutsCommitted(
        'user',
        [garmin.id],
        'garmin_schedule_import',
      );
    } finally {
      Object.assign(service, { events: undefined });
    }
    expect(
      (await manualLinks().getActivityPlanLinkByHash('user', f.activity.hashId))
        .linkedPlanWorkout,
    ).toMatchObject({
      workoutId: f.independent.id,
      source: 'AUTO_MATCH',
      status: 'DONE',
    });
    expect(await matching.listMatchingReviews('user')).toEqual([]);
    await expect(
      prisma.planWorkout.findUniqueOrThrow({ where: { id: garmin.id } }),
    ).resolves.toMatchObject({ status: 'PLANNED' });
  });

  it('reconciles an activity uploaded before its course was imported', async () => {
    const f = await independentScenario();
    await prisma.planWorkout.update({
      where: { id: f.independent.id },
      data: { scheduledDate: new Date('2026-07-07') },
    });
    const matching = matcher();
    await matching.tryAutoLinkForActivity(f.activity.id);
    expect(
      await prisma.planActivityMatchState.findUnique({
        where: { activityId: f.activity.id },
      }),
    ).toMatchObject({ outcome: 'NO_MATCH' });
    await prisma.planWorkout.update({
      where: { id: f.independent.id },
      data: { scheduledDate: new Date('2026-07-06') },
    });
    await matching.onWorkoutsChanged(
      new PlanWorkoutsChangedEvent('user', 'external_import', [
        f.independent.id,
      ]),
    );
    expect(
      await prisma.planWorkoutActivityLink.findFirst({
        where: { unlinkedAt: null },
      }),
    ).toMatchObject({ planWorkoutId: f.independent.id });
  });

  it('keeps a matched course occupied and uses the late course for a new activity', async () => {
    const f = await independentScenario();
    const matching = matcher();
    await matching.tryAutoLinkForActivity(f.activity.id);
    const competitor = await prisma.planWorkout.create({
      data: {
        userId: 'user',
        dayOffset: 0,
        sportType: 'RUN',
        structureKind: 'FREEFORM',
        plannedDurationSeconds: 1800,
        scheduledDate: new Date('2026-07-06'),
        text: 'Second run',
      },
    });
    await matching.onWorkoutsChanged(
      new PlanWorkoutsChangedEvent('user', 'external_import', [competitor.id]),
    );
    await matching.rescanPendingMatches();
    const second = await prisma.activity.create({
      data: {
        hashId: 'separate-second-run',
        userId: 'user',
        sportType: 'RUN',
        startTime: f.activity.startTime,
        timezone: f.activity.timezone,
        timerTime: 1800,
        state: 1,
        processingStatus: 'READY',
      },
    });
    await matching.tryAutoLinkForActivity(second.id);
    const readLink = async (hash: string) =>
      (await manualLinks().getActivityPlanLinkByHash('user', hash))
        .linkedPlanWorkout;
    await expect(readLink(f.activity.hashId)).resolves.toMatchObject({
      workoutId: f.independent.id,
      source: 'AUTO_MATCH',
      status: 'DONE',
    });
    await expect(readLink(second.hashId)).resolves.toMatchObject({
      workoutId: competitor.id,
      source: 'AUTO_MATCH',
      status: 'DONE',
    });
    expect(await matching.listMatchingReviews('user')).toEqual([]);
  });

  it('preserves manual correction and remembers explicit unlink across event and scheduled reconciliation', async () => {
    const f = await independentScenario();
    const matching = matcher();
    await matching.tryAutoLinkForActivity(f.activity.id);
    await manualLinks().removeActivityPlanLinkByHash('user', f.activity.hashId);
    await matching.tryAutoLinkForActivity(f.activity.id);
    await matching.rescanPendingMatches();
    await matching.onWorkoutsChanged(
      new PlanWorkoutsChangedEvent('user', 'workout_update', [
        f.independent.id,
      ]),
    );
    expect(
      await prisma.planWorkoutActivityLink.count({
        where: { unlinkedAt: null },
      }),
    ).toBe(0);
    expect(await matching.listMatchingReviews('user')).toEqual([]);
    await manualLinks().replaceActivityPlanLinkByHash(
      'user',
      f.activity.hashId,
      { workoutId: f.independent.id },
    );
    await matching.tryAutoLinkForActivity(f.activity.id);
    expect(
      await prisma.planWorkoutActivityLink.findFirst({
        where: { unlinkedAt: null },
      }),
    ).toMatchObject({ source: 'MANUAL' });
  });

  it('allows manual correction of an inferred link while retaining legacy recorded binding protection', async () => {
    const f = await independentScenario();
    await matcher().tryAutoLinkForActivity(f.activity.id);
    const replacement = await prisma.planWorkout.create({
      data: {
        userId: 'user',
        dayOffset: 0,
        sportType: 'RUN',
        scheduledDate: new Date('2026-07-06'),
        text: 'Replacement',
      },
    });
    await manualLinks().replaceActivityPlanLinkByHash(
      'user',
      f.activity.hashId,
      { workoutId: replacement.id },
    );
    expect(
      await prisma.planWorkout.findUnique({ where: { id: f.independent.id } }),
    ).toMatchObject({ status: 'PLANNED' });
    await prisma.planWorkoutActivityLink.updateMany({
      where: { unlinkedAt: null },
      data: { source: 'AUTO' },
    });
    await expect(
      manualLinks().removeActivityPlanLinkByHash('user', f.activity.hashId),
    ).rejects.toThrow('locked');
    await matcher().tryAutoLinkForActivity(f.activity.id);
    expect(
      await prisma.planWorkoutActivityLink.findFirst({
        where: { unlinkedAt: null },
      }),
    ).toMatchObject({ planWorkoutId: replacement.id, source: 'AUTO' });
  });

  it('serializes an explicit manual choice against automatic analysis', async () => {
    const f = await independentScenario();
    await Promise.all([
      matcher().tryAutoLinkForActivity(f.activity.id),
      manualLinks().replaceActivityPlanLinkByHash('user', f.activity.hashId, {
        workoutId: f.independent.id,
      }),
    ]);
    expect(
      await prisma.planWorkoutActivityLink.findMany({
        where: { unlinkedAt: null },
      }),
    ).toEqual([
      expect.objectContaining({
        source: 'MANUAL',
        planWorkoutId: f.independent.id,
      }),
    ]);
  });

  it('exposes ambiguity through Coach and clears the reminder immediately after a manual choice', async () => {
    const f = await matchingScenario();
    const matching = matcher();
    await matching.tryAutoLinkForActivity(f.activity.id);
    const coach = new CoachBranchingService(
      prisma as never,
      undefined as never,
      undefined as never,
      { findNextCycleEligiblePlanIds: async () => [] } as never,
      undefined as never,
      undefined,
      undefined,
      matching,
    );
    expect(
      (await coach.listPendingDecisions({ userId: 'user' })).workoutMatching,
    ).toEqual([expect.objectContaining({ reason: 'AMBIGUOUS' })]);
    expect(
      (await coach.listPendingDecisions({ userId: 'other' })).workoutMatching,
    ).toEqual([]);
    await manualLinks().replaceActivityPlanLinkByHash(
      'user',
      f.activity.hashId,
      { workoutId: f.independent.id },
    );
    expect(
      (await coach.listPendingDecisions({ userId: 'user' })).workoutMatching,
    ).toEqual([]);
  });

  it('rechecks feature-owned unmatched activities during scheduled recovery', async () => {
    const f = await independentScenario();
    await prisma.planWorkout.update({
      where: { id: f.independent.id },
      data: { plannedDurationSeconds: null },
    });
    const matching = matcher();
    await matching.tryAutoLinkForActivity(f.activity.id);
    expect(await matching.listMatchingReviews('user')).toEqual([
      expect.objectContaining({ reason: 'INSUFFICIENT_EVIDENCE' }),
    ]);
    await prisma.planWorkout.update({
      where: { id: f.independent.id },
      data: { plannedDurationSeconds: 1800 },
    });
    await matching.rescanPendingMatches();
    expect(
      await prisma.planWorkoutActivityLink.findFirst({
        where: { unlinkedAt: null },
      }),
    ).toMatchObject({ source: 'AUTO_MATCH' });
    expect(await matching.listMatchingReviews('user')).toEqual([]);
  });

  it('recomputes the other activity after a manual choice resolves a competing day', async () => {
    const f = await matchingScenario();
    const matching = matcher();
    const second = await prisma.activity.create({
      data: {
        hashId: 'other-same-day',
        userId: 'user',
        sportType: 'RUN',
        timerTime: 1800,
        startTime: f.activity.startTime,
        timezone: f.activity.timezone,
        state: 1,
        processingStatus: 'READY',
      },
    });
    await matching.tryAutoLinkForActivity(f.activity.id);
    expect(await matching.listMatchingReviews('user')).toHaveLength(2);
    await manualLinks().replaceActivityPlanLinkByHash(
      'user',
      f.activity.hashId,
      { workoutId: f.workout.id },
    );
    await matching.onWorkoutsChanged(
      new PlanWorkoutsChangedEvent(
        'user',
        'activity_link',
        [f.workout.id],
        f.plan.id,
      ),
    );
    expect(
      await prisma.planWorkoutActivityLink.findFirst({
        where: { activityId: second.id, unlinkedAt: null },
      }),
    ).toMatchObject({ planWorkoutId: f.independent.id, source: 'AUTO_MATCH' });
    expect(await matching.listMatchingReviews('user')).toEqual([]);
  });

  it('uses the athlete date consistently in Coach and manual candidates when browser timezone differs', async () => {
    const f = await matchingScenario();
    await prisma.activity.update({
      where: { id: f.activity.id },
      data: { timezone: null, startTime: new Date('2026-07-05T16:30:00Z') },
    });
    const matching = matcher();
    Object.assign(matching, {
      userService: { getPreferredTimezone: async () => 'Asia/Shanghai' },
    });
    await matching.tryAutoLinkForActivity(f.activity.id);
    expect(await matching.listMatchingReviews('user')).toEqual([
      expect.objectContaining({ date: '2026-07-06' }),
    ]);
    const write = manualLinks();
    Object.assign(write, {
      userService: { getPreferredTimezone: async () => 'Asia/Shanghai' },
    });
    const candidates = await write.listActivityPlanCandidatesByHash(
      'user',
      f.activity.hashId,
      'America/New_York',
    );
    expect(candidates.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workoutId: f.workout.id }),
        expect.objectContaining({ workoutId: f.independent.id }),
      ]),
    );
  });

  it('does not let invalid activity states starve scheduled matching recovery', async () => {
    const f = await independentScenario();
    const matching = matcher();
    await prisma.planWorkout.update({
      where: { id: f.independent.id },
      data: { plannedDurationSeconds: null },
    });
    await matching.tryAutoLinkForActivity(f.activity.id);
    for (let i = 0; i < 100; i++) {
      const stale = await prisma.activity.create({
        data: {
          userId: 'user',
          hashId: 'stale-' + i,
          state: 0,
          mergedIntoActivityId: f.activity.id,
        },
      });
      await prisma.planActivityMatchState.create({
        data: {
          activityId: stale.id,
          userId: 'user',
          outcome: 'NO_MATCH',
          reason: 'PENDING',
          updatedAt: new Date('2020-01-01'),
        },
      });
    }
    await prisma.planWorkout.update({
      where: { id: f.independent.id },
      data: { plannedDurationSeconds: 1800 },
    });
    await matching.rescanPendingMatches();
    expect(
      await prisma.planWorkoutActivityLink.findFirst({
        where: { activityId: f.activity.id, unlinkedAt: null },
      }),
    ).toMatchObject({ source: 'AUTO_MATCH' });
  });

  it('publishes legacy course-side unlink after commit and immediately rematches the remaining activity', async () => {
    const f = await matchingScenario();
    const matching = matcher();
    const write = manualLinks();
    await prisma.planWorkout.update({
      where: { id: f.independent.id },
      data: { plannedDurationSeconds: 7200 },
    });
    const linked = await write.linkWorkoutActivity(
      'user',
      f.plan.id,
      f.workout.id,
      { activityId: f.activity.id },
    );
    const other = await prisma.activity.create({
      data: {
        userId: 'user',
        hashId: 'waiting-run',
        sportType: 'RUN',
        startTime: f.activity.startTime,
        timezone: f.activity.timezone,
        timerTime: 1800,
        state: 1,
        processingStatus: 'READY',
      },
    });
    await matching.tryAutoLinkForActivity(other.id);
    expect(
      await prisma.planWorkoutActivityLink.count({
        where: { activityId: other.id, unlinkedAt: null },
      }),
    ).toBe(0);
    const events = new EventEmitter2();
    events.on(PLAN_WORKOUTS_CHANGED_EVENT, (event) =>
      matching.onWorkoutsChanged(event),
    );
    Object.assign(write, { events });
    await write.unlinkWorkoutActivity(
      'user',
      f.plan.id,
      f.workout.id,
      linked.link!.id,
    );
    expect(
      await prisma.planWorkoutActivityLink.findFirst({
        where: { activityId: other.id, unlinkedAt: null },
      }),
    ).toMatchObject({ planWorkoutId: f.workout.id, source: 'AUTO_MATCH' });
    expect(
      await prisma.planWorkoutActivityLink.count({
        where: { activityId: f.activity.id, unlinkedAt: null },
      }),
    ).toBe(0);
  });

  const nativeIt = process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN
    ? it
    : it.skip;

  nativeIt('recovers from a concurrent match-state write without duplicating the workout completion', async () => {
    const { activity, independent } = await independentScenario();
    const where = { activityId: activity.id };
    await prisma.planActivityMatchState.create({
      data: {
        ...where,
        userId: 'user',
        outcome: 'NO_MATCH',
        reason: 'PENDING',
        candidateWorkoutIds: [],
      },
    });

    const links = new PlanActivityLinkRepository(prisma as never);
    const putMatchState = links.putMatchState.bind(links);
    const conflicts: unknown[] = [];
    jest.spyOn(links, 'putMatchState').mockImplementation(async (...args) => {
      try {
        return await putMatchState(...args);
      } catch (error) {
        conflicts.push(error);
        throw error;
      }
    });
    const matching = matcher(undefined, links);
    const result = await raceWithUncommittedPlanWrite(
      prisma,
      (tx) =>
        tx.planActivityMatchState.update({
          where,
          data: { reason: 'NO_ELIGIBLE_WORKOUT' },
        }),
      () => matching.tryAutoLinkForActivity(activity.id),
    );

    expect(result.status).toBe('fulfilled');
    expect(conflicts.map(isPrismaSerializableConflict)).toEqual([true]);
    await expect(
      prisma.planActivityMatchState.findUniqueOrThrow({ where }),
    ).resolves.toMatchObject({ outcome: 'AUTO_LINKED', reason: 'MATCHED' });
    await expect(
      prisma.planWorkoutActivityLink.findMany({ where }),
    ).resolves.toMatchObject([
      { planWorkoutId: independent.id, source: 'AUTO_MATCH', unlinkedAt: null },
    ]);
    await expect(
      prisma.planWorkout.findUniqueOrThrow({ where: { id: independent.id } }),
    ).resolves.toMatchObject({ status: 'DONE' });
  });

  nativeIt('preserves an automatic activity match when skip arrives during completion', async () => {
    const f = await matchingScenario();
    const { service: plans } = planStartFixture(prisma);
    await prisma.planWorkout.update({
      where: { id: f.independent.id },
      data: { plannedDurationSeconds: 7200 },
    });
    const workouts = new PlanWorkoutRepository(prisma as never);
    const markDone = workouts.markDoneIfApplicable.bind(workouts);
    const skip = await raceWithPlanWriteCheckpoint(
      prisma,
      (hold) => {
        jest.spyOn(workouts, 'markDoneIfApplicable').mockImplementation(async (...args) => {
          const done = await markDone(...args);
          if (done) await hold();
          return done;
        });
        return matcher(workouts).tryAutoLinkForActivity(f.activity.id);
      },
      () => plans.updateWorkoutStatus('user', f.plan.id, f.workout.id, 'SKIPPED'),
    );
    expect(skip).toMatchObject({
      status: 'rejected', reason: { message: 'Only planned workouts can be changed' },
    });
    await expect(prisma.planWorkout.findUniqueOrThrow({ where: { id: f.workout.id } }))
      .resolves.toMatchObject({ status: 'DONE', skippedAt: null });
    await expect(prisma.planWorkoutActivityLink.findFirst({
      where: { activityId: f.activity.id, unlinkedAt: null },
    })).resolves.toMatchObject({
      planWorkoutId: f.workout.id, source: 'AUTO_MATCH', autoMarkedWorkoutDone: true,
    });
  });

  nativeIt.each(['replace', 'unlink'])(
    'preserves explicit completion during activity %s',
    async (mode) => {
      const f = await matchingScenario();
      const { write, service: plans } = planStartFixture(prisma);
      await prisma.planWorkoutActivityLink.create({
        data: {
          planId: f.plan.id,
          planWorkoutId: f.workout.id,
          activityId: f.activity.id,
          source: 'MANUAL',
          role: 'SECONDARY',
        },
      });
      const result = await raceWithUncommittedPlanWrite(
        prisma,
        (tx) => write.updateWorkoutStatus('user', f.plan.id, f.workout.id, 'DONE', undefined, { tx }),
        () => mode === 'replace'
          ? plans.replaceActivityPlanLinkByHash('user', f.activity.hashId, { workoutId: f.independent.id })
          : plans.removeActivityPlanLinkByHash('user', f.activity.hashId),
      );
      expect(result.status).toBe('fulfilled');
      await expect(prisma.planWorkout.findUniqueOrThrow({ where: { id: f.workout.id } }))
        .resolves.toMatchObject({ status: 'DONE', revision: f.workout.revision + 1 });
      await expect(prisma.planWorkoutActivityLink.findFirst({
        where: { activityId: f.activity.id, unlinkedAt: null },
      })).resolves.toEqual(
        mode === 'replace' ? expect.objectContaining({ planWorkoutId: f.independent.id }) : null,
      );
    },
  );

  nativeIt(
    'preserves a user completion committed between activity evidence and workout locking',
    async () => {
      const f = await matchingScenario();
      const { service: plans } = planStartFixture(prisma);
      await prisma.planWorkout.update({
        where: { id: f.independent.id },
        data: { plannedDurationSeconds: 7200 },
      });
      const workouts = new PlanWorkoutRepository(prisma as never);
      const lock = workouts.lockForUpdate.bind(workouts);
      let reachedWorkoutLock!: () => void;
      let resumeMatching!: () => void;
      const beforeWorkoutLock = new Promise<void>((resolve) => { reachedWorkoutLock = resolve; });
      const proceed = new Promise<void>((resolve) => { resumeMatching = resolve; });
      jest.spyOn(workouts, 'lockForUpdate').mockImplementationOnce(async (id, tx) => {
        reachedWorkoutLock();
        await proceed;
        return lock(id, tx);
      });
      const matching = matcher(workouts).tryAutoLinkForActivity(f.activity.id);
      try {
        await Promise.race([
          beforeWorkoutLock,
          matching.then(() => { throw new Error('Matching did not reach the workout lock'); }),
        ]);
        await plans.updateWorkoutStatus('user', f.plan.id, f.workout.id, 'DONE');
      } finally {
        resumeMatching();
        await matching;
      }
      await expect(prisma.planWorkout.findUniqueOrThrow({ where: { id: f.workout.id } }))
        .resolves.toMatchObject({ status: 'DONE', revision: f.workout.revision + 1 });
      await expect(prisma.planWorkoutActivityLink.findFirst({
        where: { planWorkoutId: f.workout.id, unlinkedAt: null },
      })).resolves.toBeNull();
    },
  );

  nativeIt(
    'never adopts an unlocked course inserted after the candidate snapshot or claims its user completion',
    async () => {
      const f = await independentScenario();
      await prisma.planWorkout.update({
        where: { id: f.independent.id },
        data: { scheduledDate: new Date('2026-07-07') },
      });
      const workouts = new PlanWorkoutRepository(prisma as never);
      const find = workouts.findMany.bind(workouts);
      let inspected!: () => void;
      let resume!: () => void;
      const snapshot = new Promise<void>((done) => (inspected = done));
      const released = new Promise<void>((done) => (resume = done));
      jest
        .spyOn(workouts, 'findMany')
        .mockImplementationOnce(async (args, tx) => {
          const rows = await find(args, tx);
          inspected();
          await released;
          return rows;
        });
      const matching = matcher(workouts).tryAutoLinkForActivity(f.activity.id);
      await snapshot;
      let importedId = '';
      try {
        const imported = await service.createIndependentWorkout({
          userId: 'user',
          scheduledDate: new Date('2026-07-06'),
          sportType: 'RUN',
          structureKind: 'FREEFORM',
          plannedDurationSeconds: 1800,
          text: 'Late course',
          blocks: [],
        });
        importedId = imported.id;
        await prisma.planWorkout.update({
          where: { id: importedId },
          data: { status: 'DONE', completedAt: f.activity.startTime },
        });
      } finally {
        resume();
      }
      await matching;
      await matcher().onWorkoutsChanged(
        new PlanWorkoutsChangedEvent('user', 'external_import', [importedId]),
      );
      expect(
        await prisma.planWorkoutActivityLink.count({
          where: { unlinkedAt: null },
        }),
      ).toBe(0);
      expect(
        await prisma.planWorkout.findUnique({ where: { id: importedId } }),
      ).toMatchObject({ status: 'DONE', completedAt: f.activity.startTime });
    },
  );

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
      await prisma.planWorkout.update({
        where: { id: f.independent.id },
        data: { scheduledDate: new Date('2026-07-07') },
      });
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
          where: { source: 'AUTO_MATCH' },
        }),
      ).toBe(0);
      expect(
        await prisma.planWorkout.findUnique({
          where: { id: f.independent.id },
        }),
      ).toMatchObject({ status: 'PLANNED', completedAt: null });
    },
  );

  it.each(['DONE', 'SKIPPED', 'MOVED', 'IN_PROGRESS', 'LINKED'])(
    'protects an independent imported course from remote overwrite when %s',
    async (state) => {
      const f = await independentScenario();
      if (state === 'LINKED')
        await prisma.planWorkoutActivityLink.create({
          data: {
            planWorkoutId: f.independent.id,
            planId: null,
            activityId: f.activity.id,
            source: 'MANUAL',
            role: 'SECONDARY',
          },
        });
      else
        await prisma.planWorkout.update({
          where: { id: f.independent.id },
          data: {
            status: state as 'DONE',
            completedAt: state === 'DONE' ? f.activity.startTime : null,
          },
        });
      const before = await prisma.planWorkout.findUniqueOrThrow({
        where: { id: f.independent.id },
      });
      await expect(
        service.updateImportedWorkout({
          userId: 'user',
          workoutId: before.id,
          preferredSessionIndex: before.sessionIndex,
          scheduledDate: new Date('2026-07-06'),
          targetPlanId: null,
          targetPlanStartDate: null,
          sportType: 'RUN',
          text: 'remote changed',
          status: 'PLANNED',
          blocks: [],
          structureKind: 'FREEFORM',
          dayOffset: 0,
          expectedUpdatedAt: before.updatedAt,
        }),
      ).rejects.toThrow('PLAN_IMPORT_HISTORY_PROTECTED');
      expect(
        await prisma.planWorkout.findUnique({ where: { id: before.id } }),
      ).toEqual(before);
    },
  );

  it('rolls back a third-party course update when its mapping cannot be persisted', async () => {
    const f = await independentScenario();
    const before = await prisma.planWorkout.findUniqueOrThrow({
      where: { id: f.independent.id },
    });
    await prisma.planWorkoutExternalMapping.create({
      data: {
        userId: 'user',
        provider: 'garmin',
        externalEventId: 'duplicate',
        externalSourceKey: 'existing',
      },
    });
    await expect(
      service.updateImportedWorkout(
        {
          userId: 'user',
          workoutId: before.id,
          preferredSessionIndex: before.sessionIndex,
          scheduledDate: new Date('2026-07-06'),
          targetPlanId: null,
          targetPlanStartDate: null,
          sportType: 'RUN',
          text: 'remote changed',
          status: 'PLANNED',
          blocks: [],
          structureKind: 'FREEFORM',
          dayOffset: 0,
          expectedUpdatedAt: before.updatedAt,
        },
        (stored) => ({
          userId: 'user',
          provider: 'garmin',
          planWorkoutId: stored.id,
          externalEventId: 'duplicate',
          externalSourceKey: 'garmin-schedule:new',
        }),
      ),
    ).rejects.toThrow();
    expect(
      await prisma.planWorkout.findUnique({ where: { id: before.id } }),
    ).toEqual(before);
    expect(await prisma.planWorkoutExternalMapping.count()).toBe(1);
  });

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
