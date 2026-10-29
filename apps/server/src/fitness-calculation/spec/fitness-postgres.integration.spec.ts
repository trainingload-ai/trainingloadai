import { HealthFileQueryService } from '@/health-data/health-file-query.service';
import { HealthDataRepository } from '@/health-data/persistence/health-data.repository';
import { PlanQueryService } from '@/api/plan/application/plan-query.service';
import { PlanWorkoutRepository } from '@/api/plan/persistence/plan-workout.repository';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { UserService } from '@/api/user/user.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { UserIdentityRepository } from '@/api/user/persistence/user-identity.repository';
import { FitnessEvidenceReader } from '../fitness-evidence.reader';
import { FitnessCalculationService } from '../fitness-calculation.service';
import { FitnessAssessmentApplyService } from '@/api/ai/fitness-assessment-apply.service';
import { CoachActionService } from '@/api/ai/core/coach-action.service';
import { FitnessAssessmentFollowupService } from '@/api/ai/fitness-assessment-followup.service';
import { NotificationDomainService } from '@/notification/notification-domain.service';
import { NotificationRepository } from '@/notification/persistence/notification.repository';
import { lockFitnessUser } from '@/prisma/fitness-write-lock';
const url = process.env.FITNESS_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('fitness PostgreSQL transactions (isolated database only)', () => {
  let db: PrismaClient,
    calculations: FitnessCalculationService,
    apply: FitnessAssessmentApplyService,
    users: UserService;
  let uid: string, hashId: string, start: Date;
  let consentGranted = true;
  let powerFixture = false;
  let followup: FitnessAssessmentFollowupService;
  let notifications: NotificationDomainService;
  const eventEmitter = { emitAsync: jest.fn(async () => []) };
  beforeAll(() => {
    const parsed = new URL(url!);
    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      !parsed.pathname.startsWith('/fitness_assessment_test')
    )
      throw new Error('Refusing a non-isolated database');
    process.env.FITNESS_LTHR_APPLY_ENABLED = 'true';
    process.env.FITNESS_ASSESSMENT_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url } } });
    const queries = new UserQueryService(
      new UserIdentityRepository(db as never),
    );
    users = new UserService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      eventEmitter as never,
      queries,
    );
    const sensor = {
      getFitnessRecordSeries: async () =>
        powerFixture
          ? Array.from({ length: 7201 }, (_, i) => ({
              epochSeconds: start.getTime() / 1000 + i,
              heartRate: 160,
              power: i < 30 ? 425 : 125,
            }))
          : Array.from({ length: 1801 }, (_, i) => ({
              epochSeconds: start.getTime() / 1000 + i,
              heartRate: i < 600 ? 160 : 176,
              power: 200,
            })),
    };
    const reader = new FitnessEvidenceReader(
      db as never,
      sensor as never,
      queries,
      new HealthFileQueryService(new HealthDataRepository(db as never)),
    );
    calculations = new FitnessCalculationService(db as never, reader);
    const actions = new CoachActionService(
      db as never,
      {} as never,
      {} as never,
      eventEmitter as never,
    );
    notifications = new NotificationDomainService(
      new NotificationRepository(db as never),
    );
    followup = new FitnessAssessmentFollowupService(
      db as never,
      calculations,
      {
        assertGranted: async () => {},
        getStatus: async () => ({ granted: consentGranted }),
      } as never,
      notifications,
      eventEmitter as never,
      queries,
      new PlanQueryService(
        db as never,
        {} as never,
        new PlanWorkoutRepository(db as never),
        {} as never,
        {} as never,
        {} as never,
      ),
      { t: (key: string) => key } as never,
    );
    apply = new FitnessAssessmentApplyService(
      calculations,
      reader,
      users,
      actions,
      { assertGranted: async () => {} } as never,
    );
  });
  afterAll(async () => {
    if (db) {
      await db.t_user.deleteMany({
        where: { id: { startsWith: 'fitness-it-' } },
      });
      await db.$disconnect();
    }
    delete process.env.FITNESS_LTHR_APPLY_ENABLED;
    delete process.env.FITNESS_ASSESSMENT_ENABLED;
  });
  afterEach(async () => {
    await db.t_user.deleteMany({ where: { id: uid } });
    eventEmitter.emitAsync.mockReset().mockResolvedValue([]);
    jest.restoreAllMocks();
  });
  beforeEach(async () => {
    consentGranted = true;
    powerFixture = false;
    eventEmitter.emitAsync.mockClear();
    uid = 'fitness-it-' + randomUUID();
    hashId = 'fitness-activity-' + randomUUID();
    start = new Date(Math.floor((Date.now() - 7200000) / 1000) * 1000);
    await db.t_user.create({
      data: {
        id: uid,
        name: 'Integration fixture',
        email: uid + '@example.invalid',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await db.userBodyMetric.create({
      data: {
        userId: uid,
        type: 'TIMEZONE',
        value: 'Asia/Shanghai',
        effectiveDate: new Date(),
      },
    });
    for (const [type, value] of [
      ['MAX_HR', 200],
      ['RESTING_HR', 60],
      ['LTHR', 177],
    ] as const)
      await db.userFitnessMetric.create({
        data: {
          userId: uid,
          type,
          value,
          sport: 'CYCLING',
          source: 'MANUAL',
          recordedAt: new Date('2026-01-01T00:00:00Z'),
        },
      });
    const a = await db.activity.create({
      data: {
        userId: uid,
        hashId,
        sportType: 'CYCLING',
        startTime: start,
        endTime: new Date(start.getTime() + 1800000),
        timerTime: 1800,
        elapsedTime: 1800,
        sampleSec: 1,
        processingStatus: 'READY',
        readyAt: new Date(),
      },
    });
    await db.activityParquetFile.create({
      data: {
        activityId: a.id,
        type: 'record',
        parquetPath: 'fixture.parquet',
        pointCount: 1801,
        checksum: 'fixture-v1',
      },
    });
  });
  const context = () => ({
    userId: uid,
    sessionId: 'fitness-it',
    now: new Date(Date.now() + 1000),
  });
  async function proposal() {
    const ctx = context();
    const before = await db.userFitnessMetric.count({ where: { userId: uid } });
    const prepared = await calculations.prepare(ctx, {
      methodId: 'lthr-30-minute',
      metric: 'LTHR',
      sport: 'CYCLING',
      scope: { kind: 'ACTIVITY', activityHashId: hashId },
      segment: { activityHashId: hashId, startSeconds: 0 },
    });
    expect(prepared.reasonCode).toBe('PROTOCOL_UNKNOWN');
    await calculations.markPresented(
      ctx,
      [prepared.calculationId],
      'question-message',
    );
    const ready = await calculations.protocolReply(
      context(),
      prepared.calculationId,
      prepared.taskRevision,
      'TEST',
      'real-user-reply',
    );
    expect(ready.preparationStatus).toBe('READY');
    const result = await calculations.calculate(context(), ready.calculationId);
    expect(result.candidates[0].value).toBe(176);
    expect(result.applyOptions).toHaveLength(1);
    expect(await db.userFitnessMetric.count({ where: { userId: uid } })).toBe(
      before,
    );
    const session = await db.aiCoachSession.upsert({
      where: { userId_id: { userId: uid, id: ctx.sessionId } },
      create: { userId: uid, id: ctx.sessionId, nextSequence: 2 },
      update: { nextSequence: { increment: 1 } },
    });
    const message = await db.aiCoachMessage.create({
      data: {
        userId: uid,
        sessionId: ctx.sessionId,
        sequence: session.nextSequence - 1,
        role: 'ASSISTANT',
        content: 'Assessment result',
        message: {},
      },
    });
    await calculations.markPresented(ctx, [result.calculationId], message.id);
    return result;
  }
  it('rolls back the whole power model when one metric publication fails', async () => {
    const triggerName = 'zz_fitness_it_fail_power_model';
    const functionName = 'fitness_it_fail_power_model';
    const escapedUserId = uid.split("'").join("''");
    await db.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS ${triggerName} ON t_user_fitness_metric`,
    );
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${functionName}()`);
    await db.$executeRawUnsafe(`
      CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.user_id = '${escapedUserId}'
          AND NEW.type::text = 'FTP'
          AND NEW.source::text = 'AUTO'
        THEN
          RAISE EXCEPTION 'simulated power model publication failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await db.$executeRawUnsafe(`
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT OR UPDATE ON t_user_fitness_metric
      FOR EACH ROW EXECUTE FUNCTION ${functionName}()
    `);

    try {
      await expect(
        users.upsertAutoFitnessMetrics(
          uid,
          'CYCLING',
          [
            { type: 'CP', value: 401 },
            { type: 'FTP', value: 381 },
            { type: 'P_MAX', value: 800 },
            { type: 'W_PRIME', value: 84_655 },
          ],
          new Date('2026-10-13T00:00:00.000Z'),
        ),
      ).rejects.toThrow('simulated power model publication failure');
      expect(
        await db.userFitnessMetric.count({
          where: {
            userId: uid,
            type: { in: ['CP', 'FTP', 'P_MAX', 'W_PRIME'] },
          },
        }),
      ).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS ${triggerName} ON t_user_fitness_metric`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${functionName}()`);
    }
  }, 30000);
  it('previews without metric writes, preserves history and deduplicates concurrent adoption', async () => {
    const r = await proposal(),
      option = r.applyOptions[0];
    const confirmation = {
      kind: 'fitness_apply_confirmation' as const,
      calculationId: r.calculationId,
      applyOptionId: option.id,
      proposalDigest: option.proposalDigest,
    };
    const run = () =>
      apply.apply(
        context(),
        { calculationId: r.calculationId, applyOptionId: option.id },
        {
          text: '确认应用',
          confirmation,
          turnStartedAt: new Date(Date.now() + 2000),
        },
      );
    const receipts = await Promise.all([run(), run()]);
    expect(receipts[0].actionId).toBe(receipts[1].actionId);
    expect(await db.coachAction.count({ where: { userId: uid } })).toBe(1);
    expect(
      await db.userFitnessMetric.count({
        where: { userId: uid, type: 'LTHR' },
      }),
    ).toBe(2);
    expect(
      (
        await db.fitnessCalculation.findUniqueOrThrow({
          where: { id: r.calculationId },
        })
      ).postProcessState,
    ).toBe('PENDING');
    await db.fitnessCalculation.update({
      where: { id: r.calculationId },
      data: { applyExpiresAt: new Date(0) },
    });
    expect((await run()).actionId).toBe(receipts[0].actionId);
  }, 30000);
  it('rejects stale settings and a forged digest without any partial write', async () => {
    const r = await proposal(),
      o = r.applyOptions[0];
    const run = (digest: string) =>
      apply.apply(
        context(),
        { calculationId: r.calculationId, applyOptionId: o.id },
        {
          text: '确认应用',
          confirmation: {
            kind: 'fitness_apply_confirmation',
            calculationId: r.calculationId,
            applyOptionId: o.id,
            proposalDigest: digest,
          },
          turnStartedAt: new Date(Date.now() + 2000),
        },
      );
    await expect(run('forged')).rejects.toThrow('CONFIRMATION_REQUIRED');
    await users.upsertFitnessMetric(
      uid,
      'MAX_HR',
      201,
      'CYCLING',
      undefined,
      'MANUAL',
    );
    await expect(run(o.proposalDigest)).rejects.toThrow('STALE');
    expect(await db.coachAction.count({ where: { userId: uid } })).toBe(0);
    expect(
      await db.userFitnessMetric.count({
        where: { userId: uid, type: 'LTHR' },
      }),
    ).toBe(1);
  }, 30000);
  it('locks legacy publications and rolls back metric plus audit on finalize failure', async () => {
    const actions = new CoachActionService(
      db as never,
      {} as never,
      {} as never,
      eventEmitter as never,
    );
    await expect(
      actions.run({
        userId: uid,
        type: 'USER_THRESHOLD_UPDATE',
        riskTier: 'HIGH',
        exec: async (tx) => {
          await users.applyFitnessEstimateBatch({
            userId: uid,
            sport: 'CYCLING',
            effectiveDate: '2026-09-25',
            changes: [{ metric: 'LTHR', value: 176 }],
            calculationId: 'fixture',
            provenance: {},
            tx,
          });
          return {
            forwardData: {},
            reverseData: {},
            summary: 'fixture',
            payloadForUi: {},
          };
        },
        finalize: async () => {
          throw new Error('simulated crash');
        },
      }),
    ).rejects.toThrow('simulated crash');
    expect(await db.coachAction.count({ where: { userId: uid } })).toBe(0);
    expect(
      await db.userFitnessMetric.count({
        where: { userId: uid, type: 'LTHR' },
      }),
    ).toBe(1);
    let release: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let locked: () => void;
    const entered = new Promise<void>((r) => {
      locked = r;
    });
    const holder = db.$transaction(async (tx) => {
      await lockFitnessUser(tx, uid);
      locked();
      await gate;
    });
    await entered;
    const contender = new PrismaClient({ datasources: { db: { url } } });
    try {
      await expect(
        contender.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '100ms'");
          await tx.userFitnessMetric.create({
            data: {
              userId: uid,
              type: 'LTHR',
              value: 175,
              sport: 'CYCLING',
              source: 'MANUAL',
            },
          });
        }),
      ).rejects.toThrow();
    } finally {
      release!();
      await holder;
      await contender.$disconnect();
    }
  }, 30000);
  it('invalidates evidence on source publication and cleans artifacts on activity deletion', async () => {
    const r = await proposal();
    const a = await db.activity.findUniqueOrThrow({ where: { hashId } });
    await db.activityParquetFile.updateMany({
      where: { activityId: a.id },
      data: { checksum: 'new-version' },
    });
    await expect(
      apply.apply(
        context(),
        { calculationId: r.calculationId, applyOptionId: 'target' },
        { text: '应用吧', turnStartedAt: new Date(Date.now() + 2000) },
      ),
    ).rejects.toThrow('STALE');
    await db.activity.delete({ where: { id: a.id } });
    expect(await db.fitnessCalculation.count({ where: { userId: uid } })).toBe(
      0,
    );
  }, 30000);
  async function trackedTest() {
    const prepared = await calculations.prepare(context(), {
      methodId: 'lthr-30-minute',
      metric: 'LTHR',
      sport: 'CYCLING',
      scope: { kind: 'ACTIVITY', activityHashId: hashId },
    });
    const plan = await db.plan.create({
      data: {
        userId: uid,
        title: 'Synthetic test plan',
        periodWeeks: 1,
        startDate: new Date(),
      },
    });
    const workout = await db.planWorkout.create({
      data: {
        userId: uid,
        planId: plan.id,
        dayOffset: 0,
        scheduledDate: new Date(),
        sportType: 'CYCLING',
        name: 'Synthetic test',
        text: 'work 30m',
      },
    });
    await followup.track(
      { ...context(), now: new Date() },
      { taskId: prepared.taskId, workoutId: workout.id, action: 'OFFER' },
      '',
    );
    await followup.track(
      context(),
      { taskId: prepared.taskId, workoutId: workout.id, action: 'START' },
      '',
      {
        kind: 'fitness_tracking_reply',
        taskId: prepared.taskId,
        workoutId: workout.id,
        action: 'START',
      },
    );
    return { prepared, plan, workout };
  }
  it('recovers a lost activity event, delivers once after a notification crash, then stops on cancellation', async () => {
    const { prepared, plan, workout } = await trackedTest();
    const due = () =>
      db.fitnessAssessmentTask.update({
        where: { id: prepared.taskId },
        data: { nextCheckAt: new Date(0) },
      });
    await due();
    await followup.tick();
    expect(await db.notification.count({ where: { userId: uid } })).toBe(0);
    const activity = await db.activity.findUniqueOrThrow({ where: { hashId } });
    await db.planWorkoutActivityLink.create({
      data: {
        planId: plan.id,
        planWorkoutId: workout.id,
        activityId: activity.id,
      },
    });
    const deliver = notifications.ensureNotification.bind(notifications);
    const spy = jest
      .spyOn(notifications, 'ensureNotification')
      .mockImplementationOnce(async (args, tx) => {
        await deliver(args, tx);
        throw new Error('crash after delivery');
      });
    await due();
    await followup.tick();
    expect(await db.notification.count({ where: { userId: uid } })).toBe(0);
    expect(
      await db.fitnessCalculation.count({
        where: { userId: uid, notificationPending: true },
      }),
    ).toBe(1);
    spy.mockRestore();
    await followup.tick();
    await due();
    await followup.tick();
    expect(await db.notification.count({ where: { userId: uid } })).toBe(1);
    expect(
      await db.aiCoachMessage.count({
        where: { userId: uid, role: 'ASSISTANT' },
      }),
    ).toBe(1);
    expect(
      await db.fitnessCalculation.count({
        where: { userId: uid, notificationPending: true },
      }),
    ).toBe(0);
    expect(
      await db.userFitnessMetric.count({
        where: { userId: uid, type: 'LTHR' },
      }),
    ).toBe(1);
    await followup.track(
      context(),
      { taskId: prepared.taskId, action: 'STOP' },
      '',
      {
        kind: 'fitness_tracking_reply',
        taskId: prepared.taskId,
        action: 'STOP',
      },
    );
    await db.activityParquetFile.updateMany({
      where: { activityId: activity.id },
      data: { checksum: 'later-evidence' },
    });
    await due();
    await followup.tick();
    expect(await db.notification.count({ where: { userId: uid } })).toBe(1);
  }, 30000);
  it('recovers committed postprocessing without applying metrics again and retains applied receipts', async () => {
    const r = await proposal(),
      o = r.applyOptions[0];
    await apply.apply(
      context(),
      { calculationId: r.calculationId, applyOptionId: o.id },
      {
        text: '',
        confirmation: {
          kind: 'fitness_apply_confirmation',
          calculationId: r.calculationId,
          applyOptionId: o.id,
          proposalDigest: o.proposalDigest,
        },
        turnStartedAt: new Date(Date.now() + 2000),
      },
    );
    eventEmitter.emitAsync.mockRejectedValueOnce(
      new Error('queue unavailable') as never,
    );
    await followup.tick();
    expect(
      (
        await db.fitnessCalculation.findUniqueOrThrow({
          where: { id: r.calculationId },
        })
      ).postProcessState,
    ).toBe('PENDING');
    await db.fitnessCalculation.update({
      where: { id: r.calculationId },
      data: {
        nextAttemptAt: new Date(0),
        createdAt: new Date(Date.now() - 8 * 86400000),
      },
    });
    await followup.tick();
    await followup.tick();
    expect(
      (
        await db.fitnessCalculation.findUniqueOrThrow({
          where: { id: r.calculationId },
        })
      ).postProcessState,
    ).toBe('DONE');
    expect(await db.coachAction.count({ where: { userId: uid } })).toBe(1);
    expect(
      await db.userFitnessMetric.count({
        where: { userId: uid, type: 'LTHR' },
      }),
    ).toBe(2);
    process.env.FITNESS_DISABLED_METHODS = 'lthr-30-minute';
    try {
      expect(
        (await calculations.calculate(context(), r.calculationId)).application
          ?.refreshState,
      ).toBe('DONE');
    } finally {
      delete process.env.FITNESS_DISABLED_METHODS;
    }
  }, 30000);
  it('stops expired or revoked tracking without producing notifications', async () => {
    const { prepared } = await trackedTest();
    consentGranted = false;
    await db.fitnessAssessmentTask.update({
      where: { id: prepared.taskId },
      data: { nextCheckAt: new Date(0) },
    });
    await followup.tick();
    expect(
      (
        await db.fitnessAssessmentTask.findUniqueOrThrow({
          where: { id: prepared.taskId },
        })
      ).tracking,
    ).toBe(false);
    expect(await db.notification.count({ where: { userId: uid } })).toBe(0);
  }, 30000);
  it('rejects same-turn adoption, cross-session reads, and disabled method adoption', async () => {
    const r = await proposal(),
      o = r.applyOptions[0];
    await expect(
      calculations.calculation(
        { ...context(), sessionId: 'other' },
        r.calculationId,
      ),
    ).rejects.toThrow();
    const args = { calculationId: r.calculationId, applyOptionId: o.id };
    await expect(
      apply.apply(context(), args, {
        text: '应用',
        turnStartedAt: new Date(0),
      }),
    ).rejects.toThrow('STALE');
    process.env.FITNESS_DISABLED_METHODS = 'lthr-30-minute';
    try {
      await expect(
        apply.apply(context(), args, {
          text: '应用',
          turnStartedAt: new Date(Date.now() + 2000),
        }),
      ).rejects.toThrow('METHOD_UNAVAILABLE');
    } finally {
      delete process.env.FITNESS_DISABLED_METHODS;
    }
    expect(await db.coachAction.count({ where: { userId: uid } })).toBe(0);
  }, 30000);

  it('natural consent applies only the unique proposal from the preceding assistant turn', async () => {
    const r = await proposal();
    // An obsolete task revision is not a second valid proposal.
    const original = await db.fitnessCalculation.findUniqueOrThrow({
      where: { id: r.calculationId },
    });
    await db.fitnessCalculation.create({
      data: {
        ...original,
        id: `obsolete-${original.id}`,
        taskRevision: original.taskRevision - 1,
      } as never,
    });
    await db.aiCoachMessage.create({
      data: {
        userId: uid,
        sessionId: 'fitness-it',
        sequence: 2,
        role: 'ASSISTANT',
        content: 'Unrelated later answer',
      },
    });
    await expect(
      apply.apply(
        context(),
        { calculationId: r.calculationId, applyOptionId: 'target' },
        { text: '应用吧', turnStartedAt: new Date(Date.now() + 2000) },
      ),
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
    await db.aiCoachMessage.deleteMany({ where: { userId: uid, sequence: 2 } });
    await expect(
      apply.apply(
        context(),
        { calculationId: r.calculationId, applyOptionId: 'target' },
        { text: '不要应用', turnStartedAt: new Date(Date.now() + 2000) },
      ),
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
    expect(
      (
        await apply.apply(
          context(),
          { calculationId: r.calculationId, applyOptionId: 'target' },
          { text: '应用吧', turnStartedAt: new Date(Date.now() + 2000) },
        )
      ).ok,
    ).toBe(true);
  }, 30000);
  it('returns an observation, never a threshold, when the user rejects the test premise', async () => {
    const prepared = await calculations.prepare(context(), {
      methodId: 'lthr-30-minute',
      metric: 'LTHR',
      sport: 'CYCLING',
      scope: { kind: 'ACTIVITY', activityHashId: hashId },
      segment: { activityHashId: hashId, startSeconds: 0 },
    });
    await calculations.markPresented(
      context(),
      [prepared.calculationId],
      'protocol-question',
    );
    const observation = await calculations.protocolReply(
      context(),
      prepared.calculationId,
      prepared.taskRevision,
      'ORDINARY',
      'user-message',
    );
    expect(observation.status).toBe('OBSERVATION_ONLY');
    expect(observation.observations[0].value).toBe(176);
    expect(observation.candidates).toEqual([]);
    expect(observation.applyOptions).toEqual([]);
    expect(
      await db.userFitnessMetric.count({
        where: { userId: uid, type: 'LTHR' },
      }),
    ).toBe(1);
  }, 30000);
  it('garbage-collects unapplied evidence but can reassess from the owned task', async () => {
    const r = await proposal();
    await db.fitnessCalculation.update({
      where: { id: r.calculationId },
      data: { createdAt: new Date(Date.now() - 8 * 86400000) },
    });
    await followup.tick();
    expect(
      await db.fitnessCalculation.findUnique({
        where: { id: r.calculationId },
      }),
    ).toBeNull();
    const newResult = await calculations.recompute(
      context(),
      r.calculationId,
      r.taskId,
    );
    expect(newResult.calculationId).not.toBe(r.calculationId);
    expect(newResult.requestedScope).toEqual(r.requestedScope);
    await expect(
      calculations.recompute(
        { ...context(), userId: 'another-user' },
        r.calculationId,
        r.taskId,
      ),
    ).rejects.toThrow();
  }, 30000);
  it('rolls back a conflicting batch and erases frozen evidence on consent revocation', async () => {
    const r = await proposal();
    await expect(
      db.$transaction((tx) =>
        users.applyFitnessEstimateBatch({
          userId: uid,
          sport: 'CYCLING',
          effectiveDate: '2026-09-25',
          changes: [
            { metric: 'MAX_HR', value: 180 },
            { metric: 'LTHR', value: 185 },
          ],
          calculationId: r.calculationId,
          provenance: {},
          tx,
        }),
      ),
    ).rejects.toThrow('REFERENCE_CONFLICT');
    expect(await db.userFitnessMetric.count({ where: { userId: uid } })).toBe(
      3,
    );
    const setting = await db.userSetting.create({
      data: {
        userId: uid,
        category: 'AI_DATA_CONSENT',
        value: '{"granted":true}',
      },
    });
    await db.userSetting.update({
      where: { id: setting.id },
      data: { value: '{"granted":false}' },
    });
    expect(await db.fitnessCalculation.count({ where: { userId: uid } })).toBe(
      0,
    );
    expect(
      (
        await db.fitnessAssessmentTask.findUniqueOrThrow({
          where: { id: r.taskId },
        })
      ).stage,
    ).toBe('CLOSED');
  }, 30000);
  it('accepts refusal before a test segment is selected without looping or inventing a protocol', async () => {
    const prepared = await calculations.prepare(context(), {
      methodId: 'lthr-30-minute',
      metric: 'LTHR',
      sport: 'CYCLING',
      scope: { kind: 'ACTIVITY', activityHashId: hashId },
    });
    expect(prepared.reasonCode).toBe('AMBIGUOUS_SCOPE');
    await calculations.markPresented(
      context(),
      [prepared.calculationId],
      'segment-question',
    );
    const skipped = await calculations.protocolReply(
      context(),
      prepared.calculationId,
      prepared.taskRevision,
      'SKIP',
      'user-refusal',
    );
    expect(skipped.status).toBe('OBSERVATION_ONLY');
    expect(skipped.reasonCode).toBe('PROTOCOL_UNCONFIRMED');
    expect(skipped.nextActions).toEqual([]);
    expect(skipped.applyOptions).toEqual([]);
  }, 30000);
  it('uses the same frozen calculation contract for CS, TP, VDOT, VO2 and observed MaxHR without writes', async () => {
    const profileBefore = await db.userFitnessMetric.findMany({
      where: { userId: uid },
      orderBy: { id: 'asc' },
    });
    for (const [i, time] of [225, 475, 725].entries()) {
      const a = await db.activity.create({
        data: {
          userId: uid,
          hashId: `preview-${uid}-${i}`,
          sportType: 'RUN',
          processingStatus: 'READY',
          startTime: start,
          endTime: new Date(start.getTime() + 1800000),
          elapsedTime: 1800,
          timerTime: 1800,
          distance: 7000,
        },
      });
      await db.activityPeakMetric.create({
        data: {
          activityId: a.id,
          sport: 'RUN',
          type: 'pace',
          scaleType: 'DISTANCE',
          scaleValue: 4 * time + 100,
          value: (4 * time + 100) / time,
        },
      });
      if (i === 0)
        await db.activityPeakMetric.create({
          data: {
            activityId: a.id,
            sport: 'RUN',
            type: 'pace',
            scaleType: 'DISTANCE',
            scaleValue: 5000,
            value: 5000 / 1200,
          },
        });
      await db.activityPeakMetric.create({
        data: {
          activityId: a.id,
          sport: 'RUN',
          type: 'hr',
          scaleType: 'TIME',
          scaleValue: 1,
          value: 180 + i,
        },
      });
      await db.activityVO2Max.create({
        data: { activityId: a.id, sport: 'RUN', vo2maxVdotByHr: 50 },
      });
    }
    await db.userFitnessMetric.create({
      data: {
        userId: uid,
        sport: 'RUN',
        type: 'TP',
        source: 'MANUAL',
        value: 4,
        recordedAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    for (const [methodId, metric, value] of [
      ['critical-speed', 'CS', 4],
      ['running-5k-threshold-pace', 'TP', 260],
      ['running-performance-vdot', 'VO2_MAX', 49.81],
      ['running-effective-vo2max', 'VO2_MAX', 50],
    ] as const) {
      const prepared = await calculations.prepare(context(), {
        methodId,
        metric,
        sport: 'RUN',
        scope: { kind: 'RECENT', days: 90 },
      });
      expect(prepared.preparationStatus).toBe('READY');
      const result = await calculations.calculate(
        context(),
        prepared.calculationId,
      );
      expect(result.candidates[0].value).toBeCloseTo(value, 1);
      expect(result.applyOptions).toHaveLength(1);
      if (metric === 'TP') {
        expect(result.candidates[0].currentValue).toBe(250);
        expect(result.candidates[0].delta).toBe(10);
      }
      expect(
        (
          await db.fitnessCalculation.findUniqueOrThrow({
            where: { id: result.calculationId },
          })
        ).input,
      ).toHaveProperty('preview');
    }
    const p = await calculations.prepare(context(), {
      methodId: 'observed-max-hr',
      metric: 'MAX_HR',
      sport: 'RUN',
      scope: { kind: 'RECENT' },
    });
    const r = await calculations.calculate(context(), p.calculationId);
    expect(r.status).toBe('OBSERVATION_ONLY');
    expect(r.observations[0].value).toBe(182);
    expect(r.candidates).toEqual([]);
    expect(await db.userFitnessMetric.count({ where: { userId: uid } })).toBe(
      profileBefore.length + 1,
    );
    expect(await db.coachAction.count({ where: { userId: uid } })).toBe(0);
    const owned = await db.activity.findFirstOrThrow({
      where: { userId: uid, sportType: 'RUN' },
    });
    await db.activity.delete({ where: { id: owned.id } });
    expect(await db.fitnessCalculation.count({ where: { userId: uid } })).toBe(
      0,
    );
  }, 30000);

  it('reads resting HR from scoped canonical daily facts and returns explicit unavailable methods', async () => {
    const today = start.toLocaleDateString('sv-SE', {
      timeZone: 'Asia/Shanghai',
    });
    await db.userDailyHealthMetric.create({
      data: {
        userId: uid,
        date: new Date(today + 'T00:00:00Z'),
        timezone: 'Asia/Shanghai',
        metricType: 'RESTING_HEART_RATE_BPM',
        value: 53,
        unit: 'bpm',
      },
    });
    const prepared = await calculations.prepare(context(), {
      methodId: 'daily-resting-hr',
      metric: 'RESTING_HR',
      sport: 'UNKNOWN',
      scope: { kind: 'DATE', localDate: today },
    });
    expect(prepared.preparationStatus).toBe('READY');
    const r = await calculations.calculate(context(), prepared.calculationId);
    expect(r.candidates[0]).toMatchObject({
      metric: 'RESTING_HR',
      value: 53,
      unit: 'bpm',
    });
    expect(r.evidence.dailyRecordCount).toBe(1);
    expect(r.evidence.activityCount).toBe(0);
    expect(r.applyOptions).toHaveLength(1);
    const badScope = await calculations.prepare(context(), {
      methodId: 'daily-resting-hr',
      metric: 'RESTING_HR',
      sport: 'UNKNOWN',
      scope: { kind: 'ACTIVITY', activityHashId: hashId },
    });
    expect(badScope.reasonCode).toBe('SCOPE_UNSUPPORTED');
    expect(badScope.nextActions).toEqual([]);
    const unsupported = await calculations.prepare(context(), {
      methodId: 'aerobic-threshold-unavailable',
      metric: 'AET_HR',
      sport: 'RUN',
      scope: { kind: 'RECENT' },
    });
    expect(unsupported.reasonCode).toBe('METHOD_UNAVAILABLE');
    expect(unsupported.nextActions).toEqual([]);
    expect(unsupported.limitations).toContain('NO_VALIDATED_AEROBIC_METHOD');
    expect(await db.userFitnessMetric.count({ where: { userId: uid } })).toBe(
      3,
    );
  }, 30000);
  it('excludes activity peaks published after a historical assessment cutoff', async () => {
    const prepared = await calculations.prepare(context(), {
      methodId: 'observed-max-hr',
      metric: 'MAX_HR',
      sport: 'CYCLING',
      scope: {
        kind: 'RECENT',
        asOf: new Date(start.getTime() + 15 * 60000).toISOString(),
      },
    });
    expect(prepared.evidence.activityCount).toBe(1);
    expect(prepared.evidence.readyCount).toBe(0);
    expect(prepared.reasonCode).toBe('MISSING_SIGNAL');
    expect(prepared.candidates).toEqual([]);
    expect(prepared.applyOptions).toEqual([]);
  }, 30000);
  async function genericProposal(
    methodId: string,
    metric: 'CS' | 'TP' | 'VO2_MAX' | 'MAX_HR' | 'RESTING_HR',
  ) {
    for (const [i, t] of [225, 475, 725].entries()) {
      const a = await db.activity.create({
        data: {
          userId: uid,
          hashId: `adopt-${uid}-${i}`,
          sportType: 'RUN',
          processingStatus: 'READY',
          startTime: start,
          endTime: new Date(start.getTime() + 1800000),
          elapsedTime: 1800,
          timerTime: 1800,
          distance: 7000,
        },
      });
      await db.activityPeakMetric.createMany({
        data: [
          {
            activityId: a.id,
            sport: 'RUN',
            type: 'pace',
            scaleType: 'DISTANCE',
            scaleValue: 4 * t + 100,
            value: (4 * t + 100) / t,
          },
          {
            activityId: a.id,
            sport: 'RUN',
            type: 'pace',
            scaleType: 'DISTANCE',
            scaleValue: 5000,
            value: 5000 / 1200,
          },
          {
            activityId: a.id,
            sport: 'RUN',
            type: 'hr',
            scaleType: 'TIME',
            scaleValue: 1,
            value: 190,
          },
        ],
      });
      await db.activityVO2Max.create({
        data: { activityId: a.id, sport: 'RUN', vo2maxVdotByHr: 50 },
      });
    }
    await db.userDailyHealthMetric.create({
      data: {
        userId: uid,
        date: new Date(
          start.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) +
            'T00:00:00Z',
        ),
        timezone: 'Asia/Shanghai',
        metricType: 'RESTING_HEART_RATE_BPM',
        value: 53,
        unit: 'bpm',
      },
    });
    const p = await calculations.prepare(context(), {
      methodId,
      metric,
      sport: metric === 'RESTING_HR' ? 'UNKNOWN' : 'RUN',
      scope: { kind: 'RECENT' },
    });
    const r = await calculations.calculate(context(), p.calculationId);
    expect(r.applyOptions).toHaveLength(1);
    await calculations.markPresented(
      context(),
      [r.calculationId],
      'shown-result',
    );
    return r;
  }
  function adoptResult(r: Awaited<ReturnType<typeof genericProposal>>) {
    const option = r.applyOptions[0];
    return apply.apply(
      context(),
      { calculationId: r.calculationId, applyOptionId: option.id },
      {
        text: '确认采用',
        turnStartedAt: new Date(Date.now() + 3000),
        confirmation: {
          kind: 'fitness_apply_confirmation',
          calculationId: r.calculationId,
          applyOptionId: option.id,
          proposalDigest: option.proposalDigest,
        },
      },
    );
  }
  it.each([
    ['critical-speed', 'CS', 4],
    ['running-5k-threshold-pace', 'TP', 1000 / 260],
    ['running-performance-vdot', 'VO2_MAX', 49.81],
    ['running-effective-vo2max', 'VO2_MAX', 50],
    ['observed-max-hr', 'MAX_HR', 190],
    ['daily-resting-hr', 'RESTING_HR', 53],
  ] as Array<[string, Parameters<typeof genericProposal>[1], number]>)(
    'adopts %s as a user-selected reference with correct storage units and idempotent receipts',
    async (methodId, metric, value) => {
      const r = await genericProposal(methodId, metric);
      expect(await db.userFitnessMetric.count({ where: { userId: uid } })).toBe(
        3,
      );
      const settled = await Promise.allSettled([
        adoptResult(r),
        adoptResult(r),
      ]);
      const receipts = settled.map((r) => {
        if (r.status === 'rejected') throw r.reason;
        return r.value;
      });
      expect(receipts[0].actionId).toBe(receipts[1].actionId);
      const rows = await db.userFitnessMetric.findMany({
        where: {
          userId: uid,
          type: metric,
          sport: metric === 'VO2_MAX' ? 'UNKNOWN' : r.sport,
          source: 'MANUAL',
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBeCloseTo(value, 6);
      expect(rows[0].originPayload).toHaveProperty(
        'adoptionBasis',
        metric === 'MAX_HR'
          ? 'USER_SELECTED_OBSERVATION'
          : 'USER_SELECTED_ESTIMATE',
      );
      expect(await db.userFitnessMetric.count({ where: { userId: uid } })).toBe(
        4,
      );
    },
    30000,
  );
  it('rejects superseded VDOT policies but preserves previously applied receipts', async () => {
    const r = await genericProposal('running-performance-vdot', 'VO2_MAX');
    await db.fitnessCalculation.update({
      where: { id: r.calculationId },
      data: { policyVersion: '2' },
    });
    await expect(adoptResult(r)).rejects.toThrow('METHOD_UNAVAILABLE');
    expect(
      await db.userFitnessMetric.count({
        where: { userId: uid, type: 'VO2_MAX' },
      }),
    ).toBe(0);
    await db.fitnessCalculation.update({
      where: { id: r.calculationId },
      data: { policyVersion: '3' },
    });
    const receipt = await adoptResult(r);
    await db.fitnessCalculation.update({
      where: { id: r.calculationId },
      data: { policyVersion: '2' },
    });
    expect((await adoptResult(r)).actionId).toBe(receipt.actionId);
    expect(
      await db.userFitnessMetric.count({
        where: { userId: uid, type: 'VO2_MAX' },
      }),
    ).toBe(1);
  }, 30000);
  it('recomputes an old VDOT artifact into the canonical VO2_MAX task and result', async () => {
    const r = await genericProposal('running-performance-vdot', 'VO2_MAX');
    const row = await db.fitnessCalculation.findUniqueOrThrow({
      where: { id: r.calculationId },
    });
    const input = row.input as any;
    input.request.metric = 'VDOT';
    await db.fitnessAssessmentTask.update({
      where: { id: r.taskId },
      data: { request: input.request },
    });
    await db.fitnessCalculation.update({
      where: { id: r.calculationId },
      data: { input, policyVersion: '2' },
    });
    const prepared = await calculations.recompute(
      { ...context(), now: new Date(Date.now() + 5000) },
      r.calculationId,
    );
    const task = await db.fitnessAssessmentTask.findUniqueOrThrow({
      where: { id: r.taskId },
    });
    expect(task.request).toHaveProperty('metric', 'VO2_MAX');
    expect(task.revision).toBe(r.taskRevision + 1);
    const result = await calculations.calculate(
      context(),
      prepared.calculationId,
    );
    expect(result.candidates[0].metric).toBe('VO2_MAX');
    expect(result.applyOptions[0].changes[0].metric).toBe('VO2_MAX');
    expect(
      await db.userFitnessMetric.count({
        where: { userId: uid, type: 'VO2_MAX' },
      }),
    ).toBe(0);
  }, 30000);
  it.each([
    ['daily-resting-hr', 'RESTING_HR'],
    ['running-effective-vo2max', 'VO2_MAX'],
  ] as Array<[string, 'RESTING_HR' | 'VO2_MAX']>)(
    'rejects adoption when newly supported evidence changes: %s',
    async (methodId, metric) => {
      const r = await genericProposal(methodId, metric);
      if (metric === 'RESTING_HR')
        await db.userDailyHealthMetric.updateMany({
          where: { userId: uid },
          data: { value: 55 },
        });
      else
        await db.activityVO2Max.updateMany({
          where: { activity: { userId: uid } },
          data: { vo2maxVdotByHr: 55 },
        });
      await expect(adoptResult(r)).rejects.toThrow('STALE');
      expect(await db.userFitnessMetric.count({ where: { userId: uid } })).toBe(
        3,
      );
      expect(await db.coachAction.count({ where: { userId: uid } })).toBe(0);
    },
    30000,
  );
  it.each(['CP', 'FTP', 'W_PRIME', 'P_MAX'] as const)(
    'adopts %s through the shared measured-power calculation and confirmation path',
    async (metric) => {
      powerFixture = true;
      const activity = await db.activity.findUniqueOrThrow({
        where: { hashId },
      });
      await db.activity.update({
        where: { id: activity.id },
        data: {
          elapsedTime: 7200,
          timerTime: 7200,
          endTime: new Date(start.getTime() + 7200000),
        },
      });
      await db.activitySource.create({
        data: {
          userId: uid,
          activityId: activity.id,
          sourceKind: 'FILE',
          sourceUid: uid,
          isPrimary: true,
          isActive: true,
          metadata: { datasetQuality: { powerCoverage: 1 } },
        },
      });
      const p = await calculations.prepare(context(), {
        methodId: 'cycling-extended-cp',
        metric,
        sport: 'CYCLING',
        scope: { kind: 'ACTIVITY', activityHashId: hashId },
      });
      expect(p.preparationStatus).toBe('READY');
      const r = await calculations.calculate(context(), p.calculationId);
      expect(r.status).toBe('ESTIMATED');
      expect(r.applyOptions).toHaveLength(1);
      await calculations.markPresented(
        context(),
        [r.calculationId],
        'shown-power',
      );
      await adoptResult(r);
      const saved = await db.userFitnessMetric.findFirstOrThrow({
        where: { userId: uid, type: metric, source: 'MANUAL' },
      });
      expect(saved.value).toBe(r.candidates[0].value);
      expect(saved.originPayload).toHaveProperty(
        'adoptionBasis',
        'USER_SELECTED_ESTIMATE',
      );
    },
    30000,
  );
  it('rolls back a global resting-HR adoption conflicting with an inheriting sport reference', async () => {
    await db.userFitnessMetric.create({
      data: {
        userId: uid,
        type: 'MAX_HR',
        sport: 'RUN',
        source: 'MANUAL',
        value: 90,
        recordedAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    const r = await genericProposal('daily-resting-hr', 'RESTING_HR');
    await expect(adoptResult(r)).rejects.toThrow('REFERENCE_CONFLICT:RUN');
    expect(
      await db.userFitnessMetric.count({
        where: { userId: uid, sport: 'UNKNOWN' },
      }),
    ).toBe(0);
    expect(await db.coachAction.count({ where: { userId: uid } })).toBe(0);
  }, 30000);
});
