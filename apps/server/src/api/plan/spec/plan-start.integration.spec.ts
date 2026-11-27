import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  planStartFixture,
  raceWithPlanWriteCheckpoint,
  raceWithUncommittedPlanWrite,
} from './plan-start.fixture';
import type { PlanStartPreviewRequest } from '@shared/plan-proposal';
import { PlanLoadEstimatorService } from '../application/plan-load-estimator.service';
import { PlanScheduledActivationWorker } from '../application/plan-scheduled-activation.worker';
import { PlanExternalSyncService } from '../application/plan-external-sync.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PLAN_WORKOUTS_CHANGED_EVENT } from '../events/plan.events';

describe('saved draft START / PostgreSQL', () => {
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
    Object.assign(f.context, {
      planSummary: {
        summarize: async () => ({
          totals: {
            completionRate: 0, complianceRate: null, doneCount: 0,
            workoutCount: 0, skippedCount: 0, movedCount: 0,
          },
        }),
      },
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
    await prisma.$executeRawUnsafe(
      "INSERT INTO t_user(id) VALUES ('user'),('other')",
    );
  });
  const nativeIt = process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN ? it : it.skip;

  async function scheduledReplacement(
    sourceStatus: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' = 'ACTIVE',
  ) {
    const startDate = new Date('2026-01-01T00:00:00.000Z');
    const source = await prisma.plan.create({
      data: {
        userId: 'user',
        title: 'Source plan',
        periodWeeks: 2,
        status: sourceStatus,
        startDate,
      },
    });
    const successor = await prisma.plan.create({
      data: {
        userId: 'user',
        title: 'Scheduled successor',
        periodWeeks: 2,
        status: 'SCHEDULED',
        supersedesPlanId: source.id,
        scheduledActivationAt: startDate,
        startDate,
      },
    });
    await f.context.ensureContext({
      userId: 'user', planId: source.id, startDate,
      status: sourceStatus === 'ACTIVE' || sourceStatus === 'PAUSED'
        ? 'ACTIVE' : 'FINALIZED',
    });
    await f.context.ensureContext({
      userId: 'user', planId: successor.id, startDate, status: 'SCHEDULED',
    });
    return { source, successor };
  }

  function activationWorker(context = f.context) {
    return new PlanScheduledActivationWorker(
      prisma as never,
      new PlanRepository(prisma as never),
      context,
      { ensureNotification: async () => undefined } as never,
    );
  }

  it('cancels only the linked scheduled successor and releases activation for a new draft', async () => {
    const next = await draft(1);
    const unrelatedForUser = await prisma.plan.create({
      data: { userId: 'user', title: 'Different schedule', status: 'SCHEDULED', periodWeeks: 1 },
    });
    const { source, successor } = await scheduledReplacement();
    const unrelated = await prisma.plan.create({
      data: {
        userId: 'other', title: 'Other scheduled plan', status: 'SCHEDULED',
        periodWeeks: 1,
      },
    });
    const workout = await prisma.planWorkout.create({
      data: {
        userId: 'user', planId: successor.id, dayOffset: 0, sportType: 'RUN',
        text: 'work 20m', scheduledDate: successor.startDate,
      },
    });
    const mapping = await prisma.planWorkoutExternalMapping.create({
      data: {
        userId: 'user', provider: 'intervals_icu', planWorkoutId: workout.id,
        externalEventId: 'scheduled-successor',
      },
    });
    const notifications: unknown[] = [];
    const events = new EventEmitter2();
    events.on(PLAN_WORKOUTS_CHANGED_EVENT, (event) => { notifications.push(event); });
    Object.assign(f.write, { events });

    try {
      const result = await prisma.$transaction(async (tx) => {
        const cancellation = await f.write.cancelPlan('user', source.id, undefined, undefined, { tx });
        expect(notifications).toHaveLength(0);
        return cancellation;
      });
      expect(notifications).toHaveLength(0);
      await result.afterCommit();
    } finally {
      Object.assign(f.write, { events: undefined });
    }
    expect(notifications).toEqual([
      expect.objectContaining({ userId: 'user', reason: 'plan_cancel', planId: source.id }),
    ]);
    await expect(prisma.planWorkoutExternalMapping.findUniqueOrThrow({
      where: { id: mapping.id },
    })).resolves.toMatchObject({ syncState: 'LOCAL_DELETED', localDeletedAt: expect.any(Date) });
    await activationWorker().tick();
    await expect(prisma.plan.findUniqueOrThrow({ where: { id: successor.id } }))
      .resolves.toMatchObject({
        status: 'CANCELLED',
        supersedesPlanId: source.id,
        scheduledActivationAt: null,
        cancelledAt: expect.any(Date),
      });
    await expect(prisma.plan.findMany({
      where: { id: { in: [unrelated.id, unrelatedForUser.id] } },
      select: { status: true },
    })).resolves.toEqual([{ status: 'SCHEDULED' }, { status: 'SCHEDULED' }]);
    await expect(f.write.activatePlan(
      'user', next.planId, '2099-11-22', undefined, { validatedStartPreview: true },
    )).resolves.toMatchObject({ plan: { status: 'ACTIVE' } });
  });

  it('blocks a competing draft activation while a valid replacement is scheduled', async () => {
    const { successor } = await scheduledReplacement('COMPLETED');
    const next = await draft(1);
    const activate = () => f.write.activatePlan(
      'user', next.planId, '2099-11-22', undefined, { validatedStartPreview: true },
    );
    await expect(activate()).rejects.toMatchObject({
      response: {
        code: 'PLAN_SCHEDULED_ACTIVATION_PENDING',
        data: { scheduledPlanId: successor.id },
      },
    });
    await f.service.cancelPlan('user', successor.id);
    await expect(prisma.plan.findUniqueOrThrow({ where: { id: successor.id } }))
      .resolves.toMatchObject({ status: 'CANCELLED', supersedesPlanId: null });
    await expect(activate()).resolves.toMatchObject({ plan: { status: 'ACTIVE' } });
  });

  it('does not reserve activation or replacement for a historical schedule with a cancelled source', async () => {
    const { source, successor } = await scheduledReplacement('CANCELLED');
    const ghostWorkout = await prisma.planWorkout.create({
      data: {
        userId: 'user', planId: successor.id, dayOffset: 0, sportType: 'RUN',
        text: 'work 20m', scheduledDate: successor.startDate,
      },
    });
    const next = await draft(1);
    const staleSchedules = () => prisma.plan.findMany({
      where: {
        userId: 'user', status: 'SCHEDULED', supersedes: { status: 'CANCELLED' },
      },
      select: { id: true, supersedesPlanId: true },
    });
    await expect(staleSchedules()).resolves.toEqual([
      { id: successor.id, supersedesPlanId: source.id },
    ]);
    await expect(f.write.activatePlan(
      'user', next.planId, '2099-11-22', undefined, { validatedStartPreview: true },
    )).resolves.toMatchObject({ plan: { status: 'ACTIVE' } });
    const preview = await f.proposals.createPreview('user', {
      mode: 'SUPERSEDE',
      sourcePlanId: next.planId,
      effectiveFrom: '2099-11-24',
      rationale: 'Preserve the flexible training schedule.',
      evidenceRefs: [{ type: 'recent_load', label: 'Recent training load' }],
      plan: {
        title: 'New replacement',
        periodWeeks: 1,
        workouts: [{ weekIndex: 1, dayIndex: 1, sportType: 'RUN', text: 'work 25m' }],
      },
    });
    const branch = await prisma.coachBranch.findUniqueOrThrow({
      where: { id: next.binding.branchId },
    });
    const decision = await prisma.coachDecision.create({
      data: {
        branchId: branch.id,
        contextId: branch.contextId,
        decisionType: 'PLAN_SUPERSESSION',
        state: 'APPROVED',
        payload: preview.decisionPayload,
      },
    });
    await prisma.$transaction(async (tx) => {
      await f.proposals.claimDecision({
        previewId: preview.previewId,
        decisionId: decision.id,
        userId: 'user',
        sourcePlanId: next.planId,
        tx,
      });
      await f.apply.apply({
        userId: 'user',
        branchId: branch.id,
        decisionId: decision.id,
        contextPlanId: next.planId,
        previewId: preview.previewId,
        tx,
      });
    });
    const replacement = await prisma.plan.findUniqueOrThrow({
      where: { supersedesPlanId: next.planId },
    });
    expect(replacement.status).toBe('SCHEDULED');
    await expect(staleSchedules()).resolves.toHaveLength(1);

    const feedPlanIds = (await f.query.findCalendarFeedPlans('user')).map(({ id }) => id);
    expect(feedPlanIds).toContain(replacement.id);
    expect(feedPlanIds).not.toContain(successor.id);
    const sync = Object.assign(
      Object.create(PlanExternalSyncService.prototype) as PlanExternalSyncService,
      { workouts: new PlanWorkoutRepository(prisma as never) },
    );
    const exported = await sync.findExportWindowWorkouts({
      userId: 'user',
      start: ghostWorkout.scheduledDate!,
      end: new Date('2099-11-28'),
    });
    expect(exported.map(({ planId }) => planId)).toContain(replacement.id);
    expect(exported.map(({ id }) => id)).not.toContain(ghostWorkout.id);
  });

  it('can resume a paused source until its own scheduled successor takes over', async () => {
    const { source, successor } = await scheduledReplacement('PAUSED');
    await expect(f.write.activatePlan('user', source.id))
      .resolves.toMatchObject({ plan: { status: 'ACTIVE' } });
    await expect(prisma.plan.findUniqueOrThrow({ where: { id: successor.id } }))
      .resolves.toMatchObject({ status: 'SCHEDULED', supersedesPlanId: source.id });
  });

  it('leaves the active replacement intact if scheduled activation won first', async () => {
    const { source, successor } = await scheduledReplacement();
    await activationWorker().tick();
    await expect(f.service.cancelPlan('user', source.id)).rejects.toThrow(
      'Plan cannot be cancelled',
    );
    await expect(prisma.plan.findUniqueOrThrow({ where: { id: successor.id } }))
      .resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('rolls both cancellations back with the caller transaction', async () => {
    const { source, successor } = await scheduledReplacement();
    await expect(prisma.$transaction(async (tx) => {
      await f.write.cancelPlan('user', source.id, undefined, undefined, { tx });
      throw new Error('abort plan cancellation');
    })).rejects.toThrow('abort plan cancellation');
    await expect(prisma.plan.findMany({
      where: { id: { in: [source.id, successor.id] } },
      select: { status: true },
    })).resolves.toEqual(expect.arrayContaining([
      { status: 'ACTIVE' }, { status: 'SCHEDULED' },
    ]));
  });

  nativeIt('serializes a scheduled activation behind a source cancellation', async () => {
    const { source, successor } = await scheduledReplacement();
    await expect(raceWithUncommittedPlanWrite(
      prisma,
      (tx) => f.write.cancelPlan('user', source.id, undefined, undefined, { tx }),
      () => activationWorker().tick(),
    )).resolves.toMatchObject({ status: 'fulfilled' });
    await expect(prisma.plan.findUniqueOrThrow({ where: { id: successor.id } }))
      .resolves.toMatchObject({ status: 'CANCELLED' });
  });

  nativeIt('serializes a source cancellation behind a scheduled activation', async () => {
    const { source, successor } = await scheduledReplacement();
    const result = await raceWithPlanWriteCheckpoint(
      prisma,
      (hold) => {
        const context = Object.create(f.context) as typeof f.context;
        context.ensureContext = async (args) => {
          const saved = await f.context.ensureContext(args);
          if (args.planId === successor.id) await hold();
          return saved;
        };
        return activationWorker(context).tick();
      },
      () => f.service.cancelPlan('user', source.id),
    );
    expect(result).toMatchObject({
      status: 'rejected', reason: { message: 'Plan cannot be cancelled' },
    });
    await expect(prisma.plan.findUniqueOrThrow({ where: { id: successor.id } }))
      .resolves.toMatchObject({ status: 'ACTIVE' });
  });

  async function draft(
    count = 2,
    overrides?: Partial<Parameters<typeof f.service.createPlan>[1]>,
    startDate = '2099-11-22',
  ) {
    const created = await f.service.createPlan('user', {
      title: 'Draft',
      periodWeeks: Math.max(1, Math.ceil(count / 7)),
      workouts: Array.from({ length: count }, (_, i) => ({
        weekIndex: Math.floor(i / 7) + 1,
        dayIndex: (i % 7) + 1,
        sportType: 'RUN',
        definition: {
          kind: 'FREEFORM',
          version: 1,
          source: 'TEXT',
          text: 'Run 30m',
        },
      })),
      ...overrides,
    });
    const planId = created.plan!.id;
    const session = await f.starts.conversation('user', planId, startDate);
    const context = await f.context.ensureContext({ userId: 'user', planId });
    const thread = await prisma.coachThread.create({
      data: { contextId: context.id },
    });
    const branch = await prisma.coachBranch.create({
      data: { threadId: thread.id, contextId: context.id, baseEventSeq: 0 },
    });
    await prisma.aiCoachSession.update({
      where: { userId_id: { userId: 'user', id: session.sid } },
      data: { planStartBranchId: branch.id },
    });
    const request: PlanStartPreviewRequest = {
      mode: 'START',
      planId,
      startDate,
      rationale: 'Reviewed current evidence',
      evidenceRefs: [],
      changes: [],
      additions: [],
      deletions: [],
      preserveUnmentioned: true,
    };
    return {
      planId,
      session,
      binding: { sid: session.sid, branchId: branch.id },
      request,
    };
  }
  it('expands an unchanged 120-course draft into the complete immutable candidate, preserving every identity', async () => {
    const d = await draft(120);
    const preview = await f.proposals.createPreview(
      'user',
      d.request,
      d.binding,
    );
    expect(preview).toMatchObject({
      mode: 'START',
      decisionType: 'PLAN_START',
      presentation: {
        counts: {
          total: 120,
          changed: 0,
          preserved: 120,
          added: 0,
          deleted: 0,
        },
      },
    });
    const saved = await prisma.planProposalPreview.findUniqueOrThrow({
      where: { id: preview.previewId },
    });
    const proposal = saved.proposal as {
      preserved: unknown[];
      candidate: unknown[];
    };
    expect(proposal.preserved).toHaveLength(120);
    expect(proposal.candidate).toHaveLength(120);
    expect((await f.service.getPlanDetail('user', d.planId)).plan!.status).toBe(
      'DRAFT',
    );
  });
  async function confirmed(d: Awaited<ReturnType<typeof draft>>) {
    const preview = await f.proposals.createPreview(
      'user',
      d.request,
      d.binding,
    );
    const branch = await prisma.coachBranch.findUniqueOrThrow({
      where: { id: d.binding.branchId },
    });
    const decision = await prisma.coachDecision.create({
      data: {
        branchId: branch.id,
        contextId: branch.contextId,
        decisionType: 'PLAN_START',
        state: 'APPROVED',
        payload: preview.decisionPayload,
      },
    });
    await prisma.$transaction((tx) =>
      f.proposals.claimDecision({
        previewId: preview.previewId,
        decisionId: decision.id,
        userId: 'user',
        sourcePlanId: d.planId,
        tx,
      }),
    );
    return {
      preview,
      decision,
      args: {
        userId: 'user',
        decisionId: decision.id,
        branchId: branch.id,
        contextPlanId: d.planId,
        previewId: preview.previewId,
      },
    };
  }
  it('starts the same draft and reads back every preserved identity without creating another plan', async () => {
    const d = await draft();
    const c = await confirmed(d);
    const before = (await f.service.getPlanDetail('user', d.planId)).plan!;
    const receipt = await prisma.$transaction(
      (tx) => f.apply.apply({ ...c.args, tx }),
      { isolationLevel: 'Serializable' },
    );
    expect(receipt).toMatchObject({
      planId: d.planId,
      createdPlanId: null,
      readbackVerified: true,
      preservedWorkoutCount: 2,
      identityMap: [
        { workoutId: before.workouts[0].id, scheduledDate: '2099-11-22' },
        { workoutId: before.workouts[1].id, scheduledDate: '2099-11-23' },
      ],
    });
    expect((await f.service.getPlanDetail('user', d.planId)).plan!.status).toBe(
      'ACTIVE',
    );
    expect(await prisma.plan.count()).toBe(1);
  });
  it.each([undefined, '2099-12-01'])('keeps the same workouts on their original weekdays when starting on Wednesday (rule ends %s)', async (effectiveUntil) => {
    const workoutDefinition = {
      kind: 'FREEFORM',
      version: 1,
      source: 'TEXT',
      text: 'Run 30m',
    } as const;
    const workouts = [1, 3, 6].map((dayIndex) => ({
      weekIndex: 1,
      dayIndex,
      sportType: 'RUN' as const,
      definition: workoutDefinition,
    }));
    const d = await draft(3, {
      sourceType: 'AI',
      workouts,
      generationMetadata: {
        qualityContract: { startDate: '2099-11-23', maxTrainingDaysPerWeek: 3 },
        scheduleConstraints: {
          version: 1,
          revision: 1,
          calendarTimeZone: 'Asia/Shanghai',
          effectiveFrom: '2099-11-23',
          ...(effectiveUntil && { effectiveUntil }),
          fixedRestWeekdays: [2, 4, 5, 7],
          unavailableDates: [],
          availableDateOverrides: [],
          confirmation: { source: 'USER', reference: 'confirmed-brief' },
        },
      },
    }, '2099-11-25');
    const before = (await f.service.getPlanDetail('user', d.planId)).plan!;
    const unaligned = {
      ...d.request,
      preserveUnmentioned: false,
      preserved: before.workouts.map((workout) => ({
        sourceWorkoutId: workout.id,
        expectedRevision: workout.revision!,
      })),
    };
    await expect(f.proposals.createPreview('user', unaligned, d.binding)).rejects.toMatchObject({
      response: {
        code: 'PLAN_SCHEDULE_INVALID',
        issues: [expect.objectContaining({ code: 'FIXED_REST_DAY', date: '2099-11-27' })],
      },
    });
    const { args, preview } = await confirmed(d);
    expect(preview.presentation.counts).toMatchObject({ changed: 3, added: 0, deleted: 0 });
    const receipt = await prisma.$transaction(
      (tx) => f.apply.apply({ ...args, tx }),
      { isolationLevel: 'Serializable' },
    );
    expect(receipt).toMatchObject({
      planId: d.planId,
      createdPlanId: null,
      readbackVerified: true,
    });
    expect(receipt.identityMap.map(({ workoutId, scheduledDate }) => ({
      workoutId,
      scheduledDate,
    })).sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!))).toEqual([
      { workoutId: before.workouts[1].id, scheduledDate: '2099-11-25' },
      { workoutId: before.workouts[2].id, scheduledDate: '2099-11-28' },
      { workoutId: before.workouts[0].id, scheduledDate: '2099-11-30' },
    ]);
  });

  it('requires weekday review before activating a legacy dated AI draft on another weekday', async () => {
    const d = await draft(3, {
      sourceType: 'AI',
      generationMetadata: { qualityContract: { startDate: '2099-11-24' } },
      workouts: [1, 3, 5].map((dayIndex) => ({
        weekIndex: 1,
        dayIndex,
        sportType: 'RUN',
        definition: { kind: 'FREEFORM', version: 1, source: 'TEXT', text: 'Run 30m' },
      })),
    }, '2099-11-25');
    await expect(f.proposals.createPreview('user', d.request, d.binding)).rejects.toMatchObject({
      response: {
        code: 'PLAN_START_WEEKDAY_REVIEW_REQUIRED',
        data: { assessedStartDate: '2099-11-24', requestedStartDate: '2099-11-25' },
      },
    });
    expect((await f.service.getPlanDetail('user', d.planId)).plan?.status).toBe('DRAFT');
    const aligned = '2099-12-01';
    await f.starts.conversation('user', d.planId, aligned);
    expect(await f.proposals.createPreview('user', { ...d.request, startDate: aligned }, d.binding))
      .toMatchObject({ mode: 'START' });
  });

  it('enforces the saved weekday limits when changing the start date and moving an active workout', async () => {
    const saturday = '2099-11-28';
    const metadata = { qualityContract: { startDate: saturday, maxDailyMinutes: 90, maxMinutesByIsoWeekday: { 3: 45, 6: 90 } } };
    const d = await draft(1, {
      sourceType: 'AI', generationMetadata: metadata,
      workouts: [{ weekIndex: 1, dayIndex: 1, sportType: 'RUN', text: 'work 75m' }],
    }, saturday);
    await f.starts.conversation('user', d.planId, '2099-12-02');
    await expect(f.proposals.createPreview('user', { ...d.request, startDate: '2099-12-02' }, d.binding)).rejects.toMatchObject({
      response: { code: 'PLAN_QUALITY_INVALID', issues: expect.arrayContaining([
        expect.objectContaining({ code: 'DAILY_TIME_BUDGET', message: expect.stringContaining('45-minute') }),
      ]) },
    });
    await f.starts.conversation('user', d.planId, saturday);
    const { args } = await confirmed(d);
    const receipt = await prisma.$transaction(tx => f.apply.apply({ ...args, tx }), { isolationLevel: 'Serializable' });
    expect(receipt).toMatchObject({ planId: d.planId, readbackVerified: true });
    const { plan } = await f.service.getPlanDetail('user', d.planId);
    expect(plan?.generationMetadata).toMatchObject(metadata);
    await expect(f.service.updateWorkout('user', d.planId, plan!.workouts[0].id, {
      weekIndex: 1, dayIndex: 5, sportType: 'RUN', text: 'work 75m',
    })).rejects.toMatchObject({
      response: { code: 'PLAN_SCHEDULE_INVALID', issues: expect.arrayContaining([
        expect.objectContaining({ code: 'DAILY_TIME_BUDGET', date: '2099-12-02' }),
      ]) },
    });
    expect((await f.service.getPlanDetail('user', d.planId)).plan?.workouts[0].scheduledDate).toBe(saturday);
  });

  it('defaults an AI draft to its assessed preview date and honors a later date the user selects', async () => {
    const created = await f.service.createPlan('user', {
      title: 'Dated plan', sourceType: 'AI', periodWeeks: 1,
      generationMetadata: { qualityContract: { startDate: '2099-11-23' } },
      workouts: [{ weekIndex: 1, dayIndex: 1, sportType: 'RUN', definition: {
        kind: 'FREEFORM', version: 1, source: 'TEXT', text: 'Run 30m',
      } }],
    });
    const planId = created.plan!.id;
    const proposed = await f.starts.conversation('user', planId);
    expect(proposed.startDate).toBe('2099-11-23');
    const selected = await f.starts.conversation('user', planId, '2099-11-25');
    expect(selected).toMatchObject({ startDate: '2099-11-25', sid: proposed.sid });
    expect((await f.starts.conversation('user', planId)).startDate).toBe('2099-11-25');
  });
  it('rejects a missing source identity rather than treating it as a deletion', async () => {
    const d = await draft();
    d.request.preserveUnmentioned = false;
    d.request.preserved = [];
    await expect(
      f.proposals.createPreview('user', d.request, d.binding),
    ).rejects.toThrow(/cover every source/);
  });
  it('invalidates the old card immediately on date change, including another branch', async () => {
    const d = await draft();
    const c = await confirmed(d);
    const revised = await f.starts.conversation('user', d.planId, '2099-11-23');
    expect(revised.sid).toBe(d.session.sid);
    expect(revised.entryKey).not.toBe(d.session.entryKey);
    expect(
      (
        await prisma.coachDecision.findUniqueOrThrow({
          where: { id: c.decision.id },
        })
      ).state,
    ).toBe('SUPERSEDED');
    await expect(
      prisma.$transaction((tx) => f.apply.apply({ ...c.args, tx })),
    ).rejects.toThrow(/expired/);
  });
  it.each(['source', 'activity', 'independent', 'zone'])(
    'rejects old evidence after %s changes',
    async (change) => {
      const d = await draft();
      const c = await confirmed(d);
      if (change === 'source')
        await f.service.updatePlan('user', d.planId, {
          title: 'Edited in another device',
        });
      if (change === 'activity')
        await prisma.activity.create({
          data: {
            userId: 'user',
            hashId: 'new-training',
            startTime: new Date(),
            sportType: 'RUN',
            timerTime: 1800,
          },
        });
      if (change === 'independent')
        await prisma.planWorkout.create({
          data: {
            userId: 'user',
            sportType: 'RUN',
            text: 'Run',
            dayOffset: 0,
            sessionIndex: 1,
            scheduledDate: new Date('2099-11-22'),
          },
        });
      if (change === 'zone')
        await prisma.userZoneSetting.create({
          data: {
            userId: 'user',
            sportType: 'RUN',
            zoneType: 'PACE',
            benchmark: 'TP',
            zones: { create: [{ order: 1, min: 0.5, max: 0.6 }] },
          },
        });
      await expect(
        prisma.$transaction((tx) => f.apply.apply({ ...c.args, tx })),
      ).rejects.toThrow(/changed|expired/);
      expect(
        (await f.service.getPlanDetail('user', d.planId)).plan!.status,
      ).toBe('DRAFT');
    },
  );
  it('applies an identity-preserving course swap together with an addition and explicit deletion', async () => {
    const d = await draft(3);
    const source = await prisma.planWorkout.findMany({
      where: { planId: d.planId },
      orderBy: { dayOffset: 'asc' },
    });
    d.request.changes = source.slice(0, 2).map((w, i) => ({
      sourceWorkoutId: w.id,
      expectedRevision: w.revision,
      workout: {
        weekIndex: 1,
        dayIndex: i === 0 ? 2 : 1,
        sportType: 'RUN',
        name: 'Changed',
        definition: {
          kind: 'FREEFORM',
          version: 1,
          source: 'TEXT',
          text: 'Run 20m',
        },
      },
    }));
    d.request.deletions = [
      { sourceWorkoutId: source[2].id, expectedRevision: source[2].revision },
    ];
    d.request.additions = [
      {
        candidateKey: 'extra',
        workout: {
          weekIndex: 1,
          dayIndex: 4,
          sportType: 'RUN',
          definition: {
            kind: 'FREEFORM',
            version: 1,
            source: 'TEXT',
            text: 'Run 30m',
          },
        },
      },
    ];
    const c = await confirmed(d);
    const receipt = await prisma.$transaction(
      (tx) => f.apply.apply({ ...c.args, tx }),
      { isolationLevel: 'Serializable' },
    );
    expect(receipt).toMatchObject({
      readbackVerified: true,
      changedWorkoutCount: 2,
      addedWorkoutCount: 1,
      deletedWorkoutCount: 1,
    });
    const result = (await f.service.getPlanDetail('user', d.planId)).plan!;
    expect(result.workouts.map((w) => ({ id: w.id, day: w.dayIndex }))).toEqual(
      [
        { id: source[1].id, day: 1 },
        { id: source[0].id, day: 2 },
        { id: expect.any(String), day: 4 },
      ],
    );
  });

  it('preserves a strength definition and the same exercise/set identities', async () => {
    const d = await draft();
    const source = await prisma.planWorkout.findFirstOrThrow({
      where: { planId: d.planId },
      orderBy: { dayOffset: 'asc' },
    });
    await f.service.updatePlan('user', d.planId, {
      workouts: [
        {
          id: source.id,
          weekIndex: 1,
          dayIndex: 1,
          sportType: 'UNKNOWN',
          definition: {
            kind: 'STRENGTH',
            version: 1,
            source: 'TEXT',
            text: 'duration 45m\nsession rpe 6\nexercise "Squat" {\nwork 3x5 open rpe 7 rest 3m\n}',
          },
        },
      ],
    });
    const before = await f.service.getPlanDetail('user', d.planId);
    const exercises = await prisma.planWorkoutExercise.findMany({
      where: { workoutId: source.id },
      include: { setGroups: true },
    });
    const c = await confirmed(d);
    await prisma.$transaction((tx) => f.apply.apply({ ...c.args, tx }), {
      isolationLevel: 'Serializable',
    });
    const after = await f.service.getPlanDetail('user', d.planId);
    expect(after.plan!.workouts[0].structure).toEqual(
      before.plan!.workouts[0].structure,
    );
    expect(
      await prisma.planWorkoutExercise.findMany({
        where: { workoutId: source.id },
        include: { setGroups: true },
      }),
    ).toEqual(exercises);
  });
  it('rolls back draft edits and preview consumption when activation fails', async () => {
    const d = await draft();
    const first = await prisma.planWorkout.findFirstOrThrow({
      where: { planId: d.planId },
    });
    d.request.changes = [
      {
        sourceWorkoutId: first.id,
        expectedRevision: first.revision,
        workout: {
          weekIndex: 1,
          dayIndex: 1,
          sportType: 'RUN',
          name: 'Changed',
          definition: {
            kind: 'FREEFORM',
            version: 1,
            source: 'TEXT',
            text: 'Run 20m',
          },
        },
      },
    ];
    const c = await confirmed(d);
    await prisma.plan.create({
      data: {
        userId: 'user',
        status: 'ACTIVE',
        title: 'Competing active plan',
        periodWeeks: 1,
      },
    });
    await expect(
      prisma.$transaction((tx) => f.apply.apply({ ...c.args, tx }), {
        isolationLevel: 'Serializable',
      }),
    ).rejects.toThrow(/active plan/);
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts.find(
        (w) => w.id === first.id,
      )!.name,
    ).toBeNull();
    expect(
      (
        await prisma.planProposalPreview.findUniqueOrThrow({
          where: { id: c.preview.previewId },
        })
      ).appliedAt,
    ).toBeNull();
  });
  (process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN ? it : it.skip)(
    'does not overwrite an edit committed while another device begins START',
    async () => {
      const d = await draft();
      const c = await confirmed(d);
      let held!: () => void, release!: () => void;
      const locked = new Promise<void>((r) => (held = r)),
        gate = new Promise<void>((r) => (release = r));
      const editing = prisma.$transaction(
        async (tx) => {
          await f.service.updatePlan(
            'user',
            d.planId,
            { title: 'Another device won' },
            undefined,
            { tx },
          );
          held();
          await gate;
        },
        { timeout: 15000 },
      );
      await locked;
      const applying = prisma
        .$transaction((tx) => f.apply.apply({ ...c.args, tx }), {
          isolationLevel: 'Serializable',
          timeout: 15000,
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
          await new Promise((r) => setTimeout(r, 10));
        }
        expect(blocked).toBe(true);
      } finally {
        release();
        await editing;
      }
      expect(await applying).toBe(false);
      expect(
        (await f.service.getPlanDetail('user', d.planId)).plan!,
      ).toMatchObject({ status: 'DRAFT', title: 'Another device won' });
    },
  );
  it('reopens the same committed start conversation and receipt after response loss', async () => {
    const d = await draft();
    const c = await confirmed(d);
    await prisma.$transaction((tx) => f.apply.apply({ ...c.args, tx }), {
      isolationLevel: 'Serializable',
    });
    const reopened = await f.starts.conversation('user', d.planId);
    expect(reopened).toMatchObject({
      sid: d.session.sid,
      entryKey: d.session.entryKey,
      plan: { status: 'ACTIVE', startDate: '2099-11-22' },
    });
    await expect(
      f.starts.conversation('user', d.planId, '2099-11-23'),
    ).rejects.toThrow(/active plan/);
  });
  it('uses explicitly confirmed calendar constraints and reads back the resulting timezone and inherited contract', async () => {
    const d = await draft();
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'Asia/Shanghai',
      fixedRestWeekdays: [],
      unavailableDates: [],
      availableDateOverrides: [],
      effectiveFrom: '2099-11-22',
      confirmation: { source: 'USER', reference: 'proposal-audit-reference' },
    };
    d.request.qualityContractTransition = { mode: 'INHERIT' };
    const c = await confirmed(d);
    expect(c.preview.presentation.calendarTimeZone).toBe('Asia/Shanghai');
    const receipt = await prisma.$transaction(
      (tx) => f.apply.apply({ ...c.args, tx }),
      { isolationLevel: 'Serializable' },
    );
    expect(receipt).toMatchObject({
      readbackVerified: true,
      calendarTimeZone: 'Asia/Shanghai',
    });
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!
        .generationMetadata,
    ).toMatchObject({ scheduleConstraints: d.request.scheduleConstraints });
  });
  it.each(['load', 'race'])(
    'rejects a prior START when only the %s child facts change',
    async (kind) => {
      const d = await draft();
      const activity = await prisma.activity.create({
        data: {
          userId: 'user',
          hashId: 'load-only',
          startTime: new Date(),
          sportType: 'RUN',
          timerTime: 1800,
        },
      });
      const race = await prisma.competitionEvent.create({
        data: {
          userId: 'user',
          title: 'Race',
          startDate: new Date('2099-11-24'),
          sportType: 'RUN',
          goalType: 'FINISH',
        },
      });
      const c = await confirmed(d);
      if (kind === 'load')
        await prisma.activityFitnessMetricsSnapshot.create({
          data: {
            userId: 'user',
            activityId: activity.id,
            recordedAt: new Date(),
            actualLoad: 72,
            actualLoadSource: 'SESSION_RPE',
          },
        });
      else
        await prisma.competitionEvent.update({
          where: { id: race.id },
          data: {
            startDate: new Date('2099-11-25'),
            version: { increment: 1 },
          },
        });
      await expect(
        prisma.$transaction((tx) => f.apply.apply({ ...c.args, tx }), {
          isolationLevel: 'Serializable',
        }),
      ).rejects.toThrow(/facts/);
      expect(
        (await f.service.getPlanDetail('user', d.planId)).plan!.status,
      ).toBe('DRAFT');
    },
  );
  it('rejects a new draft start in the past using the server calendar day', async () => {
    const d = await draft();
    await expect(
      f.starts.conversation('user', d.planId, '2000-01-01'),
    ).rejects.toMatchObject({
      response: { code: 'PLAN_START_REASSESSMENT_REQUIRED' },
    });
  });
  it('starts the edited official template draft in place and rejects an out-of-date preview', async () => {
    const { plan } = await f.service.createPlan('user', {
      title: 'Official 5K',
      sourceType: 'TEMPLATE',
      periodWeeks: 12,
      workouts: [{ weekIndex: 1, dayIndex: 1, sportType: 'RUN', text: 'work 30m' }],
    });
    await prisma.planTemplatePreview.create({
      data: {
        userId: 'user', tokenHash: 'official-start-test', templateKey: 'RUN_5K_FIRST',
        templateVersion: '1.0.1', templateContentHash: 'test', variantId: '12-week',
        locale: 'zh', normalizedInput: { requestedStartDate: '2099-11-23' },
        payload: {}, expiresAt: new Date(), consumedAt: new Date(), createdPlanId: plan!.id,
      },
    });
    const { id } = plan!;
    const initial = await f.starts.officialDraft('user', id);
    const workoutId = initial.plan.workouts[0].id;
    await f.service.updateWorkout('user', id, workoutId, {
      weekIndex: 1, dayIndex: 3, sportType: 'RUN', text: 'work 25m', name: 'Edited run',
    });
    await expect(f.starts.startOfficialDraft('user', id, '2099-11-23', initial.revision))
      .rejects.toMatchObject({ response: { code: 'PLAN_START_REASSESSMENT_REQUIRED' } });
    const fresh = await f.starts.officialDraft('user', id);
    const date = await f.starts.saveOfficialStartDate('user', id, '2099-11-24', fresh.revision);
    expect((await f.starts.officialDraft('user', id))).toMatchObject(date);
    await expect(f.starts.saveOfficialStartDate('user', id, '2099-11-25', fresh.revision))
      .rejects.toMatchObject({ status: 409 });
    const estimate = jest.spyOn(PlanLoadEstimatorService.prototype, 'applyForWorkout')
      .mockRejectedValueOnce(Object.assign(new Error('Serializable conflict'), { code: 'P2034' }));
    try {
      await f.starts.startOfficialDraft('user', id, date.startDate, date.revision);
      expect(estimate).toHaveBeenCalledTimes(2);
    } finally {
      estimate.mockRestore();
    }
    await f.starts.startOfficialDraft('user', id, date.startDate, date.revision);
    await expect(f.service.updateWorkout('user', id, workoutId, {
      expectedPlanStatus: 'DRAFT', weekIndex: 1, dayIndex: 5, sportType: 'RUN', text: 'work 30m',
    })).rejects.toMatchObject({ status: 409 });
    expect((await f.service.getPlanDetail('user', id)).plan).toMatchObject({
      id, status: 'ACTIVE', startDate: '2099-11-24',
      workouts: [{ id: workoutId, name: 'Edited run', scheduledDate: '2099-11-26',
        summary: { durationSeconds: 1500 } }],
    });
  });
  it('retains the saved session RPE when a freeform workout is only moved', async () => {
    const d = await draft();
    const w = await prisma.planWorkout.findFirstOrThrow({
      where: { planId: d.planId },
      orderBy: { dayOffset: 'asc' },
    });
    await prisma.planWorkout.update({
      where: { id: w.id },
      data: { plannedSessionRpe: 6 },
    });
    d.request.changes = [
      {
        sourceWorkoutId: w.id,
        expectedRevision: w.revision,
        workout: {
          weekIndex: 1,
          dayIndex: 4,
          sportType: 'RUN',
          definition: {
            kind: 'FREEFORM',
            version: 1,
            source: 'TEXT',
            text: 'Run 30m',
          },
        },
      },
    ];
    const c = await confirmed(d);
    expect(
      c.preview.presentation.calendarDraft!.workouts.find(
        (row) => row.dayIndex === 4,
      )?.plannedSessionRpe,
    ).toBe(6);
    await prisma.$transaction((tx) => f.apply.apply({ ...c.args, tx }), {
      isolationLevel: 'Serializable',
    });
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts.find(
        (row) => row.id === w.id,
      )!.plannedSessionRpe,
    ).toBe(6);
  });
  it('supersedes the same source plan candidate across branches', async () => {
    const d = await draft();
    const first = await confirmed(d);
    const before = await prisma.coachBranch.findUniqueOrThrow({
      where: { id: d.binding.branchId },
    });
    const branch = await prisma.coachBranch.create({
      data: {
        threadId: before.threadId,
        contextId: before.contextId,
        baseEventSeq: 0,
      },
    });
    await prisma.aiCoachSession.update({
      where: { userId_id: { userId: 'user', id: d.session.sid } },
      data: { planStartBranchId: branch.id },
    });
    await f.proposals.createPreview('user', d.request, {
      sid: d.session.sid,
      branchId: branch.id,
    });
    expect(
      (
        await prisma.coachDecision.findUniqueOrThrow({
          where: { id: first.decision.id },
        })
      ).state,
    ).toBe('SUPERSEDED');
  });
  it.each([
    {
      type: 'FTP' as const,
      sport: 'CYCLING' as const,
      initial: 200,
      next: 240,
    },
    { type: 'TP' as const, sport: 'SWIM' as const, initial: 1.2, next: 1.3 },
  ])(
    'rejects old START after the effective $sport $type changes',
    async (metric) => {
      const d = await draft();
      const saved = await prisma.userFitnessMetric.create({
        data: {
          userId: 'user',
          type: metric.type,
          sport: metric.sport,
          source: 'MANUAL',
          changeSource: 'USER_MANUAL',
          value: metric.initial,
          recordedAt: new Date('2026-01-01'),
        },
      });
      const c = await confirmed(d);
      await prisma.userFitnessMetric.update({
        where: { id: saved.id },
        data: { value: metric.next },
      });
      await expect(
        prisma.$transaction((tx) => f.apply.apply({ ...c.args, tx }), {
          isolationLevel: 'Serializable',
        }),
      ).rejects.toThrow(/facts/);
    },
  );
  it("reopens an unconfirmed draft on the new server day and supersedes yesterday's card", async () => {
    jest.useFakeTimers({
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'nextTick',
        'queueMicrotask',
        'hrtime',
        'performance',
      ],
      now: new Date('2099-11-22T12:00:00Z'),
    });
    try {
      const d = await draft();
      const c = await confirmed(d);
      jest.setSystemTime(new Date('2099-11-23T12:00:00Z'));
      const reopened = await f.starts.conversation('user', d.planId);
      expect(reopened).toMatchObject({
        sid: d.session.sid,
        startDate: '2099-11-23',
        earliestStartDate: '2099-11-23',
        evaluationStarted: false,
        plan: { status: 'DRAFT' },
      });
      expect(reopened.entryKey).not.toBe(d.session.entryKey);
      expect(
        (
          await prisma.coachDecision.findUniqueOrThrow({
            where: { id: c.decision.id },
          })
        ).state,
      ).toBe('SUPERSEDED');
    } finally {
      jest.useRealTimers();
    }
  });
  it.each(['DONE', 'IN_PROGRESS', 'SKIPPED', 'MOVED'])(
    'refuses to re-date a protected %s draft course during START',
    async (status) => {
      const d = await draft();
      const w = await prisma.planWorkout.findFirstOrThrow({
        where: { planId: d.planId },
      });
      await prisma.planWorkout.update({
        where: { id: w.id },
        data: { status: status as never },
      });
      await expect(
        f.proposals.createPreview('user', d.request, d.binding),
      ).rejects.toThrow(/protected/);
    },
  );
});
