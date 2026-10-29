import { describe, expect, it, jest } from '@jest/globals';
import {
  BadRequestException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPlanTemplateDraft,
  getPlanTemplateVariant,
  getRunPlanTemplate,
} from '@shared/plan-templates';

import { PlanTemplateService } from '../plan-template.service';

function createService(overrides?: { baseline?: Record<string, unknown> }) {
  const prisma = {
    planTemplatePreview: {
      create: jest.fn(async (_args: unknown) => ({})),
      findFirst: jest.fn(async (_args: unknown) => null),
      findUnique: jest.fn(async (_args: unknown) => null),
      update: jest.fn(async (_args: unknown) => ({})),
      updateMany: jest.fn(async (_args: unknown) => ({ count: 0 })),
    },
    $transaction: jest.fn(async (_callback: unknown) => undefined),
  };
  const plans = {
    createPlan: jest.fn(
      async (
        _userId: unknown,
        _payload: unknown,
        _options: unknown,
      ): Promise<unknown> => undefined,
    ),
    getPlanDetail: jest.fn(
      async (
        _userId: unknown,
        _planId: unknown,
        _tx: unknown,
      ): Promise<unknown> => undefined,
    ),
  };
  const baseline = {
    personalizationReadiness: 'none',
    activityCount: 0,
    validWeeks: 0,
    activeDaysPerWeek: 0,
    medianRunsPerWeek: 0,
    medianDistanceMetersPerWeek: 0,
    medianDurationMinutesPerWeek: 0,
    latestWeekDurationMinutes: 0,
    latestWeekDistanceMeters: 0,
    longestRunDistanceMeters: null,
    longestContinuousRunMinutes: null,
    recent5kSeconds: null,
    recentRaceEffort: null,
    ...overrides?.baseline,
  };
  const runningBaseline = { get: jest.fn(async () => baseline) };
  const capability = {
    resolve: jest.fn(async () => ({
      state: 'MISSING',
      resolvedAt: '2026-09-01T00:00:00.000Z',
      vdot: null,
    })),
    evaluate: jest.fn(({ template }: { template: { outcome?: string } }) => ({
      eligibility:
        template.outcome === 'TARGET'
          ? {
              status: 'INPUT_REQUIRED',
              reasonCodes: [],
              missingInputs: ['currentCapability'],
            }
          : {
              status: 'NOT_ELIGIBLE',
              reasonCodes: ['RUNNING_CONTINUITY_6_OF_8_WEEKS_REQUIRED'],
              missingInputs: [],
            },
      targetRace: null,
    })),
    resolveGoalRace: jest.fn(async () => null),
  };
  const previews = {
    create: (args: unknown) => prisma.planTemplatePreview.create(args),
    findFirst: (args: unknown, tx?: typeof prisma) =>
      (tx ?? prisma).planTemplatePreview.findFirst(args),
    findUnique: (args: unknown, tx?: typeof prisma) =>
      (tx ?? prisma).planTemplatePreview.findUnique(args),
    update: (args: unknown, tx?: typeof prisma) =>
      (tx ?? prisma).planTemplatePreview.update(args),
    updateMany: (args: unknown, tx?: typeof prisma) =>
      (tx ?? prisma).planTemplatePreview.updateMany(args),
  };
  const service = new PlanTemplateService(
    prisma as never,
    plans as never,
    runningBaseline as never,
    capability as never,
    previews as never,
  );

  return { service, prisma, plans, runningBaseline, capability };
}

