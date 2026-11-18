import { PlanRepository } from '../../api/plan/persistence/plan.repository';
import { fork, type ChildProcess } from 'node:child_process';
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
  it('discovers real coverage holes and next Friday week without an application visit, deduplicates across scanners and fences a reclaimed lease', async () => {
    const { planId } = await active();
    const a = automation();
    await Promise.all([a.discover(now), a.discover(now)]);
    const status = await a.status('user', planId);
    expect(
      status.jobs
        .map((j) => [j.kind, j.windowStart])
        .sort((a, b) => a[1].localeCompare(b[1])),
    ).toEqual([
      ['WEEK', '2099-11-16'],
      ['WEEK', '2099-11-23'],
    ]);
    const claims = await Promise.all([a.claim(), a.claim()]);
    expect(new Set(claims.map((c) => c!.id)).size).toBe(2);
    const old = claims[0]!;
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

  it('runs monthly dependencies and a single cross-month week through real automatic application, then stays quiet without new external facts', async () => {
    const { planId } = await active();
    Object.defineProperty(f.starts, 'automationAccess', {
      value: { assertAllowed: async () => undefined },
    });
    let calls = 0;
    const runtime = new RollingPlanRuntimeService(
      automation(),
      {
        propose: async (input: any) => {
          calls++;
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
                additions: [
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
    await runtime.tick(new Date('2099-11-27T09:00:00Z'));
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
    await runtime.tick(new Date('2099-11-27T10:00:00Z'));
    expect(calls).toBe(firstCalls);
    await runtime.tick(new Date('2099-11-28T10:00:00Z'));
    expect(calls).toBe(firstCalls);
    expect(await prisma.coachDecision.count()).toBe(0);
  });

  it('fences settings, disable and pause claims while preserving already scheduled courses; resume never backfills a past gap', async () => {
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
    expect(
      status.jobs
        .filter((j) => j.state === 'PENDING')
        .every((j) => j.windowStart >= '2099-12-01'),
    ).toBe(true);
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

  it('reclaims a crashed model-result job and applies its frozen candidate without another paid call', async () => {
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
