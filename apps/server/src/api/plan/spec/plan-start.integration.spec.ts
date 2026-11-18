import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { planStartFixture } from './plan-start.fixture';
import type { PlanStartPreviewRequest } from '@shared/plan-proposal';

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
  async function draft(count = 2) {
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
    });
    const planId = created.plan!.id;
    const session = await f.starts.conversation('user', planId, '2099-11-22');
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
      startDate: '2099-11-22',
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
});