describe('PlanTemplateService', () => {
  it('filters the public registry by goal and rejects unsupported goals', () => {
    const { service } = createService();
    const response = service.listPublic('zh-CN', '5K');
    expect(response.templates).toHaveLength(3);
    expect(response.templates[0]).toMatchObject({
      slug: 'first-5k',
      periodWeeks: 9,
      trainingDaysPerWeek: 3,
    });
    expect(response.templates[0].title).toContain('5K');
    expect(service.listPublic('zh-CN', '10K').templates).toHaveLength(3);
    expect(service.listPublic('en', 'marathon').templates).toHaveLength(3);
    expect(service.listPublic('en').templates).toHaveLength(12);
  });

  it.each([
    ['en', 'First 5K', 'Week 1: 1-minute run-walk blocks'],
    ['zh', '第一个 5K', '第 1 周：1 分钟跑走训练'],
    ['zh-hant', '第一個 5K', '第 1 週：1 分鐘跑走訓練'],
    ['ja', 'はじめての5K', '1週目：1分のラン・ウォーク'],
  ])('serializes the frozen First 5K preview in %s', (locale, title, week) => {
    const { service } = createService();
    const response = service.getPublic('first-5k', locale);
    expect(response.template.contentHash).toBe('fnv1a-878da2ef');
    expect(response.template.title).toContain(title);
    expect(response.template.weeks[0]).toMatchObject({
      title: week,
      workouts: expect.arrayContaining([
        expect.objectContaining({
          semanticId: 'run_5k_first.w1.s1',
          plannedRpe: 4,
          plannedRpeRange: { min: 3, max: 4 },
          intensityGuidance: expect.objectContaining({
            basis: 'RPE_TALK_TEST',
            rpe: { min: 3, max: 4, display: 'RPE 3–4' },
          }),
        }),
      ]),
    });
    expect(response.template.coachFlow).toMatchObject({
      runtimeAiCalled: false,
      aiTokensConsumed: false,
      stages: [{ id: 'TRACK' }, { id: 'ASSESS' }, { id: 'ADJUST' }],
    });
    expect(JSON.stringify(response)).not.toContain('sourceDsl');
    expect(JSON.stringify(response)).not.toContain('candidateSha256');
  });

  it('serializes the frozen 10K template without invented pace targets', () => {
    const { service } = createService();
    const response = service.getPublic('finish-10k', 'zh');
    expect(response.template).toMatchObject({
      key: 'RUN_10K_FINISH',
      version: '1.0.0',
      goal: '10K',
      periodWeeks: 10,
      trainingDaysPerWeek: 3,
      contentHash: 'fnv1a-893a47e3',
    });
    expect(response.template.weeks).toHaveLength(10);
    expect(response.template.weeks[9].workouts[2]).toMatchObject({
      intensityKind: 'RACE',
      plannedRpeRange: { min: 3, max: 4 },
      intensityGuidance: { basis: 'RPE_TALK_TEST' },
    });
    expect(JSON.stringify(response)).not.toMatch(
      /candidateSha256|sourceDsl|VDOT_RECENT_5K/,
    );
  });

  it('labels public VDOT 40 paces as examples and localizes outcome names', () => {
    const { service } = createService();
    const response = service.getPublic('improve-10k', 'zh');
    expect(response.template).toMatchObject({
      title: '10 公里进阶计划',
      outcome: 'IMPROVE',
      copyVersion: '1.0.2',
      publicExample: { id: 'PUBLIC_EXAMPLE_VDOT_40', vdot: 40 },
    });
    const paced = response.template.weeks
      .flatMap((week) => week.workouts)
      .find((workout) => workout.intensityGuidance.pace);
    expect(paced?.intensityGuidance).toMatchObject({
      basis: 'PUBLIC_EXAMPLE',
      pace: { source: 'PUBLIC_EXAMPLE' },
    });
    expect(paced?.intensityGuidance.summary).toContain(
      '公开最大摄氧量 40 示例',
    );
    expect(service.getPublic('target-10k', 'zh').template.title).toBe(
      '10 公里挑战计划',
    );
    expect(service.getPublic('improve-5k', 'zh').template).toMatchObject({
      title: '8 周 5K 进阶计划',
      copyVersion: '1.0.1',
      contentHash: 'fnv1a-37d1d7f3',
    });
  });

  it('uses the signed-in athlete capability in personalized template details', async () => {
    const { service, capability } = createService();
    capability.resolve.mockResolvedValue({
      state: 'AVAILABLE',
      resolvedAt: '2026-09-01T00:00:00.000Z',
      vdot: 46,
      vo2Max: 46,
      source: 'VO2_MAX',
      sourceId: 'metric-1',
      sourceRecordedAt: '2026-08-30T00:00:00.000Z',
    } as never);

    const response = await service.getPersonalized(
      'user-1',
      'finish-half-marathon',
      'zh',
    );
    const paced = response.template.weeks
      .flatMap((week) => week.workouts)
      .find((workout) => workout.intensityGuidance.pace);

    expect(response.capability).toMatchObject({
      state: 'AVAILABLE',
      vdot: 46,
      source: 'VO2_MAX',
    });
    expect(paced?.intensityGuidance).toMatchObject({
      basis: 'PERSONAL_CAPABILITY',
      pace: { source: 'VO2_MAX' },
    });
    expect(paced?.intensityGuidance.summary).not.toContain('VO₂max 40');
  });

  it.each([
    [{ personalizationReadiness: 'none' }, 'first-5k'],
    [
      { personalizationReadiness: 'adequate', longestContinuousRunMinutes: 24 },
      'finish-5k',
    ],
    [
      {
        personalizationReadiness: 'adequate',
        longestContinuousRunMinutes: 30,
        activeDaysPerWeek: 4,
        recent5kSeconds: 1_500,
      },
      'improve-5k',
    ],
  ])(
    'recommends deterministically from the running baseline',
    async (baseline, slug) => {
      const { service } = createService({ baseline });
      await expect(service.recommend('user-1')).resolves.toMatchObject({
        recommendation: { slug },
      });
    },
  );

  it('recommends 10K only when the entry baseline is present', async () => {
    const unready = createService();
    await expect(
      unready.service.recommend('user-1', '10K'),
    ).resolves.toMatchObject({
      recommendation: null,
      alternatives: ['finish-10k', 'improve-10k', 'target-10k'],
      options: expect.arrayContaining([
        expect.objectContaining({
          slug: 'finish-10k',
          status: 'NOT_ELIGIBLE',
          reasonCodes: ['TEN_K_BASELINE_REQUIRED'],
        }),
      ]),
    });

    const continuous = createService({
      baseline: { longestContinuousRunMinutes: 35 },
    });
    await expect(
      continuous.service.recommend('user-1', '10k'),
    ).resolves.toMatchObject({
      recommendation: {
        slug: 'finish-10k',
        variantId: 'standard',
        status: 'ELIGIBLE_RPE_FALLBACK',
      },
    });

    const recent5k = createService({ baseline: { recent5kSeconds: 1_800 } });
    await expect(
      recent5k.service.recommend('user-1', '10K'),
    ).resolves.toMatchObject({
      recommendation: { slug: 'finish-10k' },
    });
    await expect(
      recent5k.service.recommend('user-1', 'MARATHON'),
    ).resolves.toMatchObject({
      recommendation: null,
      alternatives: ['finish-marathon', 'improve-marathon', 'target-marathon'],
    });
  });

  it('persists a 24-hour deterministic preview and server-mapped dates', async () => {
    const { service, prisma } = createService();
    const response = await service.createPreview('user-1', 'first-5k', {
      startDate: '2026-09-09',
      preferredWeekdays: [1, 3, 6],
      locale: 'en',
      variantId: '9-week',
    });
    expect(response.startDate).toBe('2026-09-09');
    expect(response.calendar.slice(0, 3).map((item) => item.date)).toEqual([
      '2026-09-09',
      '2026-09-12',
      '2026-09-14',
    ]);
    expect(response.draft.sourceType).toBe('TEMPLATE');
    expect(prisma.planTemplatePreview.create).toHaveBeenCalledTimes(1);
    const call = prisma.planTemplatePreview.create.mock.calls[0][0] as {
      data: { payload: unknown; expiresAt: Date };
    };
    expect(call.data.payload).toMatchObject({ sourceType: 'TEMPLATE' });
    expect(call.data.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 23 * 60 * 60 * 1_000,
    );
  });

  it('requires recovery spacing for the three-run 10K schedule', async () => {
    const { service } = createService();
    await expect(
      service.createPreview('user-1', 'finish-10k', {
        startDate: '2026-09-07',
        preferredWeekdays: [1, 2, 3],
        locale: 'en',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const response = await service.createPreview('user-1', 'finish-10k', {
      startDate: '2026-09-07',
      preferredWeekdays: [1, 3, 6],
      locale: 'en',
    });
    expect(response.draft).toMatchObject({ goal: '10K', periodWeeks: 10 });
    expect(response.calendar).toHaveLength(30);
    expect(response.draft.workouts.at(-1)?.definition).toEqual(
      response.template.weeks[9].workouts[2].definition,
    );
  });

  it('exposes VDOT pace only in a personalized Improve preview with a 5K anchor', async () => {
    const { service: withoutAnchorService } = createService();
    const { service: withAnchorService } = createService({
      baseline: { recent5kSeconds: 1_500 },
    });
    const withoutAnchor = await withoutAnchorService.createPreview(
      'user-1',
      'improve-5k',
      {
        startDate: '2026-09-07',
        preferredWeekdays: [1, 3, 5, 7],
        locale: 'zh',
      },
    );
    const withAnchor = await withAnchorService.createPreview(
      'user-1',
      'improve-5k',
      {
        startDate: '2026-09-07',
        preferredWeekdays: [1, 3, 5, 7],
        locale: 'zh',
      },
    );
    const fallbackQuality = withoutAnchor.template.weeks[0].workouts[1];
    const pacedQuality = withAnchor.template.weeks[0].workouts[1];
    expect(fallbackQuality.intensityGuidance).toMatchObject({
      basis: 'RPE_TALK_TEST',
      rpe: { min: 7, max: 8, display: 'RPE 7–8' },
    });
    expect(fallbackQuality.intensityGuidance.pace).toBeUndefined();
    expect(pacedQuality.intensityGuidance).toMatchObject({
      basis: 'VDOT_RECENT_5K',
      pace: {
        display: '4:45–4:58 分/公里',
        zoneLabel: 'I',
        zoneSystem: 'VDOT',
        source: 'RECENT_5K',
      },
    });
  });

  it('creates a Target half-marathon preview without requiring a race event', async () => {
    const { service, capability, prisma } = createService();
    capability.resolve.mockResolvedValue({
      state: 'AVAILABLE',
      resolvedAt: '2026-09-01T00:00:00.000Z',
      vdot: 48,
    });
    capability.evaluate.mockReturnValue({
      eligibility: {
        status: 'ELIGIBLE',
        reasonCodes: [],
        missingInputs: [],
      },
      targetRace: null,
    });

    const response = await service.createPreview(
      'user-1',
      'target-half-marathon',
      {
        startDate: '2026-09-09',
        preferredWeekdays: [1, 2, 4, 5, 7],
        longRunWeekday: 7,
        locale: 'en',
      },
    );

    expect(response.startDate).toBe('2026-09-14');
    expect(response.calendar[0]?.date).toBe('2026-09-14');
    expect(capability.resolveGoalRace).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ slug: 'target-half-marathon' }),
      undefined,
    );
    expect(response.targetRace).toBeNull();
    expect(response.draft.goal).toBe('HALF_MARATHON');
    expect(
      response.template.weeks
        .flatMap((week) => week.workouts)
        .some(
          (workout) =>
            workout.intensityGuidance.pace?.source === 'VO2_MAX' &&
            workout.intensityGuidance.pace.zoneLabel === 'GOAL_HALF_PACE',
        ),
    ).toBe(true);
    expect(prisma.planTemplatePreview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          normalizedInput: expect.objectContaining({
            targetRaceEventId: null,
          }),
        }),
      }),
    );
  });

  it('returns an already-created official draft on retry', async () => {
    const { service, prisma, plans } = createService();
    prisma.planTemplatePreview.findFirst.mockResolvedValue({
      id: 'preview-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'user-1',
      tokenHash: 'hash',
      templateKey: 'RUN_5K_FIRST',
      templateVersion: '1.0.1',
      templateContentHash: service.listPublic('en').templates[0].contentHash,
      variantId: '9-week',
      locale: 'en',
      normalizedInput: {},
      payload: {},
      expiresAt: new Date(Date.now() - 60_000),
      consumedAt: new Date(),
      createdPlanId: 'plan-1',
    });
    plans.getPlanDetail.mockResolvedValue({
      plan: { id: 'plan-1', status: 'DRAFT' },
    });

    await expect(
      service.instantiate('user-1', 'first-5k', 'a'.repeat(43)),
    ).resolves.toMatchObject({
      plan: { id: 'plan-1', status: 'DRAFT' },
      reused: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(plans.createPlan).not.toHaveBeenCalled();
  });

  it('creates one official draft transactionally for a FREE user and returns it on token retry', async () => {
    const { service, prisma, plans } = createService();
    const baseRow = {
      id: 'preview-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'user-1',
      tokenHash: 'hash',
      templateKey: 'RUN_5K_FIRST',
      templateVersion: '1.0.1',
      templateContentHash: service.listPublic('en').templates[0].contentHash,
      variantId: '9-week',
      locale: 'en',
      normalizedInput: {},
      payload: {
        title: 'First 5K',
        periodWeeks: 9,
        sourceType: 'TEMPLATE',
        workouts: [],
      },
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdPlanId: null,
    };
    const tx = {
      planTemplatePreview: {
        findFirst: jest.fn(async () => baseRow),
        findUnique: jest.fn(async () => baseRow),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async () => ({})),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: unknown) =>
      (callback as (value: unknown) => Promise<unknown>)(tx),
    );
    plans.createPlan.mockResolvedValue({
      plan: { id: 'plan-1', status: 'DRAFT' },
    });

    await expect(
      service.instantiate('user-1', 'first-5k', 'a'.repeat(43)),
    ).resolves.toMatchObject({
      plan: { id: 'plan-1', status: 'DRAFT' },
      reused: false,
    });
    expect(plans.createPlan).toHaveBeenCalledTimes(1);
    expect(tx.planTemplatePreview.update).toHaveBeenCalledWith({
      where: { id: 'preview-1' },
      data: { createdPlanId: 'plan-1' },
    });

    tx.planTemplatePreview.findFirst.mockResolvedValue({
      ...baseRow,
      createdPlanId: 'plan-1',
    });
    plans.getPlanDetail.mockResolvedValue({
      plan: { id: 'plan-1', status: 'DRAFT' },
    });
    await expect(
      service.instantiate('user-1', 'first-5k', 'a'.repeat(43)),
    ).resolves.toMatchObject({
      plan: { id: 'plan-1' },
      reused: true,
    });
    expect(plans.createPlan).toHaveBeenCalledTimes(1);
  });

  it('rejects expired, cross-user and stale previews without creating a plan', async () => {
    const { service, prisma, plans } = createService();
    const validRow = {
      id: 'preview-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'user-1',
      tokenHash: 'hash',
      templateKey: 'RUN_5K_FIRST',
      templateVersion: '1.0.1',
      templateContentHash: service.listPublic('en').templates[0].contentHash,
      variantId: '9-week',
      locale: 'en',
      normalizedInput: {},
      payload: {},
      expiresAt: new Date(Date.now() - 1),
      consumedAt: null,
      createdPlanId: null,
    };
    const tx = {
      planTemplatePreview: {
        findFirst: jest.fn(async () => validRow),
        findUnique: jest.fn(async () => validRow),
        updateMany: jest.fn(async () => ({ count: 0 })),
        update: jest.fn(async () => ({})),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: unknown) =>
      (callback as (value: unknown) => Promise<unknown>)(tx),
    );

    await expect(
      service.instantiate('user-1', 'first-5k', 'a'.repeat(43)),
    ).rejects.toBeInstanceOf(GoneException);

    tx.planTemplatePreview.findFirst.mockResolvedValue(null as never);
    await expect(
      service.instantiate('user-2', 'first-5k', 'a'.repeat(43)),
    ).rejects.toBeInstanceOf(NotFoundException);

    tx.planTemplatePreview.findFirst.mockResolvedValue({
      ...validRow,
      expiresAt: new Date(Date.now() + 60_000),
      templateContentHash: 'stale-hash',
    });
    await expect(
      service.instantiate('user-1', 'first-5k', 'a'.repeat(43)),
    ).rejects.toBeInstanceOf(GoneException);

    tx.planTemplatePreview.findFirst.mockResolvedValue({
      ...validRow,
      expiresAt: new Date(Date.now() + 60_000),
      templateVersion: '1.0.0',
    });
    await expect(
      service.instantiate('user-1', 'first-5k', 'a'.repeat(43)),
    ).rejects.toBeInstanceOf(GoneException);
    expect(plans.createPlan).not.toHaveBeenCalled();
  });

  it('returns the winning plan when a concurrent retry loses the claim', async () => {
    const { service, prisma, plans } = createService();
    const baseRow = {
      id: 'preview-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'user-1',
      tokenHash: 'hash',
      templateKey: 'RUN_5K_FIRST',
      templateVersion: '1.0.1',
      templateContentHash: service.listPublic('en').templates[0].contentHash,
      variantId: '9-week',
      locale: 'en',
      normalizedInput: {},
      payload: {},
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdPlanId: null,
    };
    const tx = {
      planTemplatePreview: {
        findFirst: jest.fn(async () => baseRow),
        findUnique: jest.fn(async () => ({
          ...baseRow,
          consumedAt: new Date(),
          createdPlanId: 'plan-winner',
        })),
        updateMany: jest.fn(async () => ({ count: 0 })),
        update: jest.fn(async () => ({})),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: unknown) =>
      (callback as (value: unknown) => Promise<unknown>)(tx),
    );
    plans.getPlanDetail.mockResolvedValue({
      plan: { id: 'plan-winner', status: 'DRAFT' },
    });

    await expect(
      service.instantiate('user-1', 'first-5k', 'a'.repeat(43)),
    ).resolves.toMatchObject({
      plan: { id: 'plan-winner', status: 'DRAFT' },
      reused: true,
    });
    expect(plans.createPlan).not.toHaveBeenCalled();
  });

  it('anchors a Target plan so its final workout lands on the actual race day', () => {
    const { service } = createService();
    const scheduler = service as unknown as {
      alignTargetStartDate: (
        raceDate: string,
        periodWeeks: number,
        weekdays: number[],
        longRunWeekday?: number,
      ) => string;
    };

    const startDate = scheduler.alignTargetStartDate(
      '2026-11-14',
      10,
      [1, 2, 4, 5, 6],
      6,
    );
    expect(startDate).toBe('2026-09-06');
    const template = getRunPlanTemplate('target-10k')!;
    const variant = getPlanTemplateVariant(template)!;
    const draft = buildPlanTemplateDraft({
      template,
      variant,
      locale: 'zh',
      preferredWeekdays: [1, 2, 4, 5, 6],
      requestedStartDate: startDate,
    });
    const raceWorkout = draft.workouts.at(-1)!;
    const raceWorkoutDate = new Date(`${startDate}T00:00:00.000Z`);
    raceWorkoutDate.setUTCDate(
      raceWorkoutDate.getUTCDate() +
        (raceWorkout.weekIndex - 1) * 7 +
        raceWorkout.dayIndex -
        1,
    );
    expect(raceWorkoutDate.toISOString().slice(0, 10)).toBe('2026-11-14');
    expect(() =>
      scheduler.alignTargetStartDate('2026-11-14', 10, [1, 2, 4, 5, 7], 7),
    ).toThrow(BadRequestException);
  });

  it('starts a generated plan after the selected long-run day', () => {
    const { service } = createService();
    const scheduler = service as unknown as {
      alignStartAfterLongRunDay: (
        startDate: string,
        longRunWeekday: number,
      ) => string;
    };

    expect(scheduler.alignStartAfterLongRunDay('2026-09-02', 6)).toBe(
      '2026-09-06',
    );
  });
});
