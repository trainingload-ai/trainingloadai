import { PlanRepository } from '../../api/plan/persistence/plan.repository';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { planStartFixture } from '../../api/plan/spec/plan-start.fixture';
import { RollingPlanRuntimeService } from '../rolling-plan-runtime.service';
import { StrengthActivityService } from '../../api/activity/strength-activity.service';
import { acquireHashtextAdvisoryXactLock } from '../../prisma/hashtext-advisory-lock';
import { RollingPlanAutomationService } from '../../api/plan/application/rolling-plan-automation.service';

describe('continuous plan runtime / PostgreSQL', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;
  let f: ReturnType<typeof planStartFixture>;
  beforeAll(async () => {
    database = fork(
      resolve(
        __dirname,
        process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN
          ? '../../api/plan/spec/plan-sync-native-postgres.mjs'
          : '../../api/ai/core/spec/coach-run-postgres.mjs',
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
    await prisma.$executeRawUnsafe(
      "INSERT INTO t_user(id) VALUES ('user'),('other')",
    );
  });

  const now = new Date('2099-11-20T09:00:00Z');
  function automation() {
    return new RollingPlanAutomationService(
      prisma as never,
      f.starts,
      {
        assertAllowed: async () => undefined,
      } as never,
      new PlanRepository(prisma as never),
    );
  }
  async function active() {
    const draft = await f.service.createPlan('user', {
      title: 'Continuous',
      planningMode: 'ROLLING',
      periodWeeks: null,
      workouts: [],
    });
    const planId = draft.plan!.id;
    await prisma.plan.update({
      where: { id: planId },
      data: {
        status: 'ACTIVE',
        startDate: new Date('2099-11-18'),
        activationTimezone: 'UTC',
      },
    });
    await f.context.ensureContext({ userId: 'user', planId });
    const policy = await prisma.planAutomationPolicy.create({
      data: {
        planId,
        userId: 'user',
        revision: 1,
        confirmedDecisionId: 'initial-consent',
        effectiveFrom: new Date('2099-11-18'),
        settings: {
          goal: 'Maintain endurance',
          sportTypes: ['RUN'],
          autoPlanMonths: true,
          autoGenerateWeeks: true,
          autoAdjustFuture: true,
        },
      },
    });
    await prisma.rollingMonthStrategy.create({
      data: {
        planId,
        policyId: policy.id,
        monthStart: new Date('2099-11-01'),
        monthEnd: new Date('2099-11-30'),
        effectiveFrom: new Date('2099-11-18'),
        revision: 1,
        evidenceRevision: 'initial',
        strategy: {
          monthStart: '2099-11-01',
          objective: 'Maintain',
          loadRange: null,
          durationMinutesRange: null,
          weekFocus: [],
        },
        appliedAt: new Date(),
      },
    });
    return { planId, policy };
  }
  async function publishWeek(planId: string, policyId: string, start: string, end: string) {
    await prisma.rollingWeekGeneration.create({
      data: {
        planId,
        policyId,
        weekStart: new Date(start),
        weekEnd: new Date(end),
        generatedFrom: new Date(start),
        generatedThrough: new Date(end),
        appliedAt: new Date(),
        revision: 1,
        evidenceRevision: 'initial',
        receipt: {},
      },
    });
  }
  it('waits for the last training day and deduplicates next-week discovery across scanners', async () => {
    const { planId, policy } = await active();
    const a = automation();
    const lastDay = new Date('2099-11-21');
    const workoutData = {
      userId: 'user',
      planId,
      scheduledDate: lastDay,
      dayOffset: 3,
      sportType: 'RUN' as const,
      text: 'Easy 20m',
    };
    await prisma.planWorkout.create({ data: { ...workoutData, status: 'DONE' } });
    const unfinished = await prisma.planWorkout.create({
      data: { ...workoutData, sessionIndex: 2 },
    });
    const premature = await prisma.rollingPlanJob.create({
      data: {
        planId,
        policyId: policy.id,
        kind: 'WEEK',
        windowStart: new Date('2099-11-23'),
        inputRevision: 'legacy-friday',
      },
    });
    await a.discover(now);
    await a.discover(new Date('2099-11-21T09:00:00Z'));
    expect((await a.status('user', planId)).jobs.filter((job) => job.state === 'PENDING').map((job) => job.windowStart))
      .toEqual(['2099-11-16']);
    await prisma.planWorkout.update({
      where: { id: unfinished.id },
      data: { status: 'DONE' },
    });
    const afterCompletion = new Date('2099-11-21T12:00:00Z');
    await a.discover(afterCompletion);
    expect((await prisma.rollingPlanJob.findUniqueOrThrow({ where: { id: premature.id } })).state)
      .toBe('CANCELLED');
    await publishWeek(planId, policy.id, '2099-11-16', '2099-11-22');
    await Promise.all([a.discover(afterCompletion), a.discover(afterCompletion)]);
    const status = await a.status('user', planId);
    expect(
      status.jobs
        .filter((job) => job.state === 'PENDING')
        .map((j) => [j.kind, j.windowStart])
        .sort((a, b) => a[1].localeCompare(b[1])),
    ).toEqual([['WEEK', '2099-11-23']]);
    const old = (await a.claim())!;
    expect(await a.claim()).toBeNull();
    await prisma.rollingPlanJob.update({
      where: { id: old.id },
      data: { leaseUntil: new Date(0) },
    });
    const recovered = await a.claim();
    expect(recovered!.id).toBe(old.id);
    expect(recovered!.claimToken).not.toBe(old.claimToken);
    await expect(a.heartbeat(old.id, old.claimToken!)).rejects.toThrow(
      'ROLLING_LEASE_LOST',
    );
    await a.heartbeat(recovered!.id, recovered!.claimToken!);
  });
  it('resumes unchanged same-day work with a new lease and revalidates current facts', async () => {
    const { planId } = await active();
    const queue = automation();
    await queue.discover(now);
    const old = (await queue.claim())!;
    await queue.prepare(old.id, old.claimToken!);
    await f.service.pausePlan('user', planId);
    await expect(queue.heartbeat(old.id, old.claimToken!)).rejects.toThrow(
      'ROLLING_LEASE_LOST',
    );
    await f.service.activatePlan('user', planId);
    await queue.discover(now);
    expect(
      (await queue.status('user', planId)).jobs.filter((j) =>
        ['PENDING', 'RETRY'].includes(j.state),
      ),
    ).toHaveLength(1);
    const resumed = (await queue.claim())!;
    expect(resumed.claimToken).not.toBe(old.claimToken);
    await expect(queue.prepare(old.id, old.claimToken!)).rejects.toThrow(
      'ROLLING_LEASE_LOST',
    );
    await queue.prepare(resumed.id, resumed.claimToken!);
    await prisma.planWorkout.create({
      data: {
        userId: 'user',
        planId,
        dayOffset: 3,
        sessionIndex: 1,
        scheduledDate: new Date('2099-11-21'),
        sportType: 'RUN',
        text: 'Easy 20m',
        name: 'New athlete fact',
      },
    });
    await expect(
      queue.prepare(resumed.id, resumed.claimToken!),
    ).rejects.toThrow('ROLLING_FACTS_CHANGED');
  });

  it('opens next week after the last unfinished training day ends in the plan timezone', async () => {
    const { planId, policy } = await active();
    await publishWeek(planId, policy.id, '2099-11-16', '2099-11-22');
    await prisma.plan.update({
      where: { id: planId },
      data: { activationTimezone: 'Asia/Shanghai' },
    });
    await prisma.planWorkout.create({
      data: {
        userId: 'user',
        planId,
        dayOffset: 3,
        scheduledDate: new Date('2099-11-21'),
        sportType: 'RUN',
        text: 'Easy 20m',
      },
    });
    const queue = automation();
    const nextWeek = () => prisma.rollingPlanJob.count({
      where: { planId, kind: 'WEEK', windowStart: new Date('2099-11-23') },
    });
    await queue.discover(new Date('2099-11-21T15:55:00Z'));
    expect(await nextWeek()).toBe(0);
    await queue.discover(new Date('2099-11-21T16:00:00Z'));
    expect(await nextWeek()).toBe(1);
  });

  it.each([true, false])(
    'opens next month once after its last scheduled day (last workout completed: %s)',
    async (completed) => {
      const { planId, policy } = await active();
      await publishWeek(planId, policy.id, '2099-11-23', '2099-11-29');
      await publishWeek(planId, policy.id, '2099-11-30', '2099-12-06');
      await prisma.plan.update({
        where: { id: planId },
        data: { activationTimezone: 'Asia/Shanghai' },
      });
      const workout = await prisma.planWorkout.create({
        data: {
          userId: 'user',
          planId,
          dayOffset: 12,
          scheduledDate: new Date('2099-11-30'),
          sportType: 'RUN',
          text: 'Easy 20m',
        },
      });
      const queue = automation();
      const nextMonth = () => prisma.rollingPlanJob.count({
        where: { planId, kind: 'MONTH', windowStart: new Date('2099-12-01') },
      });
      await queue.discover(new Date('2099-11-27T09:00:00Z'));
      expect(await nextMonth()).toBe(0);
      if (completed) {
        await prisma.planWorkout.update({
          where: { id: workout.id },
          data: { status: 'DONE' },
        });
      }
      await queue.discover(new Date('2099-11-30T15:55:00Z'));
      expect(await nextMonth()).toBe(completed ? 1 : 0);
      await queue.discover(new Date('2099-11-30T16:00:00Z'));
      expect(await nextMonth()).toBe(1);
    },
  );

  it('reuses published calendar windows after saving or revising automation settings', async () => {
    const { planId, policy } = await active();
    const queue = automation();
    await publishWeek(planId, policy.id, '2099-11-16', '2099-11-22');
    await expect(queue.configure('user', planId, true, policy.settings))
      .resolves.toEqual({ enabled: true, revision: 1 });
    await expect(queue.configure('user', planId, true, {
      ...(policy.settings as Record<string, unknown>),
      goal: 'Easy endurance',
    })).resolves.toEqual({ enabled: true, revision: 2 });
    expect(await queue.discover(now)).toBe(0);
    expect(await queue.discover(new Date('2099-11-23T09:00:00Z'))).toBe(1);
    const job = (await queue.claim())!;
    expect(job).toMatchObject({ kind: 'WEEK', windowStart: new Date('2099-11-23') });
    expect((await queue.prepare(job.id, job.claimToken!)).input).toMatchObject({
      monthStrategies: [expect.objectContaining({ policyId: policy.id })],
    });
  });

  it.each(['calendar-create', 'calendar-attach'])(
    'preserves a manually scheduled %s workout against automatic deletion',
    async (path) => {
      const { planId } = await active();
      Object.assign(f.write, { emitWorkoutsChanged: async () => undefined });
      Object.defineProperty(f.starts, 'automationAccess', {
        value: { assertAllowed: async () => undefined },
      });
      const dto = {
        scheduledDate: '2099-11-21',
        sportType: 'RUN' as const,
        definition: {
          kind: 'FREEFORM' as const,
          version: 1 as const,
          source: 'TEXT' as const,
          text: 'Easy run 20m',
        },
        name: 'Athlete commitment',
      };
      const created =
        path === 'calendar-create'
          ? await f.service.createPlanWorkout('user', planId, dto)
          : await f.service.createIndependentWorkout('user', dto);
      const workoutId = created.workout!.id;
      if (path === 'calendar-attach')
        await f.service.attachWorkoutToPlan('user', planId, workoutId);
      const queue = automation();
      await queue.discover(now);
      const job = (await queue.claim())!;
      await queue.prepare(job.id, job.claimToken!);
      await expect(
        f.starts.createAutomationPreview(job.id, job.claimToken!, {
          mode: 'SCHEDULE',
          planId,
          range: { from: '2099-11-20', to: '2099-11-22' },
          rationale: 'Attempted automated deletion',
          evidenceRefs: [],
          changes: [],
          additions: [],
          deletions: [
            {
              sourceWorkoutId: workoutId,
              expectedRevision: path === 'calendar-create' ? 1 : 2,
            },
          ],
          preserveUnmentioned: true,
        }),
      ).rejects.toThrow(
        'A protected or out-of-range workout cannot be changed',
      );
      expect(
        (await f.service.getPlanDetail('user', planId)).plan!.workouts.map(
          (w) => w.id,
        ),
      ).toContain(workoutId);
    },
  );
  it('serializes planned strength start behind calendar edits and starts only the committed prescription once', async () => {
    const { planId } = await active();
    const workout = await prisma.planWorkout.create({
      data: {
        planId,
        userId: 'user',
        dayOffset: 0,
        sessionIndex: 1,
        sportType: 'UNKNOWN',
        structureKind: 'STRENGTH',
        text: 'Strength',
        name: 'Old prescription',
        scheduledDate: new Date('2099-11-18'),
      },
    });
    const strength = new StrengthActivityService(
      prisma as never,
      {} as never,
      f.query,
    );
    let release!: () => void, locked!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const lockReady = new Promise<void>((done) => {
      locked = done;
    });
    const writer = prisma.$transaction(async (tx) => {
      await acquireHashtextAdvisoryXactLock(tx, 'user');
      locked();
      await gate;
      await tx.planWorkout.update({
        where: { id: workout.id },
        data: { name: 'Committed prescription', revision: { increment: 1 } },
      });
    });
    await lockReady;
    let completed = false;
    const started = strength
      .startPlanned('user', { planId, workoutId: workout.id })
      .then((r) => {
        completed = true;
        return r;
      });
    await new Promise((done) => setTimeout(done, 80));
    const ranBeforeCommit = completed;
    release();
    await writer;
    const result = await started;
    expect(ranBeforeCommit).toBe(false);
    const repeated = await strength.startPlanned('user', {
      planId,
      workoutId: workout.id,
    });
    expect(repeated).toMatchObject({
      activityId: result.activityId,
      created: false,
    });
    expect(
      await f.query.findWorkout({ where: { id: workout.id } }),
    ).toMatchObject({ name: 'Committed prescription', status: 'IN_PROGRESS' });
  });

  it('reuses published week and month results across calendar draft expiry and activity evidence changes', async () => {
    const { planId, policy } = await active();
    await publishWeek(planId, policy.id, '2099-11-23', '2099-11-29');
    Object.defineProperty(f.starts, 'automationAccess', {
      value: { assertAllowed: async () => undefined },
    });
    let calls = 0;
    const proposedInputs: unknown[] = [];
    await prisma.planWorkout.createMany({
      data: [
        {
          scheduledDate: new Date('2099-11-24'),
          dayOffset: 6,
          status: 'DONE' as const,
          estimatedLoad: 28,
        },
        {
          scheduledDate: new Date('2099-11-25'),
          dayOffset: 7,
          status: 'SKIPPED' as const,
          estimatedLoad: 22,
        },
      ].map((workout) => ({
        ...workout,
        userId: 'user',
        planId,
        sportType: 'RUN',
        structureKind: 'FREEFORM',
        text: 'Easy 20m',
        name: 'Recent training',
      })),
    });
    await prisma.activity.create({
      data: {
        userId: 'user',
        hashId: 'rolling-recent-run',
        processingStatus: 'READY',
        state: 1,
        startTime: new Date('2099-11-24T08:00:00Z'),
        sportType: 'RUN',
        timerTime: 1800,
        sessionRpe: 5,
      },
    });
    const queue = automation();
    const discover = jest.spyOn(queue, 'discover');
    const runtime = new RollingPlanRuntimeService(
      queue,
      {
        propose: async (input: any) => {
          calls++;
          proposedInputs.push(input);
          if (input.kind === 'MONTH')
            return {
              runId: 'fixed-month',
              result: {
                kind: 'MONTH',
                reason: 'Conservative direction; load unknown',
                strategy: {
                  monthStart: input.windowStart,
                  objective: 'Maintain endurance',
                  loadRange: null,
                  durationMinutesRange: { min: 30, max: 120 },
                  weekFocus: [],
                },
              },
            };
          const offset = Math.round(
            (new Date(input.from).getTime() -
              new Date('2099-11-18').getTime()) /
              86400000,
          );
          return {
            runId: 'fixed-week',
            result: {
              kind: input.kind,
              reason: 'Conservative week within confirmed scope',
              schedule: {
                mode: 'SCHEDULE',
                planId,
                range: { from: input.from, to: input.through },
                rationale: 'Conservative remaining week',
                evidenceRefs: [],
                changes: [],
                deletions: [],
                preserveUnmentioned: true,
                additions:
                  input.kind === 'ADJUST'
                    ? []
                    : [
                        {
                          candidateKey: `run-${input.from}`,
                          workout: {
                            weekIndex: Math.floor(offset / 7) + 1,
                            dayIndex: (offset % 7) + 1,
                            sportType: 'RUN',
                            definition: {
                              kind: 'FREEFORM',
                              version: 1,
                              source: 'TEXT',
                              text: 'Easy run 30m',
                            },
                          },
                        },
                      ],
              },
            },
          };
        },
      } as never,
      f.starts,
      f.query,
      { isEnabled: () => true, require: () => undefined } as never,
      { ensureNotification: async () => undefined } as never,
    );
    const firstTick = new Date('2099-11-27T09:00:00Z');
    await runtime.tick(firstTick);
    expect(discover.mock.calls).toEqual([
      [firstTick],
      [firstTick, planId],
      [firstTick, planId],
    ]);
    expect(proposedInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'WEEK',
          windowStart: '2099-11-30',
          facts: expect.objectContaining({
            recentWeeks: expect.arrayContaining([
              expect.objectContaining({
                weekStart: '2099-11-23',
                through: '2099-11-27',
                completed: 1,
                skipped: 1,
                actualLoad: expect.objectContaining({
                  value: 25,
                  coverage: 'COMPLETE',
                }),
                scheduledLoad: expect.objectContaining({ value: 50 }),
              }),
            ]),
          }),
        }),
      ]),
    );
    const status = await automation().status('user', planId);
    expect(status.jobs.every((j) => j.state === 'APPLIED')).toBe(true);
    const snapshot = await f.query.windowSnapshot(
      'user',
      planId,
      '2099-11-30',
      '2099-12-06',
    );
    expect(snapshot.generationCoverage.status).toBe('GENERATED');
    expect(snapshot.workouts).toHaveLength(1);
    const cross = await prisma.rollingWeekGeneration.findFirst({
      where: { planId, weekStart: new Date('2099-11-30'), supersededAt: null },
      include: { monthStrategies: true },
    });
    expect(cross!.monthStrategies).toHaveLength(2);
    const firstCalls = calls;
    const draftId = randomUUID();
    const workout = await prisma.planWorkout.findFirstOrThrow({
      where: { planId, generationId: cross!.id },
    });
    await expect(f.starts.saveCalendarAdjustment('user', planId, draftId, {
      versionId: draftId,
      edits: [{
        kind: 'UPDATE', workoutId: workout.id, expectedRevision: workout.revision,
        targetDate: '2099-12-02',
      }],
    })).resolves.toMatchObject({ state: 'READY' });
    await runtime.tick(new Date('2099-11-27T10:00:00Z'));
    expect(calls).toBe(firstCalls);
    await prisma.planProposalPreview.update({
      where: { id: draftId }, data: { expiresAt: new Date(0) },
    });
    await expect(f.starts.getCalendarAdjustment('user', planId, draftId))
      .resolves.toMatchObject({ state: 'EXPIRED' });
    await runtime.tick(new Date('2099-11-28T10:00:00Z'));
    expect(calls).toBe(firstCalls);
    await expect(prisma.planWorkout.findUniqueOrThrow({ where: { id: workout.id } }))
      .resolves.toEqual(workout);
    await prisma.activity.update({
      where: { hashId: 'rolling-recent-run' },
      data: { timerTime: 2000 },
    });
    await runtime.tick(new Date('2099-11-28T11:00:00Z'));
    expect(calls).toBe(firstCalls);
    expect(proposedInputs.filter((input: any) => input.kind === 'MONTH')).toHaveLength(1);
    expect(await prisma.coachDecision.count()).toBe(0);
  });

  it('fences settings and lifecycle changes and revokes the policy on termination', async () => {
    const { planId } = await active();
    const a = automation();
    await a.discover(now);
    const claimed = (await a.claim())!;
    await a.prepare(claimed.id, claimed.claimToken!);
    const policy = await a.configure('user', planId, true, {
      goal: 'Easy endurance',
      sportTypes: ['RUN'],
      autoPlanMonths: true,
      autoGenerateWeeks: true,
      autoAdjustFuture: true,
    });
    expect(policy.revision).toBe(2);
    await expect(
      a.assertFresh(claimed.id, claimed.claimToken!),
    ).rejects.toThrow('ROLLING_LEASE_LOST');
    await a.configure('user', planId, false);
    expect(await a.discover(now)).toBe(0);
    await a.configure('user', planId, true);
    await f.service.pausePlan('user', planId, {});
    expect(await a.discover(now)).toBe(0);
    await f.service.activatePlan('user', planId);
    await a.discover(new Date('2099-12-09T09:00:00Z'));
    const status = await a.status('user', planId);
    const pending = status.jobs.filter((job) => job.state === 'PENDING');
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((job) => job.windowStart >= '2099-12-01')).toBe(true);

    jest.spyOn(f.context, 'finalizeContext').mockResolvedValueOnce(null);
    await f.service.cancelPlan('user', planId);
    const stopped = await a.status('user', planId);
    expect(stopped.enabled).toBe(false);
    for (const job of pending) {
      expect(stopped.jobs.find(({ id }) => id === job.id)?.state).toBe('CANCELLED');
    }
    expect(await a.discover(new Date('2099-12-09T09:00:00Z'))).toBe(0);
  });
  it('rejects changed external evidence and current access revocation before model/apply, and bounds crash retries', async () => {
    const { planId } = await active();
    const a = automation();
    await a.discover(now);
    const job = (await a.claim())!;
    await a.prepare(job.id, job.claimToken!);
    await prisma.plan.update({
      where: { id: planId },
      data: { goal: 'Updated athlete goal' },
    });
    await expect(a.assertFresh(job.id, job.claimToken!)).rejects.toThrow(
      'ROLLING_FACTS_CHANGED',
    );
    const denied = new RollingPlanAutomationService(
      prisma as never,
      f.starts,
      {
        assertAllowed: async () => {
          throw new Error('ACCESS_REVOKED');
        },
      } as never,
      new PlanRepository(prisma as never),
    );
    await expect(denied.prepare(job.id, job.claimToken!)).rejects.toThrow(
      'ACCESS_REVOKED',
    );
    expect((await denied.status('user', planId)).blockedReason).toBe(
      'ROLLING_AI_ACCESS_REQUIRED',
    );
    await prisma.rollingPlanJob.update({
      where: { id: job.id },
      data: { attempts: 5, leaseUntil: new Date(0) },
    });
    await a.claim();
    expect(
      (await a.status('user', planId)).jobs.find((j) => j.id === job.id)?.state,
    ).toBe('FAILED');
  });

  it('keeps exhausted crash retries deferred until the next daily retry window', async () => {
    const { planId } = await active();
    const a = automation();
    await a.discover(now);
    const job = (await a.claim())!;
    await prisma.rollingPlanJob.updateMany({
      where: { planId, id: { not: job.id }, state: 'PENDING' },
      data: { availableAt: new Date('2200-01-01') },
    });
    await prisma.rollingPlanJob.update({
      where: { id: job.id },
      data: { attempts: 5, leaseUntil: new Date(0) },
    });
    expect(await a.claim()).toBeNull();
    await a.discover(now);
    const deferred = (await a.status('user', planId)).jobs.find(
      (j) => j.id === job.id,
    )!;
    expect(deferred.state).toBe('FAILED');
    expect(new Date(deferred.availableAt).getTime()).toBeGreaterThan(
      Date.now() + 23 * 60 * 60_000,
    );
    expect(await a.claim()).toBeNull();

    await prisma.rollingPlanJob.update({
      where: { id: job.id },
      data: { availableAt: new Date(0) },
    });
    await a.discover(now);
    expect(await a.claim()).toMatchObject({ id: job.id, attempts: 1 });
  });

  it('recovers a committed notification behind newer no-op or already delivered jobs', async () => {
    const { planId, policy } = await active();
    await prisma.rollingPlanJob.createMany({
      data: [
        {
          id: 'awaiting-notification',
          planId,
          policyId: policy.id,
          kind: 'MONTH',
          windowStart: new Date('2099-11-01'),
          inputRevision: 'undelivered',
          state: 'APPLIED',
          receipt: { changed: true },
          updatedAt: new Date(0),
        },
        ...Array.from({ length: 101 }, (_, index) => ({
          planId,
          policyId: policy.id,
          kind: 'MONTH',
          windowStart: new Date('2099-11-01'),
          inputRevision: `later-result-${index}`,
          state: 'APPLIED',
          receipt:
            index % 2
              ? { changed: false }
              : { changed: true, notifiedAt: '2000-01-01T00:00:00Z' },
          updatedAt: new Date('2000-01-01'),
        })),
      ],
    });
    const a = automation();
    expect((await a.notificationsDue()).map((job) => job.id)).toEqual([
      'awaiting-notification',
    ]);
    await a.markNotified('awaiting-notification');
    expect(await a.notificationsDue()).toEqual([]);
  });

  it('resumes a paused paid candidate and reclaims its lease without another paid call', async () => {
    const { planId } = await active();
    Object.defineProperty(f.starts, 'automationAccess', {
      value: { assertAllowed: async () => undefined },
    });
    const a = automation();
    await a.discover(now);
    const job = (await a.claim())!;
    const prepared = await a.prepare(job.id, job.claimToken!);
    const input = prepared.input as any;
    const offset = Math.round(
      (new Date(input.from).getTime() - new Date('2099-11-18').getTime()) /
        86400000,
    );
    const candidate = {
      kind: 'WEEK',
      reason: 'Frozen conservative candidate',
      schedule: {
        mode: 'SCHEDULE',
        planId,
        range: { from: input.from, to: input.through },
        rationale: 'Frozen conservative candidate',
        evidenceRefs: [],
        changes: [],
        deletions: [],
        preserveUnmentioned: true,
        additions: [
          {
            candidateKey: 'recovered-run',
            workout: {
              weekIndex: Math.floor(offset / 7) + 1,
              dayIndex: (offset % 7) + 1,
              sportType: 'RUN',
              definition: {
                kind: 'FREEFORM',
                version: 1,
                source: 'TEXT',
                text: 'Easy run 20m',
              },
            },
          },
        ],
      },
    };
    await a.saveCandidate(
      job.id,
      job.claimToken!,
      candidate,
      'paid-run-before-crash',
    );
    await f.service.pausePlan('user', planId);
    await f.service.activatePlan('user', planId);
    await a.discover(now);
    // Keep this test focused on response-loss recovery of one business job.
    await prisma.rollingPlanJob.updateMany({
      where: { planId, id: { not: job.id }, state: 'PENDING' },
      data: { availableAt: new Date('2200-01-01') },
    });
    await prisma.rollingPlanJob.update({
      where: { id: job.id },
      data: { leaseUntil: new Date(0) },
    });
    let paidCalls = 0;
    const runtime = new RollingPlanRuntimeService(
      a,
      {
        propose: async () => {
          paidCalls++;
          throw new Error('Unexpected second model charge');
        },
      } as never,
      f.starts,
      f.query,
      { isEnabled: () => true, require: () => undefined } as never,
      { ensureNotification: async () => undefined } as never,
    );
    await runtime.tick(now);
    expect(paidCalls).toBe(0);
    expect(
      (await a.status('user', planId)).jobs.find((j) => j.id === job.id)?.state,
    ).toBe('APPLIED');
    expect(
      (await f.query.windowSnapshot('user', planId, input.from, input.through))
        .workouts,
    ).toHaveLength(1);
    await expect(
      f.starts.applyAutomation(job.id, job.claimToken!),
    ).rejects.toThrow();
  });
  it('stops an in-flight fixed model candidate after the athlete disables automation', async () => {
    const { planId } = await active();
    Object.defineProperty(f.starts, 'automationAccess', {
      value: { assertAllowed: async () => undefined },
    });
    const a = automation();
    const runtime = new RollingPlanRuntimeService(
      a,
      {
        propose: async (input: any) => {
          await a.configure('user', planId, false);
          return {
            runId: 'old-policy-run',
            result: {
              kind: 'WEEK',
              reason: 'Must not publish',
              schedule: {
                mode: 'SCHEDULE',
                planId,
                range: { from: input.from, to: input.through },
                rationale: 'Old policy',
                evidenceRefs: [],
                changes: [],
                deletions: [],
                preserveUnmentioned: true,
                additions: [],
              },
            },
          };
        },
      } as never,
      f.starts,
      f.query,
      { isEnabled: () => true, require: () => undefined } as never,
      { ensureNotification: async () => undefined } as never,
    );
    await runtime.tick(now);
    expect(
      (await a.status('user', planId)).jobs.every(
        (j) => j.state === 'CANCELLED',
      ),
    ).toBe(true);
    expect(
      (await f.query.windowSnapshot('user', planId, '2099-11-20', '2099-11-29'))
        .workouts,
    ).toHaveLength(0);
  });

  it('rebuilds an unfinished remaining-week scope after midnight without re-planning an already covered week', async () => {
    const { planId } = await active();
    const a = automation();
    await a.discover(now);
    const claimed = (await a.claim())!;
    await a.prepare(claimed.id, claimed.claimToken!);
    await a.fail(
      claimed,
      new Error('The schedule range is now historical; reassess'),
    );
    await a.discover(new Date('2099-11-21T09:00:00Z'));
    const jobs = (await a.status('user', planId)).jobs.filter(
      (j) => j.windowStart === '2099-11-16',
    );
    expect(jobs.map((j) => j.state).sort()).toEqual(['CANCELLED', 'PENDING']);
    const fresh = (await a.claim())!;
    // The older next-week job may be first; inspect the newly queued job through the real claim boundary.
    const current =
      fresh.windowStart.toISOString().slice(0, 10) === '2099-11-16'
        ? fresh
        : (await a.claim())!;
    expect(
      (await a.prepare(current.id, current.claimToken!)).input,
    ).toMatchObject({ from: '2099-11-21', through: '2099-11-22' });
  });
  it('protects a strength session started after a worker preview and preserves its activity binding', async () => {
    const { planId } = await active();
    Object.defineProperty(f.starts, 'automationAccess', {
      value: { assertAllowed: async () => undefined },
    });
    const workout = await prisma.planWorkout.create({
      data: {
        planId,
        userId: 'user',
        dayOffset: 2,
        sessionIndex: 1,
        sportType: 'UNKNOWN',
        structureKind: 'STRENGTH',
        text: 'Strength',
        name: 'Athlete strength',
        strengthExercises: {
          create: {
            orderIndex: 0,
            name: 'Squat',
            setGroups: {
              create: {
                orderIndex: 0,
                setType: 'WORK',
                setCount: 2,
                loadType: 'ABSOLUTE',
                loadValue: 40,
                loadUnit: 'KG',
                prescriptionType: 'REPS',
                repsMin: 8,
                repsMax: 8,
              },
            },
          },
        },
        scheduledDate: new Date('2099-11-20'),
      },
    });
    const a = automation();
    await a.discover(now);
    const job = (await a.claim())!;
    await a.prepare(job.id, job.claimToken!);
    await f.starts.createAutomationPreview(job.id, job.claimToken!, {
      mode: 'SCHEDULE',
      planId,
      range: { from: '2099-11-20', to: '2099-11-22' },
      rationale: 'Preserve existing strength',
      evidenceRefs: [],
      changes: [],
      deletions: [],
      preserveUnmentioned: true,
      additions: [
        {
          candidateKey: 'run',
          workout: {
            weekIndex: 1,
            dayIndex: 4,
            sportType: 'RUN',
            definition: {
              kind: 'FREEFORM',
              version: 1,
              source: 'TEXT',
              text: 'Easy run 20m',
            },
          },
        },
      ],
    });
    const strength = new StrengthActivityService(
      prisma as never,
      {} as never,
      f.query,
    );
    const started = await strength.startPlanned('user', {
      planId,
      workoutId: workout.id,
    });
    await expect(
      f.starts.applyAutomation(job.id, job.claimToken!),
    ).rejects.toThrow('ROLLING_FACTS_CHANGED');
    expect(
      await f.query.findWorkout({ where: { id: workout.id } }),
    ).toMatchObject({ status: 'IN_PROGRESS', name: 'Athlete strength' });
    expect(
      await strength.startPlanned('user', { planId, workoutId: workout.id }),
    ).toMatchObject({ activityId: started.activityId, created: false });
    expect(
      (await f.query.windowSnapshot('user', planId, '2099-11-20', '2099-11-22'))
        .workouts,
    ).toHaveLength(1);
  });
  it('does not treat an activity audit timestamp rewrite as new training evidence', async () => {
    await active();
    const activity = await prisma.activity.create({
      data: {
        userId: 'user',
        hashId: 'external-evidence',
        processingStatus: 'READY',
        state: 1,
        startTime: new Date('2099-11-19T08:00:00Z'),
        sportType: 'RUN',
        timerTime: 1800,
        sessionRpe: 5,
      },
    });
    const a = automation();
    await a.discover(now);
    const job = (await a.claim())!;
    await a.prepare(job.id, job.claimToken!);
    await prisma.activity.update({
      where: { id: activity.id },
      data: { updatedAt: new Date('2100-01-01') },
    });
    await expect(
      a.assertFresh(job.id, job.claimToken!),
    ).resolves.toBeUndefined();
  });
  it('publishes a remaining Sunday after a month boundary without inventing a direction for elapsed days', async () => {
    const { planId, policy } = await active();
    Object.defineProperty(f.starts, 'automationAccess', {
      value: { assertAllowed: async () => undefined },
    });
    await prisma.plan.update({
      where: { id: planId },
      data: { startDate: new Date('2099-11-01') },
    });
    await prisma.rollingMonthStrategy.updateMany({
      where: { planId },
      data: { effectiveFrom: new Date('2099-11-01') },
    });
    const a = automation();
    await a.discover(new Date('2099-11-01T09:00:00Z'));
    let job = (await a.claim())!;
    if (job.windowStart.toISOString().slice(0, 10) !== '2099-10-26')
      job = (await a.claim())!;
    await a.prepare(job.id, job.claimToken!);
    await f.starts.createAutomationPreview(job.id, job.claimToken!, {
      mode: 'SCHEDULE',
      planId,
      range: { from: '2099-11-01', to: '2099-11-01' },
      rationale: 'Only future November Sunday',
      evidenceRefs: [],
      changes: [],
      deletions: [],
      preserveUnmentioned: true,
      additions: [
        {
          candidateKey: 'remaining-sunday',
          workout: {
            weekIndex: 1,
            dayIndex: 1,
            sportType: 'RUN',
            definition: {
              kind: 'FREEFORM',
              version: 1,
              source: 'TEXT',
              text: 'Easy run 20m',
            },
          },
        },
      ],
    });
    await f.starts.applyAutomation(job.id, job.claimToken!);
    const snapshot = await f.query.windowSnapshot(
      'user',
      planId,
      '2099-11-01',
      '2099-11-01',
    );
    expect(snapshot.generationCoverage.status).toBe('GENERATED');
    expect(
      await prisma.rollingMonthStrategy.count({
        where: {
          planId,
          policyId: policy.id,
          monthStart: new Date('2099-10-01'),
        },
      }),
    ).toBe(0);
  });
});
