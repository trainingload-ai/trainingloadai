import dayjs = require('dayjs');
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { planStartFixture } from './plan-start.fixture';
import type {
  PlanSchedulePreviewRequest,
  PlanStartPreviewRequest,
} from '@shared/plan-proposal';

describe('continuous training / PostgreSQL', () => {
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
  it('creates an open-ended saved rolling draft without a fake period or endpoint', async () => {
    const created = await f.service.createPlan('user', {
      title: 'Continuous training',
      planningMode: 'ROLLING',
      periodWeeks: null,
      workouts: [],
    } as never);
    const detail = await f.service.getPlanDetail('user', created.plan!.id);
    expect(detail.plan).toMatchObject({
      planningMode: 'ROLLING',
      periodWeeks: null,
      startDate: null,
      endDate: null,
      generatedThrough: null,
      status: 'DRAFT',
    });
  });
  async function ready(
    startDate = '2099-11-18',
    configure?: (request: PlanStartPreviewRequest) => void,
  ) {
    const created = await f.service.createPlan('user', {
      title: 'Continuous',
      planningMode: 'ROLLING',
      periodWeeks: null,
      workouts: [],
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
      rationale: 'Start the remaining calendar week with known constraints',
      evidenceRefs: [],
      changes: [],
      deletions: [],
      preserveUnmentioned: true,
      additions: [
        {
          candidateKey: 'run',
          workout: {
            weekIndex: 1,
            dayIndex: 1,
            sportType: 'RUN',
            definition: {
              kind: 'FREEFORM',
              version: 1,
              source: 'TEXT',
              text: 'Run 30m',
            },
          },
        },
      ],
      rolling: {
        policy: {
          goal: 'Maintain endurance',
          sportTypes: ['RUN'],
          autoPlanMonths: true,
          autoGenerateWeeks: true,
          autoAdjustFuture: true,
        },
        monthStrategies: [
          {
            monthStart: '2099-11-01',
            objective: 'Remaining November only',
            loadRange: null,
            durationMinutesRange: { min: 30, max: 180 },
            weekFocus: [],
          },
        ],
      },
    };
    if (configure) configure(request);
    const preview = await f.proposals.createPreview('user', request, {
      sid: session.sid,
      branchId: branch.id,
    });
    const decision = await prisma.coachDecision.create({
      data: {
        branchId: branch.id,
        contextId: context.id,
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
        sourcePlanId: planId,
        tx,
      }),
    );
    const apply = () =>
      prisma.$transaction(
        (tx) =>
          f.apply.apply({
            userId: 'user',
            contextPlanId: planId,
            previewId: preview.previewId,
            decisionId: decision.id,
            branchId: branch.id,
            tx,
          }),
        { isolationLevel: 'Serializable' },
      );
    return { planId, request, preview, apply };
  }
  it('confirms the same rolling plan, month direction and partial first ISO week in one atomic start', async () => {
    const { planId, apply } = await ready();
    const receipt = await apply();
    expect(receipt).toMatchObject({
      readbackVerified: true,
      executionSource: 'USER_CONFIRMATION',
    });
    const detail = await f.service.getPlanDetail('user', planId);
    expect(detail.plan).toMatchObject({
      id: planId,
      status: 'ACTIVE',
      planningMode: 'ROLLING',
      periodWeeks: null,
      endDate: null,
      generatedThrough: '2099-11-22',
      generationCoverage: {
        intervals: [
          {
            from: '2099-11-18',
            through: '2099-11-22',
            weekStart: '2099-11-16',
          },
        ],
      },
    });
    expect(detail.plan!.workouts).toHaveLength(1);
    expect(await prisma.plan.count()).toBe(1);
    expect(await prisma.planAutomationPolicy.count()).toBe(1);
    expect(await prisma.rollingMonthStrategy.findFirst()).toMatchObject({
      effectiveFrom: new Date('2099-11-18T00:00:00Z'),
    });
    expect(await prisma.rollingWeekGeneration.count()).toBe(1);
  });
  it('estimates legal SWIM TP speed from the real fitness owner as 100 seconds per 100 metres', async () => {
    await prisma.userFitnessMetric.create({
      data: {
        userId: 'user',
        type: 'TP',
        sport: 'SWIM',
        value: 1,
        source: 'MANUAL',
        changeSource: 'USER_MANUAL',
        recordedAt: new Date('2026-11-18'),
      },
    });
    const { PlanLoadEstimatorService } =
      await import('../application/plan-load-estimator.service');
    const { PlanRepository } = await import('../persistence/plan.repository');
    const { PlanWorkoutRepository } =
      await import('../persistence/plan-workout.repository');
    const loads = new PlanLoadEstimatorService(
      prisma as never,
      f.users,
      {} as never,
      new PlanRepository(prisma as never),
      new PlanWorkoutRepository(prisma as never),
    );
    const thresholds = await loads.loadThresholdsForUser('user', 'SWIM');
    expect(thresholds.swimThresholdPaceSecPer100m).toBe(100);
    const estimate = loads.estimate({
      sport: 'SWIM',
      thresholds,
      steps: [
        {
          id: 'threshold-swim',
          stepType: 'WORK',
          parentId: null,
          orderIndex: 0,
          intensity: 'ACTIVE',
          durationType: 'TIME',
          durationValue: 1000,
          durationUnit: 'SECONDS',
          targetType: 'SPEED',
          targetValueLow: 100,
          targetValueHigh: 100,
          targetUnit: 'SECONDS',
        } as never,
      ],
    });
    expect(estimate.estimatedLoad).toBeCloseTo(27.8, 1);
  });

  it('publishes one cross-month ISO week with both actual calendar month dependencies', async () => {
    const d = await ready('2099-11-30', (r) =>
      r.rolling!.monthStrategies.push({
        monthStart: '2099-12-01',
        objective: 'December progression',
        loadRange: null,
        durationMinutesRange: null,
        weekFocus: [],
      }),
    );
    await d.apply();
    const artifact = await f.query.windowSnapshot(
      'user',
      d.planId,
      '2099-11-30',
      '2099-12-06',
    );
    expect(artifact).toMatchObject({
      payloadVersion: 'plan-window-v2',
      sourceMode: 'ROLLING',
      snapshotOnly: true,
      generationCoverage: { status: 'GENERATED' },
      monthDirections: [
        { monthStart: '2099-11-01' },
        { monthStart: '2099-12-01' },
      ],
    });
    expect(await prisma.rollingWeekGeneration.count()).toBe(1);
    expect(await prisma.rollingWeekMonthStrategy.count()).toBe(2);
    expect(artifact.workouts[0].scheduledDate).toBe('2099-11-30');
  });

  it('rolls back courses, activation, policy and month direction when week publication fails', async () => {
    const d = await ready();
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION reject_rolling_week() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated publication failure'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER reject_rolling_week BEFORE INSERT ON t_rolling_week_generation FOR EACH ROW EXECUTE FUNCTION reject_rolling_week()`,
    );
    try {
      await expect(d.apply()).rejects.toThrow();
      expect(
        (await f.service.getPlanDetail('user', d.planId)).plan,
      ).toMatchObject({
        status: 'DRAFT',
        startDate: null,
        endDate: null,
        generatedThrough: null,
        workouts: [],
      });
      expect(await prisma.planAutomationPolicy.count()).toBe(0);
      expect(await prisma.rollingMonthStrategy.count()).toBe(0);
      expect(
        (
          await prisma.planProposalPreview.findUniqueOrThrow({
            where: { id: d.preview.previewId },
          })
        ).appliedAt,
      ).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER reject_rolling_week ON t_rolling_week_generation',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION reject_rolling_week()');
    }
  });

  it('uses ISO weekly availability after a Wednesday start, preserving fixed relative-week behavior', async () => {
    const d = await ready('2099-11-18', (r) => {
      r.scheduleConstraints = {
        version: 1,
        revision: 1,
        calendarTimeZone: 'UTC',
        fixedRestWeekdays: [],
        unavailableDates: [],
        availableDateOverrides: [],
        effectiveFrom: '2099-11-18',
        confirmation: { source: 'USER', reference: 'confirmed availability' },
      } as never;
      r.qualityContractTransition = {
        mode: 'INHERIT',
        maxTrainingDaysPerWeek: 2,
      };
    });
    await d.apply();
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
    await f.service.addWorkout('user', d.planId, workout(2));
    await f.service.addWorkout('user', d.planId, workout(6));
    await f.service.addWorkout('user', d.planId, workout(7));
    await expect(
      f.service.addWorkout('user', d.planId, { ...workout(1), weekIndex: 2 }),
    ).rejects.toThrow();
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts,
    ).toHaveLength(4);
  });

  it('discovers an open-ended plan in a distant bounded MCP window and never clamps its current week', async () => {
    const d = await ready();
    await d.apply();
    const discovered = await f.query.listPlansForMcp({
      userId: 'user',
      from: new Date('2150-01-01'),
      to: new Date('2150-01-31'),
      offset: 0,
      limit: 10,
    });
    expect(discovered).toEqual([
      expect.objectContaining({
        id: d.planId,
        planningMode: 'ROLLING',
        periodWeeks: null,
        endDate: null,
      }),
    ]);
    expect(
      await f.query.listPlansForMcp({
        userId: 'other',
        from: new Date('2150-01-01'),
        to: new Date('2150-01-31'),
        offset: 0,
        limit: 10,
      }),
    ).toEqual([]);
    const { getPlanAnchorDayIndex } =
      await import('../../ai/core/tools/plan-snapshot.shared');
    expect(
      getPlanAnchorDayIndex(
        { startDate: '2099-11-18', periodWeeks: null, planningMode: 'ROLLING' },
        dayjs('2110-01-01'),
      ),
    ).toMatchObject({ weekIndex: 529 });
  });

  it('preserves a missing middle generation as unknown in a dated snapshot and rejects oversized/foreign windows', async () => {
    const d = await ready();
    await d.apply();
    const policy = await prisma.planAutomationPolicy.findFirstOrThrow({
      where: { planId: d.planId },
    });
    await prisma.rollingWeekGeneration.create({
      data: {
        planId: d.planId,
        policyId: policy.id,
        weekStart: new Date('2099-11-30'),
        weekEnd: new Date('2099-12-06'),
        generatedFrom: new Date('2099-12-02'),
        generatedThrough: new Date('2099-12-06'),
        revision: 1,
        evidenceRevision: 'resume',
        receipt: {},
        appliedAt: new Date(),
      },
    });
    const artifact = await f.query.windowSnapshot(
      'user',
      d.planId,
      '2099-11-18',
      '2099-12-06',
    );
    expect(artifact.generationCoverage).toMatchObject({
      status: 'PARTIAL',
      intervals: [
        { from: '2099-11-18', through: '2099-11-22' },
        { from: '2099-12-02', through: '2099-12-06' },
      ],
    });
    await expect(
      f.query.windowSnapshot('other', d.planId, '2099-11-18', '2099-12-06'),
    ).rejects.toThrow();
    await expect(
      f.query.windowSnapshot('user', d.planId, '2099-11-18', '2100-12-06'),
    ).rejects.toThrow();
  });

  it('refuses missing policy, forged automation leases and revoked in-flight policy without changing the plan', async () => {
    await expect(
      ready('2099-11-18', (r) => delete r.rolling),
    ).rejects.toThrow();
    await prisma.plan.deleteMany();
    const d = await ready();
    await d.apply();
    const policy = await prisma.planAutomationPolicy.findFirstOrThrow({
      where: { planId: d.planId },
    });
    const job = await prisma.rollingPlanJob.create({
      data: {
        planId: d.planId,
        policyId: policy.id,
        kind: 'WEEK',
        windowStart: new Date('2099-11-23'),
        inputRevision: 'test',
        state: 'RUNNING',
        claimToken: 'server-claim',
        leaseUntil: new Date(Date.now() + 60000),
      },
    });
    await expect(f.starts.applyAutomation(job.id, 'forged')).rejects.toThrow();
    await prisma.planAutomationPolicy.update({
      where: { id: policy.id },
      data: { revokedAt: new Date() },
    });
    await expect(
      f.starts.applyAutomation(job.id, 'server-claim'),
    ).rejects.toThrow();
    expect(
      (await f.service.getPlanDetail('user', d.planId)).plan!.workouts,
    ).toHaveLength(1);
  });

  it('executes a DB-authorized weekly schedule without inventing a user decision and reads back one published week', async () => {
    const { RollingPlanAuthorizationService } =
      await import('../application/rolling-plan-authorization.service');
    const { SelfHostFeatureAccessPolicy } =
      await import('@/deployment/self-host-feature-access-policy.service');
    const { AiDataConsentService } =
      await import('@/ai-data-consent/ai-data-consent.service');
    const { UserQueryService } = await import('@/api/user/user-query.service');
    const { UserIdentityRepository } =
      await import('@/api/user/persistence/user-identity.repository');
    const saved = {
      AI_PROVIDER: process.env.AI_PROVIDER,
      DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE,
      SELF_HOST_MODE: process.env.SELF_HOST_MODE,
    };
    process.env.AI_PROVIDER = 'openai';
    process.env.DEPLOYMENT_MODE = 'cloud';
    delete process.env.SELF_HOST_MODE;
    try {
      const consent = new AiDataConsentService(
        new UserQueryService(new UserIdentityRepository(prisma as never)),
      );
      await consent.recordDecision({
        userId: 'user',
        granted: true,
        source: 'ACCOUNT_SETTINGS',
      });
      Object.assign(f.starts, {
        automationAccess: new RollingPlanAuthorizationService(
          new SelfHostFeatureAccessPolicy(),
          consent,
        ),
      });
      const d = await ready();
      await d.apply();
      const policy = await prisma.planAutomationPolicy.findFirstOrThrow({
        where: { planId: d.planId },
      });
      const job = await prisma.rollingPlanJob.create({
        data: {
          planId: d.planId,
          policyId: policy.id,
          kind: 'WEEK',
          windowStart: new Date('2099-11-23'),
          inputRevision: 'next-week',
          state: 'RUNNING',
          claimToken: 'valid-server-claim',
          leaseUntil: new Date(Date.now() + 60000),
        },
      });
      const { rolling: _, startDate: __, ...base } = d.request;
      const _candidate = await f.starts.createAutomationPreview(
        job.id,
        'valid-server-claim',
        {
          ...base,
          mode: 'SCHEDULE',
          range: { from: '2099-11-23', to: '2099-11-29' },
          additions: [
            {
              candidateKey: 'monday',
              workout: { ...d.request.additions[0].workout, dayIndex: 6 },
            },
          ],
        },
      );
      const decisions = await prisma.coachDecision.count();
      const receipt = await f.starts.applyAutomation(
        job.id,
        'valid-server-claim',
      );
      expect(receipt).toMatchObject({
        executionSource: 'AUTOMATION_POLICY',
        readbackVerified: true,
        policyRevision: 1,
        rolling: {
          generatedFrom: '2099-11-23',
          generatedThrough: '2099-11-29',
        },
      });
      expect(
        await f.starts.applyAutomation(job.id, 'valid-server-claim'),
      ).toEqual(receipt);
      expect(await prisma.coachDecision.count()).toBe(decisions);
      expect(await prisma.rollingWeekGeneration.count()).toBe(2);
      expect(await prisma.coachCommit.count()).toBe(1);
      expect(
        (await f.service.getPlanDetail('user', d.planId)).plan!.workouts,
      ).toHaveLength(2);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  async function withAuthorizedWeek(
    check: (input: {
      job: { id: string; claimToken: string | null };
      request: PlanSchedulePreviewRequest;
      planId: string;
      policyId: string;
      revokeConsent: () => Promise<unknown>;
    }) => Promise<void>,
  ) {
    const { RollingPlanAuthorizationService } =
      await import('../application/rolling-plan-authorization.service');
    const { SelfHostFeatureAccessPolicy } =
      await import('@/deployment/self-host-feature-access-policy.service');
    const { AiDataConsentService } =
      await import('@/ai-data-consent/ai-data-consent.service');
    const { UserQueryService } = await import('@/api/user/user-query.service');
    const { UserIdentityRepository } =
      await import('@/api/user/persistence/user-identity.repository');
    const saved = {
      AI_PROVIDER: process.env.AI_PROVIDER,
      DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE,
      SELF_HOST_MODE: process.env.SELF_HOST_MODE,
    };
    process.env.AI_PROVIDER = 'openai';
    process.env.DEPLOYMENT_MODE = 'cloud';
    delete process.env.SELF_HOST_MODE;
    try {
      const consent = new AiDataConsentService(
        new UserQueryService(new UserIdentityRepository(prisma as never)),
      );
      await consent.recordDecision({
        userId: 'user',
        granted: true,
        source: 'ACCOUNT_SETTINGS',
      });
      Object.assign(f.starts, {
        automationAccess: new RollingPlanAuthorizationService(
          new SelfHostFeatureAccessPolicy(),
          consent,
        ),
      });
      const d = await ready();
      await d.apply();
      const policy = await prisma.planAutomationPolicy.findFirstOrThrow({
        where: { planId: d.planId },
      });
      const job = await prisma.rollingPlanJob.create({
        data: {
          planId: d.planId,
          policyId: policy.id,
          kind: 'WEEK',
          windowStart: new Date('2099-11-23'),
          inputRevision: 'authorization-scope',
          state: 'RUNNING',
          claimToken: 'scope-claim',
          leaseUntil: new Date(Date.now() + 60000),
        },
      });
      const { rolling: _, startDate: __, ...base } = d.request;
      await check({
        job,
        planId: d.planId,
        policyId: policy.id,
        revokeConsent: () =>
          consent.recordDecision({
            userId: 'user',
            granted: false,
            source: 'ACCOUNT_SETTINGS',
          }),
        request: {
          ...base,
          mode: 'SCHEDULE',
          range: { from: '2099-11-23', to: '2099-11-29' },
          additions: [
            {
              candidateKey: 'next-monday',
              workout: { ...d.request.additions[0].workout, dayIndex: 6 },
            },
          ],
        },
      });
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it('rejects automatic additions outside the confirmed sports without altering the saved calendar', async () => {
    await withAuthorizedWeek(async ({ job, request, planId }) => {
      request.additions[0].workout.sportType = 'SWIM';
      await expect(
        f.starts.createAutomationPreview(job.id, job.claimToken!, request),
      ).rejects.toThrow('outside the authorized sports');
      expect(
        (await f.service.getPlanDetail('user', planId)).plan!.workouts,
      ).toHaveLength(1);
    });
  });

  it('rejects automatic changes to user availability settings before preparing a schedule', async () => {
    await withAuthorizedWeek(async ({ job, request, planId }) => {
      request.scheduleConstraints = {
        version: 1,
        revision: 1,
        calendarTimeZone: 'UTC',
        fixedRestWeekdays: [],
        unavailableDates: [],
        availableDateOverrides: [],
        effectiveFrom: '2099-11-23',
        confirmation: {
          source: 'USER',
          reference: 'model cannot confirm settings',
        },
      };
      request.qualityContractTransition = {
        mode: 'INHERIT',
        maxTrainingDaysPerWeek: 7,
      };
      await expect(
        f.starts.createAutomationPreview(job.id, job.claimToken!, request),
      ).rejects.toThrow('cannot change user settings');
      expect(
        (await f.service.getPlanDetail('user', planId)).plan!.workouts,
      ).toHaveLength(1);
    });
  });

  it('rechecks the current policy sports at automatic submission', async () => {
    await withAuthorizedWeek(async ({ job, request, policyId, planId }) => {
      await f.starts.createAutomationPreview(job.id, job.claimToken!, request);
      const policy = await prisma.planAutomationPolicy.findUniqueOrThrow({
        where: { id: policyId },
      });
      await prisma.planAutomationPolicy.update({
        where: { id: policyId },
        data: {
          settings: { ...(policy.settings as object), sportTypes: ['SWIM'] },
        },
      });
      await expect(
        f.starts.applyAutomation(job.id, job.claimToken!),
      ).rejects.toThrow('outside the authorized sports');
      expect(
        (await f.service.getPlanDetail('user', planId)).plan!.workouts,
      ).toHaveLength(1);
    });
  });

  it('preserves a manually protected course outside the automatic sports while publishing authorized courses', async () => {
    await withAuthorizedWeek(async ({ job, request, planId }) => {
      await f.service.addWorkout('user', planId, {
        weekIndex: 1,
        dayIndex: 7,
        sportType: 'SWIM',
        definition: {
          kind: 'FREEFORM',
          version: 1,
          source: 'TEXT',
          text: 'Easy swim',
        },
      });
      await f.starts.createAutomationPreview(job.id, job.claimToken!, request);
      await f.starts.applyAutomation(job.id, job.claimToken!);
      const snapshot = await f.query.windowSnapshot(
        'user',
        planId,
        '2099-11-23',
        '2099-11-29',
      );
      expect(
        snapshot.workouts.map((w) => [w.scheduledDate, w.sportType]),
      ).toEqual([
        ['2099-11-23', 'RUN'],
        ['2099-11-24', 'SWIM'],
      ]);
    });
  });

  it.each([
    'source edit',
    'fitness fact',
    'expired lease',
    'month strategy',
    'consent',
    'policy',
  ] as const)(
    'rejects automatic submission after a concurrent %s change',
    async (change) => {
      await withAuthorizedWeek(
        async ({ job, request, planId, policyId, revokeConsent }) => {
          await f.starts.createAutomationPreview(
            job.id,
            job.claimToken!,
            request,
          );
          if (change === 'source edit')
            await f.service.addWorkout('user', planId, {
              weekIndex: 1,
              dayIndex: 7,
              sportType: 'RUN',
              definition: {
                kind: 'FREEFORM',
                version: 1,
                source: 'TEXT',
                text: 'Manual run',
              },
            });
          else if (change === 'fitness fact')
            await prisma.userFitnessMetric.create({
              data: {
                userId: 'user',
                type: 'TP',
                sport: 'SWIM',
                value: 1,
                source: 'MANUAL',
                changeSource: 'USER_MANUAL',
                recordedAt: new Date(),
              },
            });
          else if (change === 'expired lease')
            await prisma.rollingPlanJob.update({
              where: { id: job.id },
              data: { leaseUntil: new Date(0) },
            });
          else if (change === 'consent') await revokeConsent();
          else if (change === 'policy')
            await prisma.planAutomationPolicy.update({
              where: { id: policyId },
              data: { revokedAt: new Date() },
            });
          else
            await prisma.rollingMonthStrategy.updateMany({
              where: { policyId },
              data: { supersededAt: new Date() },
            });
          await expect(
            f.starts.applyAutomation(job.id, job.claimToken!),
          ).rejects.toThrow();
          const snapshot = await f.query.windowSnapshot(
            'user',
            planId,
            '2099-11-23',
            '2099-11-29',
          );
          expect(
            snapshot.workouts.some((w) => w.scheduledDate === '2099-11-23'),
          ).toBe(false);
        },
      );
    },
  );

  it('rolls back an automatic publication when its lease expires during the atomic write', async () => {
    await withAuthorizedWeek(async ({ job, request, planId }) => {
      await f.starts.createAutomationPreview(job.id, job.claimToken!, request);
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION delay_rolling_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.4); RETURN NEW; END $$`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER delay_rolling_write BEFORE INSERT ON t_plan_workout FOR EACH ROW EXECUTE FUNCTION delay_rolling_write()`,
      );
      try {
        await prisma.rollingPlanJob.update({
          where: { id: job.id },
          data: { leaseUntil: new Date(Date.now() + 250) },
        });
        await expect(
          f.starts.applyAutomation(job.id, job.claimToken!),
        ).rejects.toThrow();
        const snapshot = await f.query.windowSnapshot(
          'user',
          planId,
          '2099-11-23',
          '2099-11-29',
        );
        expect(snapshot.workouts).toHaveLength(0);
        expect(snapshot.generationCoverage.status).toBe('NOT_GENERATED');
      } finally {
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER delay_rolling_write ON t_plan_workout',
        );
        await prisma.$executeRawUnsafe('DROP FUNCTION delay_rolling_write()');
      }
    });
  });

  it('separates actual, remaining planned and unknown forecast load without counting linked estimates twice', async () => {
    const d = await ready();
    await d.apply();
    const workout = await prisma.planWorkout.findFirstOrThrow({
      where: { planId: d.planId },
    });
    await prisma.planWorkout.update({
      where: { id: workout.id },
      data: { estimatedLoad: 50, estimatedLoadSource: 'PACE', status: 'DONE' },
    });
    const activity = await prisma.activity.create({
      data: {
        userId: 'user',
        hashId: 'actual-endurance',
        processingStatus: 'READY',
        state: 1,
        startTime: new Date('2099-11-18T08:00:00Z'),
        sportType: 'RUN',
        timerTime: 1800,
        sessionRpe: 5,
      },
    });
    const _extra = await prisma.activity.create({
      data: {
        userId: 'user',
        hashId: 'extra-training',
        processingStatus: 'READY',
        state: 1,
        startTime: new Date('2099-11-19T08:00:00Z'),
        sportType: 'RUN',
        timerTime: 1800,
        sessionRpe: 5,
      },
    });
    await prisma.planWorkoutActivityLink.create({
      data: {
        planId: d.planId,
        planWorkoutId: workout.id,
        activityId: activity.id,
        source: 'MANUAL',
        role: 'PRIMARY',
      },
    });
    await f.service.addWorkout('user', d.planId, {
      weekIndex: 1,
      dayIndex: 3,
      sportType: 'RUN',
      definition: {
        kind: 'FREEFORM',
        version: 1,
        source: 'TEXT',
        text: 'Run 20m',
      },
    });
    const artifact = await f.query.windowSnapshot(
      'user',
      d.planId,
      '2099-11-18',
      '2099-11-22',
    );
    expect(artifact.load).toMatchObject({
      actual: {
        value: 50,
        unit: 'NORMALIZED_LOAD',
        knownCount: 2,
        totalCount: 2,
        coverage: 'COMPLETE',
        sources: ['SESSIONRPE'],
      },
      remainingPlanned: {
        value: null,
        totalCount: 1,
        knownCount: 0,
        coverage: 'PARTIAL',
      },
      ungeneratedForecast: { value: null, coverage: 'UNKNOWN' },
    });
  });

  it('applies a real week 529 workout and renders only its dated window, retaining the fixed 520-week boundary', async () => {
    const { RollingPlanAuthorizationService } =
      await import('../application/rolling-plan-authorization.service');
    const { SelfHostFeatureAccessPolicy } =
      await import('@/deployment/self-host-feature-access-policy.service');
    const { AiDataConsentService } =
      await import('@/ai-data-consent/ai-data-consent.service');
    const { UserQueryService } = await import('@/api/user/user-query.service');
    const { UserIdentityRepository } =
      await import('@/api/user/persistence/user-identity.repository');
    const saved = {
      AI_PROVIDER: process.env.AI_PROVIDER,
      DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE,
      SELF_HOST_MODE: process.env.SELF_HOST_MODE,
    };
    process.env.AI_PROVIDER = 'openai';
    process.env.DEPLOYMENT_MODE = 'cloud';
    delete process.env.SELF_HOST_MODE;
    try {
      const consent = new AiDataConsentService(
        new UserQueryService(new UserIdentityRepository(prisma as never)),
      );
      await consent.recordDecision({
        userId: 'user',
        granted: true,
        source: 'ACCOUNT_SETTINGS',
      });
      Object.assign(f.starts, {
        automationAccess: new RollingPlanAuthorizationService(
          new SelfHostFeatureAccessPolicy(),
          consent,
        ),
      });
      const d = await ready();
      await d.apply();
      const policy = await prisma.planAutomationPolicy.findFirstOrThrow({
        where: { planId: d.planId },
      });
      await prisma.rollingMonthStrategy.create({
        data: {
          planId: d.planId,
          policyId: policy.id,
          monthStart: new Date('2110-01-01'),
          monthEnd: new Date('2110-01-31'),
          effectiveFrom: new Date('2110-01-01'),
          revision: 1,
          strategy: { objective: 'Maintain endurance in the current month' },
          evidenceRevision: 'current-month',
          appliedAt: new Date(),
        },
      });
      const job = await prisma.rollingPlanJob.create({
        data: {
          planId: d.planId,
          policyId: policy.id,
          kind: 'WEEK',
          windowStart: new Date('2110-01-06'),
          inputRevision: 'week529',
          state: 'RUNNING',
          claimToken: 'long-running-claim',
          leaseUntil: new Date(Date.now() + 60000),
        },
      });
      const { rolling: _, startDate: __, ...base } = d.request;
      const preview = await f.starts.createAutomationPreview(
        job.id,
        'long-running-claim',
        {
          ...base,
          mode: 'SCHEDULE',
          range: { from: '2110-01-06', to: '2110-01-12' },
          additions: [
            {
              candidateKey: 'monday529',
              workout: {
                ...d.request.additions[0].workout,
                weekIndex: 529,
                dayIndex: 6,
              },
            },
          ],
        },
      );
      expect(preview.presentation).toMatchObject({
        startDate: '2099-11-18',
        calendarDraftStartDate: '2110-01-06',
        calendarDraft: {
          periodWeeks: 1,
          workouts: [{ weekIndex: 1, dayIndex: 1 }],
        },
      });
      const result = await f.starts.applyAutomation(
        job.id,
        'long-running-claim',
      );
      expect(result).toMatchObject({
        readbackVerified: true,
        executionSource: 'AUTOMATION_POLICY',
      });
      const snapshot = await f.query.windowSnapshot(
        'user',
        d.planId,
        '2110-01-06',
        '2110-01-12',
      );
      expect(snapshot.workouts).toHaveLength(1);
      expect(snapshot.workouts[0].scheduledDate).toBe('2110-01-06');
      expect(snapshot.generationCoverage.status).toBe('GENERATED');
      const fixed = await f.service.createPlan('other', {
        title: 'Fixed',
        periodWeeks: 520,
        workouts: [
          {
            weekIndex: 520,
            dayIndex: 1,
            sportType: 'RUN',
            definition: {
              kind: 'FREEFORM',
              version: 1,
              source: 'TEXT',
              text: 'Run 30m',
            },
          },
        ],
      });
      await expect(
        f.service.addWorkout('other', fixed.plan!.id, {
          weekIndex: 529,
          dayIndex: 1,
          sportType: 'RUN',
          text: 'Run 30m',
        }),
      ).rejects.toThrow();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('invalidates an in-flight lease across pause and resume while retaining dates and history', async () => {
    const d = await ready();
    await d.apply();
    const policy = await prisma.planAutomationPolicy.findFirstOrThrow({
      where: { planId: d.planId },
    });
    const job = await prisma.rollingPlanJob.create({
      data: {
        planId: d.planId,
        policyId: policy.id,
        kind: 'WEEK',
        windowStart: new Date('2099-11-23'),
        inputRevision: 'pause-fence',
        state: 'RUNNING',
        claimToken: 'old-claim',
        leaseUntil: new Date(Date.now() + 60000),
      },
    });
    await f.service.pausePlan('user', d.planId);
    await f.service.activatePlan('user', d.planId);
    await expect(
      f.starts.applyAutomation(job.id, 'old-claim'),
    ).rejects.toThrow();
    const detail = await f.service.getPlanDetail('user', d.planId);
    expect(detail.plan).toMatchObject({
      status: 'ACTIVE',
      startDate: '2099-11-18',
      endDate: null,
    });
    expect(detail.plan!.workouts[0].scheduledDate).toBe('2099-11-18');
  });
  it('rejects a null FIXED period at the PostgreSQL boundary rather than accepting SQL unknown', async () => {
    await expect(
      prisma.plan.create({
        data: {
          userId: 'user',
          title: 'Invalid fixed',
          planningMode: 'FIXED',
          periodWeeks: null,
        },
      }),
    ).rejects.toThrow();
    expect(await prisma.plan.count()).toBe(0);
  });
});
