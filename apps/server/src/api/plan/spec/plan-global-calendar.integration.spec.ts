import { PlanCalendarRepository } from '../persistence/plan-calendar.repository';
import { PlanExternalSyncService } from '../application/plan-external-sync.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { PlanWorkoutMutabilityPolicy } from '../application/plan-workout-mutability.policy';
import { PlanLoadEstimatorService } from '../application/plan-load-estimator.service';
import { WorkoutService } from '@/api/workout/workout.service';
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PlanCalendarValidationService } from '../application/plan-calendar-validation.service';
import { planStartFixture } from './plan-start.fixture';

describe('athlete calendar write budget / PostgreSQL', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;
  let f: ReturnType<typeof planStartFixture>;
  beforeAll(async () => {
    database = fork(
      resolve(
        __dirname,
        process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN
          ? 'plan-sync-native-postgres.mjs'
          : '../../ai/core/spec/coach-run-postgres.mjs',
      ),
      [],
      { execArgv: [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] },
    );
    const server = await new Promise<{
      address: string;
      connectionLimit?: number;
    }>((done, reject) => {
      database.once('message', done);
      database.once('error', reject);
      database.once('exit', (code) =>
        reject(new Error(`Test database exited: ${code}`)),
      );
    });
    prisma = new PrismaClient({
      datasourceUrl: `postgresql://postgres:postgres@${server.address}/postgres?connection_limit=${server.connectionLimit ?? 1}&sslmode=disable`,
    });
    await prisma.$connect();
    f = planStartFixture(prisma);
    Object.assign(f.write, {
      calendarValidation: new PlanCalendarValidationService(
        new PlanCalendarRepository(),
      ),
    });
  }, 30000);
  afterAll(async () => {
    await prisma?.$disconnect();
    if (database && database.exitCode === null)
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM t_user');
    await prisma.$executeRawUnsafe("INSERT INTO t_user(id) VALUES ('user')");
  });
  const course = (seconds: number | null = 1800) => ({
    scheduledDate: '2099-11-23',
    sportType: 'RUN' as const,
    definition: {
      kind: 'FREEFORM' as const,
      version: 1 as const,
      source: 'STRUCTURE' as const,
      structure: {
        kind: 'FREEFORM' as const,
        version: 1 as const,
        text: 'Easy session',
        durationSeconds: seconds,
      },
    },
  });
  async function active() {
    const { plan } = await f.service.createPlan('user', {
      title: 'Fixed',
      periodWeeks: 2,
      generationMetadata: { qualityContract: { maxDailyMinutes: 60 } },
      workouts: [{ ...course(), weekIndex: 1, dayIndex: 2 }],
    });
    await f.write.activatePlan('user', plan.id, '2099-11-22', undefined, {
      validatedStartPreview: true,
    });
    return (await f.service.getPlanDetail('user', plan.id)).plan!;
  }
  it('rejects an independent session that exceeds the athlete daily budget and preserves the existing calendar', async () => {
    await active();
    await expect(
      f.write.createIndependentWorkout('user', course(2400)),
    ).rejects.toMatchObject({
      response: {
        code: 'PLAN_SCHEDULE_INVALID',
        issues: expect.arrayContaining([
          { code: 'DAILY_TIME_BUDGET', date: '2099-11-23' },
        ]),
      },
    });
    expect(
      (await f.write.listScheduledWorkouts('user', '2099-11-23', '2099-11-23'))
        .inPlan,
    ).toHaveLength(1);
  });
  it('allows deliberate multiple sessions when their combined duration meets the budget', async () => {
    await active();
    const added = await f.write.createIndependentWorkout('user', course(1800));
    expect(added.workout?.scheduledDate).toBe('2099-11-23');
    const calendar = await f.write.listScheduledWorkouts(
      'user',
      '2099-11-23',
      '2099-11-23',
    );
    expect(calendar.inPlan).toHaveLength(1);
    expect(calendar.independent).toHaveLength(1);
  });
  it('returns an explicit unverified budget for an unknown-duration session', async () => {
    await active();
    await expect(
      f.write.createIndependentWorkout('user', course(null)),
    ).rejects.toMatchObject({
      response: {
        issues: [{ code: 'DAILY_TIME_UNVERIFIED', date: '2099-11-23' }],
      },
    });
    expect(
      (await f.write.listScheduledWorkouts('user', '2099-11-23', '2099-11-23'))
        .independent,
    ).toEqual([]);
  });
  it.each(['add', 'create', 'batch', 'single'])(
    'validates the combined independent and plan duration at the %s entry',
    async (entry) => {
      const plan = await active();
      await f.write.createIndependentWorkout('user', course(1800));
      const workout = {
        ...course(2400),
        weekIndex: 1,
        dayIndex: 2,
        sessionIndex: 2,
      };
      const mutation =
        entry === 'add'
          ? f.write.addWorkout('user', plan.id, workout)
          : entry === 'create'
            ? f.write.createPlanWorkout('user', plan.id, course(2400))
            : entry === 'single'
              ? f.write.updateWorkout('user', plan.id, plan.workouts[0].id, {
                  ...workout,
                  sessionIndex: 1,
                })
              : f.write.updateWorkouts('user', plan.id, [
                  {
                    workoutId: plan.workouts[0].id,
                    dto: { ...workout, sessionIndex: 1 },
                  },
                ]);
      await expect(mutation).rejects.toMatchObject({
        response: {
          issues: expect.arrayContaining([
            { code: 'DAILY_TIME_BUDGET', date: '2099-11-23' },
          ]),
        },
      });
      const calendar = await f.write.listScheduledWorkouts(
        'user',
        '2099-11-23',
        '2099-11-23',
      );
      expect(calendar.inPlan).toHaveLength(1);
      expect(calendar.inPlan[0].summary?.durationSeconds).toBe(1800);
    },
  );
  it('counts another plan even if the edited plan has no daily budget', async () => {
    await active();
    const other = await f.service.createPlan('user', {
      title: 'Other',
      periodWeeks: 2,
      workouts: [{ ...course(2400), weekIndex: 1, dayIndex: 3 }],
    });
    await prisma.plan.update({
      where: { id: other.plan.id },
      data: {
        status: 'PAUSED',
        startDate: new Date('2099-11-22'),
        endDate: new Date('2099-12-05'),
        activationTimezone: 'UTC',
      },
    });
    await prisma.planWorkout.updateMany({
      where: { planId: other.plan.id },
      data: { scheduledDate: new Date('2099-11-24') },
    });
    await expect(
      f.write.updateWorkout('user', other.plan.id, other.plan.workouts[0].id, {
        ...course(2400),
        weekIndex: 1,
        dayIndex: 2,
      }),
    ).rejects.toMatchObject({
      response: { issues: [{ code: 'DAILY_TIME_BUDGET', date: '2099-11-23' }] },
    });
    expect(
      (await f.service.getPlanDetail('user', other.plan.id)).plan!.workouts[0]
        .scheduledDate,
    ).toBe('2099-11-24');
  });
  it('keeps a plan rest rule local while enforcing it when an independent course is attached', async () => {
    const plan = await active();
    await f.service.updatePlan('user', plan.id, {
      scheduleConstraints: {
        version: 1,
        revision: 1,
        calendarTimeZone: 'UTC',
        fixedRestWeekdays: [3],
        unavailableDates: ['2099-11-25'],
        availableDateOverrides: ['2099-12-02'],
        effectiveFrom: '2099-11-23',
        confirmation: { source: 'USER', reference: 'athlete-request' },
      },
      qualityContractTransition: { mode: 'INHERIT' },
    });
    const independent = await f.write.createIndependentWorkout('user', {
      ...course(),
      scheduledDate: '2099-11-25',
    });
    await expect(
      f.write.attachWorkoutToPlan('user', plan.id, independent.workout!.id),
    ).rejects.toMatchObject({
      response: {
        issues: expect.arrayContaining([
          {
            code: 'UNAVAILABLE_DATE',
            date: '2099-11-25',
            workoutId: independent.workout!.id,
          },
        ]),
      },
    });
    expect(
      (
        await f.write.getIndependentWorkoutDetail(
          'user',
          independent.workout!.id,
        )
      ).workout!.planId,
    ).toBeNull();
    const other = await f.service.createPlan('user', {
      title: 'Other local rules',
      periodWeeks: 2,
      workouts: [{ ...course(), weekIndex: 1, dayIndex: 2 }],
    });
    await prisma.plan.update({
      where: { id: other.plan.id },
      data: {
        status: 'PAUSED',
        startDate: new Date('2099-11-22'),
        endDate: new Date('2099-12-05'),
        activationTimezone: 'UTC',
      },
    });
    await prisma.planWorkout.updateMany({
      where: { planId: other.plan.id },
      data: { scheduledDate: new Date('2099-11-23') },
    });
    await expect(
      f.write.createPlanWorkout('user', other.plan.id, {
        ...course(),
        scheduledDate: '2099-11-25',
      }),
    ).resolves.toMatchObject({
      workout: { planId: other.plan.id, scheduledDate: '2099-11-25' },
    });
    await expect(
      f.write.createPlanWorkout('user', plan.id, {
        ...course(),
        scheduledDate: '2099-12-02',
      }),
    ).resolves.toMatchObject({
      workout: { planId: plan.id, scheduledDate: '2099-12-02' },
    });
  });
  (process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN ? it : it.skip)(
    'serializes independent and plan additions through the same athlete lock',
    async () => {
      const plan = await active();
      let held!: () => void, release!: () => void;
      const locked = new Promise<void>((done) => (held = done));
      const gate = new Promise<void>((done) => (release = done));
      const first = prisma.$transaction(
        async (tx) => {
          await f.write.createIndependentWorkoutInTransaction(
            'user',
            course(1800),
            tx,
          );
          held();
          await gate;
        },
        { timeout: 15000 },
      );
      await locked;
      const second = f.write
        .addWorkout('user', plan.id, {
          ...course(1800),
          weekIndex: 1,
          dayIndex: 2,
          sessionIndex: 2,
        })
        .then(
          () => true,
          () => false,
        );
      try {
        let blocked = false;
        for (let i = 0; i < 100; i++) {
          const rows = await prisma.$queryRaw<
            Array<{ blocked: boolean }>
          >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0) AS blocked`;
          if (rows[0].blocked) {
            blocked = true;
            break;
          }
          await new Promise((done) => setTimeout(done, 10));
        }
        expect(blocked).toBe(true);
      } finally {
        release();
        await first;
      }
      expect(await second).toBe(false);
      const calendar = await f.write.listScheduledWorkouts(
        'user',
        '2099-11-23',
        '2099-11-23',
      );
      expect(calendar.inPlan).toHaveLength(1);
      expect(calendar.independent).toHaveLength(1);
    },
  );

  function importer() {
    const workouts = new PlanWorkoutRepository(prisma as never);
    const plans = new PlanRepository(prisma as never);
    const codec = new WorkoutService({} as never);
    const loads = new PlanLoadEstimatorService(
      prisma as never,
      f.users,
      codec,
      plans,
      workouts,
    );
    return new PlanExternalSyncService(
      prisma as never,
      codec,
      loads,
      plans,
      workouts,
      new PlanActivityLinkRepository(prisma as never),
      new PlanWorkoutMutabilityPolicy(),
      f.users,
      new PlanCalendarValidationService(new PlanCalendarRepository()),
    );
  }
  it('checks imported independent courses before creating a device mapping', async () => {
    await active();
    const sync = importer();
    await expect(
      sync.createIndependentWorkout(
        {
          userId: 'user',
          scheduledDate: new Date('2099-11-23'),
          sportType: 'RUN',
          structureKind: 'FREEFORM',
          text: 'Easy session',
          plannedDurationSeconds: 2400,
          blocks: [],
        },
        (w) => ({
          userId: 'user',
          provider: 'intervals_icu',
          externalEventId: 'remote',
          planWorkoutId: w.id,
        }),
      ),
    ).rejects.toMatchObject({
      response: { issues: [{ code: 'DAILY_TIME_BUDGET', date: '2099-11-23' }] },
    });
    expect(
      (await f.write.listScheduledWorkouts('user', '2099-11-23', '2099-11-23'))
        .independent,
    ).toHaveLength(0);
    expect(await prisma.planWorkoutExternalMapping.count()).toBe(0);
  });
  it('rolls back an imported date change and its revision when the target day exceeds the budget', async () => {
    await active();
    const sync = importer();
    const source = await sync.createIndependentWorkout({
      userId: 'user',
      scheduledDate: new Date('2099-11-24'),
      sportType: 'RUN',
      structureKind: 'FREEFORM',
      text: 'Easy session',
      plannedDurationSeconds: 2400,
      blocks: [],
    });
    await expect(
      sync.updateImportedWorkout({
        userId: 'user',
        workoutId: source.id,
        preferredSessionIndex: 1,
        scheduledDate: new Date('2099-11-23'),
        targetPlanId: null,
        targetPlanStartDate: null,
        sportType: 'RUN',
        status: 'PLANNED',
        structureKind: 'FREEFORM',
        text: 'Easy session',
        plannedDurationSeconds: 2400,
        blocks: [],
        dayOffset: 0,
      }),
    ).rejects.toMatchObject({
      response: { issues: [{ code: 'DAILY_TIME_BUDGET', date: '2099-11-23' }] },
    });
    expect(
      (await f.write.getIndependentWorkoutDetail('user', source.id)).workout,
    ).toMatchObject({ scheduledDate: '2099-11-24' });
  });
  it('attaches a deliberate same-day session without counting it twice', async () => {
    const plan = await active();
    const independent = await f.write.createIndependentWorkout(
      'user',
      course(1800),
    );
    await expect(
      f.write.attachWorkoutToPlan('user', plan.id, independent.workout!.id),
    ).resolves.toMatchObject({
      workout: { id: independent.workout!.id, planId: plan.id },
    });
    const calendar = await f.write.listScheduledWorkouts(
      'user',
      '2099-11-23',
      '2099-11-23',
    );
    expect(calendar.inPlan).toHaveLength(2);
    expect(calendar.independent).toHaveLength(0);
  });
  it('stores new local plan availability without silently adopting or changing an independent course', async () => {
    const plan = await active();
    const independent = await f.write.createIndependentWorkout('user', {
      ...course(),
      scheduledDate: '2099-11-25',
    });
    await expect(
      f.service.updatePlan('user', plan.id, {
        scheduleConstraints: {
          version: 1,
          revision: 1,
          calendarTimeZone: 'UTC',
          fixedRestWeekdays: [3],
          unavailableDates: [],
          availableDateOverrides: [],
          effectiveFrom: '2099-11-23',
          confirmation: { source: 'USER', reference: 'new-availability' },
        },
        qualityContractTransition: { mode: 'INHERIT' },
      }),
    ).resolves.toMatchObject({
      plan: {
        generationMetadata: { scheduleConstraints: { fixedRestWeekdays: [3] } },
      },
    });
    expect(
      (
        await f.write.getIndependentWorkoutDetail(
          'user',
          independent.workout!.id,
        )
      ).workout,
    ).toMatchObject({ planId: null, scheduledDate: '2099-11-25' });
  });
  it.each(['DONE', 'SKIPPED'] as const)(
    'uses the protected %s course correctly in the daily total',
    async (status) => {
      const plan = await active();
      await f.write.updateWorkoutStatus(
        'user',
        plan.id,
        plan.workouts[0].id,
        status,
      );
      const adding = f.write.createIndependentWorkout(
        'user',
        course(status === 'DONE' ? 2400 : 3600),
      );
      if (status === 'DONE')
        await expect(adding).rejects.toMatchObject({
          response: {
            issues: [{ code: 'DAILY_TIME_BUDGET', date: '2099-11-23' }],
          },
        });
      else
        await expect(adding).resolves.toMatchObject({
          workout: { scheduledDate: '2099-11-23' },
        });
      expect(
        (await f.service.getPlanDetail('user', plan.id)).plan!.workouts[0],
      ).toMatchObject({ id: plan.workouts[0].id, status });
    },
  );
  it('does not double count source courses already covered by a scheduled successor', async () => {
    const source = await active();
    const next = await f.service.createPlan('user', {
      title: 'Successor',
      periodWeeks: 1,
      generationMetadata: { qualityContract: { maxDailyMinutes: 60 } },
      workouts: [{ ...course(), weekIndex: 1, dayIndex: 1 }],
    });
    await prisma.plan.update({
      where: { id: next.plan.id },
      data: {
        status: 'SCHEDULED',
        supersedesPlanId: source.id,
        startDate: new Date('2099-11-23'),
        endDate: new Date('2099-11-29'),
        activationTimezone: 'UTC',
      },
    });
    await prisma.planWorkout.updateMany({
      where: { planId: next.plan.id },
      data: { scheduledDate: new Date('2099-11-23') },
    });
    await expect(
      f.write.createIndependentWorkout('user', course(1800)),
    ).resolves.toMatchObject({ workout: { scheduledDate: '2099-11-23' } });
    const calendar = await f.write.listScheduledWorkouts(
      'user',
      '2099-11-23',
      '2099-11-23',
    );
    expect(calendar.inPlan).toHaveLength(1);
    expect(calendar.inPlan[0].planId).toBe(next.plan.id);
  });
});
