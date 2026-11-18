import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { planStartFixture } from './plan-start.fixture';
import { addCalendarDays } from '@shared/plan-calendar';
import type { PlanQualityContract } from '@shared/plan-quality';

describe('remaining schedule / PostgreSQL', () => {
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
  async function running(
    count = 3,
    options: {
      qualityContract?: PlanQualityContract;
      startDate?: string;
      durationMinutes?: number;
      periodWeeks?: number;
    } = {},
  ) {
    const created = await f.service.createPlan('user', {
      title: 'Running',
      periodWeeks: options.periodWeeks ?? Math.ceil(count / 7),
      generationMetadata: { qualityContract: options.qualityContract },
      workouts: Array.from({ length: count }, (_, i) => ({
        weekIndex: Math.floor(i / 7) + 1,
        dayIndex: (i % 7) + 1,
        sportType: 'RUN',
        definition: options.durationMinutes
          ? {
              kind: 'FREEFORM' as const,
              version: 1 as const,
              source: 'STRUCTURE' as const,
              structure: {
                kind: 'FREEFORM' as const,
                version: 1 as const,
                text: `Run ${options.durationMinutes}m`,
                durationSeconds: options.durationMinutes * 60,
              },
            }
          : {
              kind: 'FREEFORM' as const,
              version: 1 as const,
              source: 'TEXT' as const,
              text: `Run ${options.durationMinutes ?? 30}m`,
            },
      })),
    });
    const planId = created.plan!.id;
    await prisma.$transaction((tx) =>
      f.service.activatePlan(
        'user',
        planId,
        options.startDate ?? '2099-11-22',
        undefined,
        {
          tx,
          validatedStartPreview: true,
        },
      ),
    );
    const context = await f.context.ensureContext({ userId: 'user', planId });
    const thread = await prisma.coachThread.create({
      data: { contextId: context.id },
    });
    const branch = await prisma.coachBranch.create({
      data: { threadId: thread.id, contextId: context.id, baseEventSeq: 0 },
    });
    const session = await prisma.aiCoachSession.create({
      data: { userId: 'user', id: 'ordinary-chat' },
    });
    const user = await prisma.aiCoachMessage.create({
      data: {
        userId: 'user',
        sessionId: session.id,
        role: 'USER',
        sequence: 1,
        content: 'No training on Tuesday',
      },
    });
    const assistant = await prisma.aiCoachMessage.create({
      data: {
        userId: 'user',
        sessionId: session.id,
        role: 'ASSISTANT',
        sequence: 2,
        content: '',
      },
    });
    await prisma.coachRun.create({
      data: {
        id: 'run',
        userId: 'user',
        sessionId: session.id,
        branchId: branch.id,
        originMessageId: user.id,
        status: 'running',
        activeAttemptId: 'attempt',
        attempts: {
          create: {
            id: 'attempt',
            userId: 'user',
            requestId: 'request',
            requestHash: 'hash',
            inputMessageId: user.id,
            messageId: assistant.id,
            trigger: 'start',
            operationId: 'op',
            ownerId: 'test',
          },
        },
      },
    });
    return {
      planId,
      binding: { sid: session.id, branchId: branch.id, userMessageId: user.id },
      request: {
        mode: 'SCHEDULE',
        planId,
        range: { from: '2099-11-22', to: '2099-12-31' },
        rationale: 'Coordinate remaining dates',
        evidenceRefs: [],
        changes: [],
        additions: [],
        deletions: [],
        preserveUnmentioned: true,
      } as any,
    };
  }
  it('covers all 210 courses from an ordinary chat without truncation or requiring a start session', async () => {
    const d = await running(210);
    const result = await f.proposals.createPreview(
      'user',
      d.request,
      d.binding,
    );
    expect(result).toMatchObject({
      mode: 'SCHEDULE',
      decisionType: 'PLAN_SCHEDULE',
      presentation: {
        counts: { total: 210, preserved: 210 },
        range: d.request.range,
      },
    });
  });
  async function apply(d: Awaited<ReturnType<typeof running>>) {
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
        decisionType: 'PLAN_SCHEDULE',
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
    return prisma.$transaction(
      (tx) =>
        f.apply.apply({
          userId: 'user',
          decisionId: decision.id,
          branchId: branch.id,
          contextPlanId: d.planId,
          previewId: preview.previewId,
          tx,
        }),
      { isolationLevel: 'Serializable', timeout: 60000 },
    );
  }
  it('swaps remaining positions and reads back original identities and RPE without restarting the plan', async () => {
    const d = await running();
    const before = (await f.service.getPlanDetail('user', d.planId)).plan!;
    const rows = before.workouts;
    await prisma.planWorkout.update({
      where: { id: rows[0].id },
      data: { plannedSessionRpe: 6 },
    });
    d.request.changes = rows.slice(0, 2).map((w, i) => ({
      sourceWorkoutId: w.id,
      expectedRevision: w.revision ?? 1,
      workout: {
        weekIndex: 1,
        dayIndex: i === 0 ? 2 : 1,
        sportType: 'RUN',
        definition: {
          kind: 'FREEFORM',
          version: 1,
          source: 'STRUCTURE',
          structure: w.structure,
        },
      },
    }));
    const receipt = await apply(d);
    expect(receipt).toMatchObject({
      mode: 'SCHEDULE',
      readbackVerified: true,
      changedWorkoutCount: 2,
      preservedWorkoutCount: 1,
      range: d.request.range,
    });
    const after = (await f.service.getPlanDetail('user', d.planId)).plan!;
    expect(after.startDate).toBe(before.startDate);
    expect(after.workouts.find((w) => w.id === rows[0].id)).toMatchObject({
      dayIndex: 2,
      plannedSessionRpe: 6,
    });
    expect(after.workouts.find((w) => w.id === rows[1].id)).toMatchObject({
      dayIndex: 1,
    });
  });
  it.each(['DONE', 'IN_PROGRESS', 'SKIPPED', 'MOVED'])(
    'protects %s courses while preserving their full source coverage',
    async (status) => {
      const d = await running();
      const w = await prisma.planWorkout.findFirstOrThrow({
        where: { planId: d.planId },
      });
      await prisma.planWorkout.update({
        where: { id: w.id },
        data: { status: status as never },
      });
      const preview = await f.proposals.createPreview(
        'user',
        d.request,
        d.binding,
      );
      expect(preview.presentation.counts).toMatchObject({
        total: 3,
        preserved: 3,
        protected: 1,
      });
      d.request.deletions = [
        { sourceWorkoutId: w.id, expectedRevision: w.revision },
      ];
      await expect(
        f.proposals.createPreview('user', d.request, d.binding),
      ).rejects.toThrow(/protected/);
    },
  );
  it('rejects late old runs after a newer persisted athlete request', async () => {
    const d = await running();
    await prisma.aiCoachMessage.create({
      data: {
        userId: 'user',
        sessionId: d.binding.sid,
        role: 'USER',
        sequence: 3,
        content: 'Thursday too',
      },
    });
    await expect(
      f.proposals.createPreview('user', d.request, d.binding),
    ).rejects.toThrow(/replaced/);
  });
  it('applies constraints only and returns their actual revision and rules', async () => {
    const d = await running(2);
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [4],
      unavailableDates: [],
      availableDateOverrides: [],
      effectiveFrom: '2099-11-22',
      confirmation: { source: 'USER', reference: 'request' },
    };
    d.request.qualityContractTransition = { mode: 'INHERIT' };
    const receipt = await apply(d);
    expect(receipt).toMatchObject({
      readbackVerified: true,
      changedWorkoutCount: 0,
      scheduleConstraints: d.request.scheduleConstraints,
    });
  });
  it('commits a newly confirmed daily budget with the remaining courses and preserves protected history', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = await running(3, {
      startDate: addCalendarDays(today, -2),
      durationMinutes: 60,
      qualityContract: { maxDailyMinutes: 60, requiredSports: ['RUN'] },
    });
    const before = (await f.service.getPlanDetail('user', d.planId)).plan!;
    const remaining = before.workouts[2];
    d.request.range = { from: today, to: addCalendarDays(today, 4) };
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [],
      unavailableDates: [],
      availableDateOverrides: [],
      effectiveFrom: today,
      confirmation: { source: 'USER', reference: 'daily-availability' },
    };
    d.request.qualityContractTransition = {
      mode: 'INHERIT',
      maxDailyMinutes: 30,
    };
    d.request.changes = [
      {
        sourceWorkoutId: remaining.id,
        expectedRevision: remaining.revision ?? 1,
        workout: {
          weekIndex: 1,
          dayIndex: 3,
          sportType: 'RUN',
          definition: {
            kind: 'FREEFORM',
            version: 1,
            source: 'STRUCTURE',
            structure: {
              kind: 'FREEFORM',
              version: 1,
              text: 'Run 30m',
              durationSeconds: 1800,
            },
          },
        },
      },
    ];
    const preview = await f.proposals.createPreview(
      'user',
      d.request,
      d.binding,
    );
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!
        .generationMetadata,
    ).toMatchObject({ qualityContract: { maxDailyMinutes: 60 } });
    const receipt = await apply(d);
    const after = (await f.service.getPlanDetail('user', d.planId)).plan!;
    expect(after.generationMetadata).toMatchObject({
      qualityContract: { maxDailyMinutes: 30, requiredSports: ['RUN'] },
    });
    expect(receipt).toMatchObject({
      readbackVerified: true,
      qualityContract: { maxDailyMinutes: 30 },
    });
    expect(preview.presentation.qualityContract).toMatchObject({
      maxDailyMinutes: 30,
      requiredSports: ['RUN'],
    });
    expect(after.workouts.slice(0, 2)).toEqual(before.workouts.slice(0, 2));
    expect(after.workouts[2].summary.durationSeconds).toBe(1800);
    await expect(
      f.service.addWorkout('user', d.planId, {
        weekIndex: 1,
        dayIndex: 4,
        sportType: 'RUN',
        definition: {
          kind: 'FREEFORM',
          version: 1,
          source: 'STRUCTURE',
          structure: {
            kind: 'FREEFORM',
            version: 1,
            text: 'Run 40m',
            durationSeconds: 2400,
          },
        },
      }),
    ).rejects.toThrow();
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts,
    ).toHaveLength(3);
  });

  it('persists an explicitly expanded weekly availability and enforces it on later ordinary additions', async () => {
    const d = await running(3, {
      qualityContract: { maxTrainingDaysPerWeek: 3, requiredSports: ['RUN'] },
    });
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [],
      unavailableDates: [],
      availableDateOverrides: [],
      effectiveFrom: '2099-11-22',
      confirmation: { source: 'USER', reference: 'weekly-availability' },
    };
    d.request.qualityContractTransition = {
      mode: 'INHERIT',
      maxTrainingDaysPerWeek: 5,
    };
    const workout = (dayIndex: number) => ({
      weekIndex: 1,
      dayIndex,
      sportType: 'RUN' as const,
      definition: {
        kind: 'FREEFORM' as const,
        version: 1 as const,
        source: 'TEXT' as const,
        text: 'Run 30m',
      },
    });
    d.request.additions = [4, 5].map((day) => ({
      candidateKey: `extra-${day}`,
      workout: workout(day),
    }));
    const receipt = await apply(d);
    expect(receipt).toMatchObject({
      qualityContract: { maxTrainingDaysPerWeek: 5, requiredSports: ['RUN'] },
    });
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!,
    ).toMatchObject({
      generationMetadata: { qualityContract: { maxTrainingDaysPerWeek: 5 } },
      workouts: expect.any(Array),
    });
    await expect(
      f.service.addWorkout('user', d.planId, workout(6)),
    ).rejects.toThrow();
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts,
    ).toHaveLength(5);
  });

  it('saves a lower weekly limit over protected history and only permits new days within the remaining weekly budget', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = await running(3, {
      startDate: addCalendarDays(today, -3),
      periodWeeks: 2,
      qualityContract: { maxTrainingDaysPerWeek: 3 },
    });
    const before = (await f.service.getPlanDetail('user', d.planId)).plan!;
    d.request.range = { from: today, to: addCalendarDays(today, 10) };
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [],
      unavailableDates: [],
      availableDateOverrides: [],
      effectiveFrom: today,
      confirmation: {
        source: 'USER',
        reference: 'reduced-weekly-availability',
      },
    };
    d.request.qualityContractTransition = {
      mode: 'INHERIT',
      maxTrainingDaysPerWeek: 2,
    };
    const receipt = await apply(d);
    expect(receipt).toMatchObject({
      qualityContract: { maxTrainingDaysPerWeek: 2 },
    });
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts,
    ).toEqual(before.workouts);
    const workout = (weekIndex: number, dayIndex: number) => ({
      weekIndex,
      dayIndex,
      sportType: 'RUN' as const,
      definition: {
        kind: 'FREEFORM' as const,
        version: 1 as const,
        source: 'TEXT' as const,
        text: 'Run 30m',
      },
    });
    await expect(
      f.service.addWorkout('user', d.planId, workout(1, 4)),
    ).rejects.toThrow();
    await f.service.addWorkout('user', d.planId, workout(2, 1));
    await f.service.addWorkout('user', d.planId, workout(2, 2));
    await expect(
      f.service.addWorkout('user', d.planId, workout(2, 3)),
    ).rejects.toThrow();
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts,
    ).toHaveLength(5);
  });

  it.each([
    { maxDailyMinutes: 0 },
    { maxDailyMinutes: 1441 },
    { maxTrainingDaysPerWeek: 0 },
    { maxTrainingDaysPerWeek: 8 },
    { requiredSports: ['SWIM'] },
    { raceDiscipline: 'SWIM' },
    { weekPhases: ['TAPER'] },
  ])(
    'rejects invalid or unrelated availability transition %j before writing',
    async (patch) => {
      const d = await running();
      d.request.scheduleConstraints = {
        version: 1,
        revision: 1,
        calendarTimeZone: 'UTC',
        fixedRestWeekdays: [],
        unavailableDates: [],
        availableDateOverrides: [],
        effectiveFrom: '2099-11-22',
        confirmation: { source: 'USER', reference: 'invalid-availability' },
      };
      d.request.qualityContractTransition = { mode: 'INHERIT', ...patch };
      await expect(
        f.proposals.createPreview('user', d.request, d.binding),
      ).rejects.toThrow();
      expect(
        (await f.service.getPlanDetail('user', d.planId)).plan!
          .generationMetadata,
      ).not.toHaveProperty('scheduleConstraints');
    },
  );

  it('rejects targets outside the explicit range and preserves out-of-range sources', async () => {
    const d = await running();
    d.request.range.to = '2099-11-23';
    const w = (await f.service.getPlanDetail('user', d.planId)).plan!
      .workouts[2];
    d.request.changes = [
      {
        sourceWorkoutId: w.id,
        expectedRevision: w.revision ?? 1,
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
    await expect(
      f.proposals.createPreview('user', d.request, d.binding),
    ).rejects.toThrow(/out-of-range/);
  });

  it('atomically applies a complete 210-course positional rotation without a 200-course batch truncation', async () => {
    const d = await running(210);
    d.request.range.to = '2100-06-30';
    const rows = await prisma.planWorkout.findMany({
      where: { planId: d.planId },
      orderBy: { dayOffset: 'asc' },
    });
    d.request.changes = rows.map((w, i) => {
      const offset = (i + 1) % 210;
      return {
        sourceWorkoutId: w.id,
        expectedRevision: w.revision,
        workout: {
          weekIndex: Math.floor(offset / 7) + 1,
          dayIndex: (offset % 7) + 1,
          sportType: 'RUN',
          plannedSessionRpe: 6,
          definition: {
            kind: 'FREEFORM',
            version: 1,
            source: 'TEXT',
            text: 'Run 30m',
          },
        },
      };
    });
    const receipt = await apply(d);
    expect(receipt).toMatchObject({
      readbackVerified: true,
      changedWorkoutCount: 210,
      preservedWorkoutCount: 0,
    });
    expect(receipt.identityMap).toHaveLength(210);
    const final = await prisma.planWorkout.findMany({
      where: { planId: d.planId },
      orderBy: { dayOffset: 'asc' },
    });
    expect(final[0]).toMatchObject({
      id: rows[209].id,
      revision: 2,
      plannedSessionRpe: 6,
    });
    expect(final[209]).toMatchObject({ id: rows[208].id, revision: 2 });
  });

  (process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN ? it : it.skip)(
    'does not overwrite a concurrent workout completion during schedule application',
    async () => {
      const d = await running();
      const w = await prisma.planWorkout.findFirstOrThrow({
        where: { planId: d.planId },
        orderBy: { dayOffset: 'asc' },
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
          decisionType: 'PLAN_SCHEDULE',
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
      let held!: () => void, release!: () => void;
      const locked = new Promise<void>((r) => (held = r)),
        gate = new Promise<void>((r) => (release = r));
      const completing = prisma.$transaction(
        async (tx) => {
          await f.write.updateWorkoutStatus(
            'user',
            d.planId,
            w.id,
            'DONE',
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
        .$transaction(
          (tx) =>
            f.apply.apply({
              userId: 'user',
              decisionId: decision.id,
              branchId: branch.id,
              contextPlanId: d.planId,
              previewId: preview.previewId,
              tx,
            }),
          { isolationLevel: 'Serializable', timeout: 15000 },
        )
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
        await completing;
      }
      expect(await applying).toBe(false);
      expect(
        await prisma.planWorkout.findUniqueOrThrow({ where: { id: w.id } }),
      ).toMatchObject({ status: 'DONE', dayOffset: w.dayOffset });
    },
  );
  it('preserves historical courses and rejects a canceled run from creating a fresh card', async () => {
    const d = await running();
    const rows = await prisma.planWorkout.findMany({
      where: { planId: d.planId },
      orderBy: { dayOffset: 'asc' },
    });
    await prisma.plan.update({
      where: { id: d.planId },
      data: {
        startDate: new Date('2000-01-01'),
        endDate: new Date('2000-01-07'),
      },
    });
    for (const w of rows) {
      const date = new Date('2000-01-01');
      date.setUTCDate(date.getUTCDate() + w.dayOffset);
      await prisma.planWorkout.update({
        where: { id: w.id },
        data: { scheduledDate: date },
      });
    }
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [],
      unavailableDates: [],
      availableDateOverrides: [],
      effectiveFrom: '2099-11-22',
      confirmation: { source: 'USER', reference: 'new-rules' },
    };
    d.request.qualityContractTransition = {
      mode: 'REPLACE_ALLOWED_DAYS',
      allowedDays: [7],
    };
    const preview = await f.proposals.createPreview(
      'user',
      d.request,
      d.binding,
    );
    expect(preview.presentation.counts).toMatchObject({
      preserved: 3,
      protected: 3,
    });
    expect(
      preview.presentation.rows.every((w) => w.protectedReason === 'HISTORY'),
    ).toBe(true);
    expect(await apply(d)).toMatchObject({
      readbackVerified: true,
      preservedWorkoutCount: 3,
    });
    await prisma.coachRunAttempt.update({
      where: { id: 'attempt' },
      data: { cancelRequestedAt: new Date() },
    });
    await expect(
      f.proposals.createPreview('user', d.request, d.binding),
    ).rejects.toThrow(/no longer current/);
  });
  it('reports a related independent rest-day conflict as unmanaged without changing or globally forbidding that course', async () => {
    const d = await running(1);
    const related = await f.write.createIndependentWorkout('user', {
      scheduledDate: '2099-11-23',
      sportType: 'RUN',
      name: 'Separate easy run',
      definition: {
        kind: 'FREEFORM',
        version: 1,
        source: 'STRUCTURE',
        structure: {
          kind: 'FREEFORM',
          version: 1,
          text: 'Easy',
          durationSeconds: 1800,
        },
      },
    });
    d.request.scheduleConstraints = {
      version: 1,
      revision: 1,
      calendarTimeZone: 'UTC',
      fixedRestWeekdays: [],
      unavailableDates: ['2099-11-23'],
      availableDateOverrides: [],
      effectiveFrom: '2099-11-22',
      confirmation: { source: 'USER', reference: 'request' },
    };
    d.request.qualityContractTransition = { mode: 'INHERIT' };
    const preview = await f.proposals.createPreview(
      'user',
      d.request,
      d.binding,
    );
    expect(preview.presentation.relatedCalendarConflicts).toEqual([
      {
        code: 'UNAVAILABLE_DATE',
        date: '2099-11-23',
        workoutId: related.workout!.id,
        planId: null,
        name: 'Separate easy run',
        managed: false,
      },
    ]);
    const receipt = await apply(d);
    expect(receipt.presentation.relatedCalendarConflicts).toEqual(
      preview.presentation.relatedCalendarConflicts,
    );
    expect(
      (await f.write.getIndependentWorkoutDetail('user', related.workout!.id))
        .workout,
    ).toMatchObject({
      planId: null,
      scheduledDate: '2099-11-23',
      name: 'Separate easy run',
    });
  });
  it.each(['linked', 'successor'])(
    'protects courses already %s and keeps them explicitly covered',
    async (kind) => {
      const d = await running();
      const w = await prisma.planWorkout.findFirstOrThrow({
        where: { planId: d.planId },
        orderBy: { dayOffset: 'desc' },
      });
      if (kind === 'linked') {
        const activity = await prisma.activity.create({
          data: {
            userId: 'user',
            hashId: 'linked-run',
            sportType: 'RUN',
            startTime: new Date('2099-11-24'),
            timerTime: 1800,
          },
        });
        await prisma.planWorkoutActivityLink.create({
          data: {
            planId: d.planId,
            planWorkoutId: w.id,
            activityId: activity.id,
          },
        });
      } else
        await prisma.plan.create({
          data: {
            userId: 'user',
            title: 'Successor',
            periodWeeks: 1,
            status: 'SCHEDULED',
            startDate: new Date('2099-11-24'),
            supersedesPlanId: d.planId,
          },
        });
      const preview = await f.proposals.createPreview(
        'user',
        d.request,
        d.binding,
      );
      expect(preview.presentation.counts).toMatchObject({
        protected: 1,
        preserved: 3,
      });
      expect(
        preview.presentation.rows.find((row) => row.workoutId === w.id)
          ?.protectedReason,
      ).toBe(kind === 'linked' ? 'ACTIVITY_LINKED' : 'PENDING_SUPERSESSION');
      d.request.deletions = [
        { sourceWorkoutId: w.id, expectedRevision: w.revision },
      ];
      await expect(
        f.proposals.createPreview('user', d.request, d.binding),
      ).rejects.toThrow(/protected/);
    },
  );
});
