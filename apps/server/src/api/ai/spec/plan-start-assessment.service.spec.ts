import { RollingPlanService } from '../../plan/application/rolling-plan.service';
import { PlanStartAssessmentService } from '../plan-start-assessment.service';

describe('PlanStartAssessmentService', () => {
  const basePreflight = {
    alreadyActive: false as const,
    plan: { id: 'plan-p07', title: '跑步体能重建 · 持续计划', status: 'DRAFT' },
    source: {
      id: 'plan-p07',
      title: '跑步体能重建 · 持续计划',
      planningMode: 'ROLLING',
      goal: '稳定连续慢跑 35 分钟',
      workouts: [
        { id: 'w-jan2', revision: 1, dayOffset: 2, sessionIndex: 1, sportType: 'RUN', structureKind: 'ENDURANCE', name: '跑走交替 35 分钟', plannedDurationSeconds: 2100 },
        { id: 'w-jan4', revision: 1, dayOffset: 4, sessionIndex: 1, sportType: 'RUN', structureKind: 'ENDURANCE', name: '轻松跑 30 分钟', plannedDurationSeconds: 1800 },
        { id: 'w-jan6', revision: 1, dayOffset: 6, sessionIndex: 1, sportType: 'RUN', structureKind: 'ENDURANCE', name: '恢复跑 25 分钟', plannedDurationSeconds: 1500 },
      ],
    },
    revision: 'rev-1',
    factFingerprint: 'facts-1',
    startDate: '2026-12-31',
    calendarTimeZone: 'Asia/Shanghai',
    originalCanStart: true,
    conflicts: [],
    evidence: { activities: [], zones: [] },
  };

  function setup(overrides?: Partial<typeof basePreflight>) {
    const ai = { runBackgroundCoachTask: jest.fn() };
    const planStarts = {
      getStartDraft: jest.fn(),
      preflightStart: jest.fn().mockResolvedValue({ ...basePreflight, ...overrides }),
      normalizeRollingForStart: jest.fn().mockReturnValue({
        policy: { goal: '稳定连续慢跑 35 分钟', sportTypes: ['RUN'], autoPlanMonths: true, autoGenerateWeeks: true, autoAdjustFuture: true },
        monthStrategies: [],
      }),
      createDirectStartPreview: jest.fn(),
      confirmDirectStart: jest.fn(),
    };
    const i18n = {
      t: jest.fn((key: string) => key),
    };
    const service = new PlanStartAssessmentService(
      ai as never,
      planStarts as never,
      i18n as never,
    );
    return { service, ai, planStarts, i18n };
  }

  it('starts the same draft directly when verdict is FIT and originalCanStart is true', async () => {
    const { service, ai, planStarts } = setup();
    ai.runBackgroundCoachTask.mockResolvedValueOnce({
      result: { verdict: 'FIT', summary: '当前状态适配原课表，可以直接开始。' },
    });
    planStarts.confirmDirectStart.mockResolvedValueOnce({
      plan: { id: 'plan-p07', status: 'ACTIVE' },
      started: true,
      alreadyActive: false,
    });

    const res = await service.assessStart('u1', 'plan-p07', { startDate: '2026-12-31', revision: 'rev-1' });
    expect(res.outcome).toBe('STARTED');
    expect(planStarts.confirmDirectStart).toHaveBeenCalledWith(
      'u1',
      'plan-p07',
      expect.objectContaining({ startDate: '2026-12-31', revision: 'rev-1', choice: 'ORIGINAL' }),
      { assessed: true },
    );
  });

  it('returns SUGGESTED_CHANGES with validated proposal when coach suggests adjustments', async () => {
    const { service, ai, planStarts } = setup();
    ai.runBackgroundCoachTask.mockResolvedValueOnce({
      result: {
        verdict: 'SUGGEST_ADJUSTMENT',
        summary: '建议将首课缩短 10 分钟。',
        changes: [{ sourceWorkoutId: 'w-jan2', expectedRevision: 1, workout: { name: '轻松走跑 25 分钟' } }],
      },
    });
    planStarts.createDirectStartPreview.mockResolvedValueOnce({
      previewId: 'preview-1',
      presentation: {
        title: '跑步体能重建 · 持续计划',
        summary: '建议将首课缩短 10 分钟。',
        mode: 'START',
        startDate: '2026-12-31',
        calendarTimeZone: 'Asia/Shanghai',
        counts: { changed: 1, added: 0, deleted: 0, preserved: 2 },
        rows: [{ workoutId: 'w-jan2', changeKind: 'CHANGED', name: '轻松走跑 25 分钟', scheduledDate: '2027-01-02' }],
        warnings: [],
      },
    });

    const res = await service.assessStart('u1', 'plan-p07', { startDate: '2026-12-31', revision: 'rev-1' });
    expect(res).toMatchObject({
      outcome: 'SUGGESTED_CHANGES',
      originalCanStart: true,
      previewId: 'preview-1',
    });
    expect(planStarts.confirmDirectStart).not.toHaveBeenCalled();
  });

  it('returns CONFLICT without allowing original start when preflight reports hard conflicts', async () => {
    const { service, ai, planStarts } = setup({
      originalCanStart: false,
      conflicts: [{ date: '2027-01-02', code: 'REST_DAY', message: '周六为固定休息日' }],
    });
    ai.runBackgroundCoachTask.mockResolvedValueOnce({
      result: {
        verdict: 'SUGGEST_ADJUSTMENT',
        summary: '1 月 2 日为休息日，建议调整到 1 月 3 日。',
        changes: [{ sourceWorkoutId: 'w-jan2', expectedRevision: 1, workout: { weekIndex: 1, dayIndex: 4 } }],
      },
    });
    planStarts.createDirectStartPreview.mockResolvedValueOnce({
      previewId: 'preview-conflict',
      presentation: { rows: [{ workoutId: 'w-jan2', changeKind: 'CHANGED' }] },
    });

    const res = await service.assessStart('u1', 'plan-p07', { startDate: '2026-12-31', revision: 'rev-1' });
    expect(res).toMatchObject({
      outcome: 'CONFLICT',
      originalCanStart: false,
      previewId: 'preview-conflict',
      conflicts: [{ date: '2027-01-02', code: 'REST_DAY', message: '周六为固定休息日' }],
    });
  });

  it('returns INSUFFICIENT_DATA with missingEvidence when athlete history is sparse', async () => {
    const { service, ai } = setup();
    ai.runBackgroundCoachTask.mockResolvedValueOnce({
      result: {
        verdict: 'INSUFFICIENT_DATA',
        summary: '近 8 周无跑步活动记录，无法校验起始负荷。',
        missingEvidence: ['近 8 周无跑步活动', '未设置心率或配速区间'],
      },
    });

    const res = await service.assessStart('u1', 'plan-p07', { startDate: '2026-12-31', revision: 'rev-1' });
    expect(res).toMatchObject({
      outcome: 'INSUFFICIENT_DATA',
      originalCanStart: true,
      missingEvidence: ['近 8 周无跑步活动', '未设置心率或配速区间'],
    });
  });

  it('allows cross-year rolling starter workouts on Jan 4 and Jan 6 when starting on Dec 31', async () => {
    const rolling = new RollingPlanService({} as never, {} as never);
    jest.spyOn(rolling, 'areSportsAuthorized').mockResolvedValue(true);

    const validated = await rolling.validateStart(
      {
        policy: {
          goal: '稳定连续慢跑 35 分钟',
          sportTypes: ['RUN'],
          autoPlanMonths: true,
          autoGenerateWeeks: true,
          autoAdjustFuture: true,
        },
        monthStrategies: [
          {
            monthStart: '2026-12-01',
            objective: 'Dec kickoff',
            loadRange: null,
            durationMinutesRange: { min: 20, max: 40 },
            weekFocus: [{ weekStart: '2026-12-28', focus: 'Kickoff', loadRange: null, durationMinutesRange: { min: 20, max: 40 } }],
          },
          {
            monthStart: '2027-01-01',
            objective: 'Jan base',
            loadRange: null,
            durationMinutesRange: { min: 60, max: 120 },
            weekFocus: [{ weekStart: '2026-12-28', focus: 'Kickoff', loadRange: null, durationMinutesRange: { min: 60, max: 120 } }],
          },
        ],
      },
      '2026-12-31',
      [
        { weekIndex: 1, dayIndex: 3, sportType: 'RUN', structureKind: 'ENDURANCE' }, // 2027-01-02
        { weekIndex: 1, dayIndex: 5, sportType: 'RUN', structureKind: 'ENDURANCE' }, // 2027-01-04
        { weekIndex: 1, dayIndex: 7, sportType: 'RUN', structureKind: 'ENDURANCE' }, // 2027-01-06
      ],
      {} as never,
    );

    expect(validated.generatedFrom).toBe('2026-12-31');
    expect(validated.generatedThrough).toBe('2027-01-03');
  });

  it('returns CONFLICT with PLAN_EMPTY_WORKOUTS without invoking AI when draft has zero active workouts', async () => {
    const { service, ai } = setup({
      source: {
        ...basePreflight.source,
        workouts: [],
      },
    });

    const result = await service.assessStart('user-1', 'plan-empty', {
      startDate: '2026-12-31',
      revision: 'rev-1',
      lang: 'zh',
    });

    expect(ai.runBackgroundCoachTask).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      outcome: 'CONFLICT',
      originalCanStart: false,
      conflicts: [
        expect.objectContaining({ code: 'PLAN_EMPTY_WORKOUTS' }),
      ],
    });
  });

  it('requires explicit confirmation instead of auto-starting original when SUGGEST_ADJUSTMENT preview fails', async () => {
    const { service, ai, planStarts } = setup();
    ai.runBackgroundCoachTask.mockResolvedValue({
      result: {
        verdict: 'SUGGEST_ADJUSTMENT',
        summary: '近期负荷偏高，建议首周减量 20%。',
        changes: [
          {
            sourceWorkoutId: 'w-1',
            expectedRevision: 1,
            workout: { title: 'Reduced Easy Run' },
          },
        ],
      },
    } as never);
    planStarts.createDirectStartPreview.mockRejectedValue(
      new Error('PLAN_SCHEDULE_INVALID: REST_DAY_CONFLICT@2026-12-31'),
    );

    const result = await service.assessStart('user-1', 'plan-1', {
      startDate: '2026-12-31',
      revision: 'rev-1',
      lang: 'zh',
    });

    expect(planStarts.confirmDirectStart).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      outcome: 'INSUFFICIENT_DATA',
      originalCanStart: true,
      summary: '近期负荷偏高，建议首周减量 20%。',
    });
  });
});
