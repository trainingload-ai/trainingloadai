import { TodaySuggestionDeliveryPolicy } from './today-suggestion-delivery-policy';
import { TodaySuggestionOrchestratorService } from './today-suggestion-orchestrator.service';
import type { TodaySuggestionConstraintProjection } from './today-suggestion.types';

describe('TodaySuggestionOrchestratorService', () => {
  const originalSecret = process.env.SELF_HOST_AUTH_SECRET;

  beforeAll(() => {
    process.env.SELF_HOST_AUTH_SECRET =
      'test-secret-with-at-least-thirty-two-characters';
  });

  afterAll(() => {
    if (originalSecret) process.env.SELF_HOST_AUTH_SECRET = originalSecret;
    else delete process.env.SELF_HOST_AUTH_SECRET;
  });

  it('uses local time only as a late-day decision signal', () => {
    const service = new TodaySuggestionOrchestratorService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new TodaySuggestionDeliveryPolicy(),
      {} as never,
    );
    const draft = (
      service as unknown as {
        factFallback: (projection: TodaySuggestionConstraintProjection) => {
          headline: string;
          summary: string;
          preferredIntent: string;
        };
      }
    ).factFallback({
      locale: 'zh',
      localTime: '23:13',
      newWorkoutWindowOpen: false,
      tomorrowWorkouts: [],
      todayWorkouts: [],
      activePlan: null,
      pendingInquiry: null,
      constraints: ['TODAY_TRAINING_WINDOW_CLOSED'],
    } as TodaySuggestionConstraintProjection);

    expect(draft.headline).toBe('回顾今天，再为明天做准备');
    expect(draft.summary).toContain('今天没有可确认的计划训练或活动完成记录');
    expect(draft.summary).not.toContain('23:13');
    expect(draft.summary).not.toContain('20:00');
    expect(draft.preferredIntent).toBe('ASK_COACH');
  });

  it('serializes identical requests into one Agent run and one generation', async () => {
    let stored: Record<string, any> | null = null;
    const prisma = {
      aiTodaySuggestion: {
        findUnique: jest.fn(async () => stored),
        update: jest.fn(async ({ data }) => {
          stored = { ...(stored ?? {}), ...data };
          return stored;
        }),
        upsert: jest.fn(async ({ create, update }) => {
          stored = {
            id: 'suggestion-1',
            ...(stored ?? {}),
            ...(stored ? update : create),
            tags: (stored ? update : create).tags,
          };
          return stored;
        }),
      },
    };
    const projection = {
      userId: 'user-1',
      locale: 'en',
      date: '2026-10-28',
      timezone: 'Asia/Shanghai',
      edition: 'self-host',
      allowAi: true,
      featureAllowed: true,
      factHash: 'f'.repeat(64),
      constraintHash: 'c'.repeat(64),
      continuityHash: 'd'.repeat(64),
      validUntil: new Date(Date.now() + 60 * 60_000),
      constraints: ['NO_ACTIVE_PLAN'],
      requiredToolNames: [],
      lightContext: {},
      activePlan: null,
      todayWorkouts: [],
      tomorrowWorkouts: [],
      latestActivityId: null,
      latestActivityAt: null,
      activityEvidence: {},
      coachState: { athleteState: null, decisions: [] },
      pendingInquiry: null,
      activeDecisionId: null,
      highConcern: false,
      weatherImpact: { status: 'unavailable' },
      weatherAttribution: null,
    } as TodaySuggestionConstraintProjection;
    const projector = { project: jest.fn(async () => projection) };
    const agent = {
      run: jest.fn(async () => ({
        draft: {
          headline: 'Import your first activity',
          summary:
            'Add training data so the coach can assess your current state.',
          recommendation: { kind: 'SYNC_DATA' },
          confidence: 'LOW',
          evidenceCodes: ['NO_ACTIVE_PLAN'],
          preferredIntent: 'OPEN_IMPORT',
          secondaryIntents: ['ASK_COACH'],
          tags: ['More data needed'],
        },
        provider: 'test',
        model: 'test-model',
        runId: 'run-1',
        operationId: 'operation-1',
        replayed: false,
      })),
    };
    const engagement = {
      previewContinuityStage: jest.fn(async () => 1),
      rollover: jest.fn(async () => ({})),
    };
    const workoutGenerator = { generate: jest.fn() };
    const service = new TodaySuggestionOrchestratorService(
      prisma as never,
      projector as never,
      agent as never,
      workoutGenerator as never,
      new TodaySuggestionDeliveryPolicy(),
      engagement as never,
    );

    const [first, second] = await Promise.all([
      service.get({ userId: 'user-1', locale: 'en', allowAi: true }),
      service.get({ userId: 'user-1', locale: 'en', allowAi: true }),
    ]);

    expect(agent.run).toHaveBeenCalledTimes(1);
    expect(first.suggestionId).toBe(second.suggestionId);
    expect(first.delivery.state).toBe('GENERATED');
    expect(second.delivery.state).toBe('CACHED');
    expect(second.headline).toBe('Import your first activity');
    expect(prisma.aiTodaySuggestion.upsert).toHaveBeenCalledTimes(1);
    expect(stored?.keyContext).toMatchObject({ timezone: 'Asia/Shanghai' });
  });

  it('composes a daily judgment with exactly one Workout from the dedicated generator', async () => {
    let stored: Record<string, any> | null = null;
    const prisma = {
      aiTodaySuggestion: {
        findUnique: jest.fn(async () => null),
        update: jest.fn(),
        upsert: jest.fn(async ({ create }) => {
          stored = { id: 'suggestion-1', ...create };
          return stored;
        }),
      },
    };
    const projection = {
      userId: 'user-1',
      locale: 'zh',
      date: '2026-10-29',
      timezone: 'Asia/Shanghai',
      edition: 'cloud',
      allowAi: true,
      featureAllowed: true,
      factHash: 'f'.repeat(64),
      constraintHash: 'c'.repeat(64),
      continuityHash: 'd'.repeat(64),
      validUntil: new Date(Date.now() + 60 * 60_000),
      localTime: '10:00',
      minutesUntilDayEnd: 840,
      newWorkoutWindowOpen: true,
      constraints: ['NO_ACTIVE_PLAN'],
      requiredToolNames: [],
      lightContext: {},
      activePlan: null,
      todayWorkouts: [],
      tomorrowWorkouts: [],
      latestActivityId: null,
      latestActivityAt: null,
      activityEvidence: {},
      coachState: { athleteState: null, decisions: [] },
      pendingInquiry: null,
      activeDecisionId: null,
      highConcern: false,
      weatherImpact: { status: 'unavailable' },
      weatherAttribution: null,
    } as TodaySuggestionConstraintProjection;
    const dailyDraft = {
      headline: '今天先轻松恢复节奏',
      summary: '适合进行一次短时间、低强度训练。',
      recommendation: {
        kind: 'TRAIN' as const,
        durationMinutes: 20,
        intensity: 'VERY_EASY' as const,
      },
      confidence: 'MEDIUM' as const,
      evidenceCodes: ['NO_ACTIVE_PLAN'],
      preferredIntent: 'CREATE_TODAY_WORKOUT' as const,
      secondaryIntents: ['ASK_COACH' as const],
      tags: ['轻松'],
    };
    const workout = {
      sportType: 'RUN' as const,
      sportDefinitionCode: 'ROAD_RUNNING',
      name: '轻松跑走恢复',
      notes: '先走跑热身，再轻松跑，最后步行放松。',
      structureKind: 'ENDURANCE' as const,
      dslVersion: 1 as const,
      text: 'warmup 3m\nwork 12m\ncooldown 5m',
      structure: {
        kind: 'ENDURANCE' as const,
        version: 1 as const,
        blocks: [],
      },
      summary: {
        kind: 'ENDURANCE' as const,
        durationSeconds: 1_200,
        stepCount: 3,
        hardSession: false,
      },
    };
    const agent = {
      run: jest.fn(async () => ({
        draft: dailyDraft,
        provider: 'test',
        model: 'daily-model',
        runId: 'daily-run',
        operationId: 'daily-operation',
        replayed: false,
      })),
    };
    const workoutGenerator = {
      generate: jest.fn(async () => ({
        workout,
        provider: 'test',
        model: 'workout-model',
        runId: 'workout-run',
        replayed: false,
      })),
    };
    const engagement = {
      previewContinuityStage: jest.fn(async () => 0),
      rollover: jest.fn(async () => ({})),
    };
    const service = new TodaySuggestionOrchestratorService(
      prisma as never,
      { project: jest.fn(async () => projection) } as never,
      agent as never,
      workoutGenerator as never,
      new TodaySuggestionDeliveryPolicy(),
      engagement as never,
    );

    const result = await service.get({
      userId: 'user-1',
      locale: 'zh',
      allowAi: true,
    });

    expect(agent.run).toHaveBeenCalledTimes(1);
    expect(workoutGenerator.generate).toHaveBeenCalledTimes(1);
    expect(workoutGenerator.generate).toHaveBeenCalledWith(
      expect.objectContaining({ projection, draft: dailyDraft }),
    );
    expect(result.primaryIntent).toMatchObject({
      type: 'CREATE_TODAY_WORKOUT',
      preview: workout,
    });
    expect(stored?.structuredResult).toMatchObject({
      primaryIntent: { preview: workout },
    });
  });

  it('backfills the generation timezone on a fresh legacy cache row', async () => {
    const generatedAt = new Date();
    const validUntil = new Date(Date.now() + 60 * 60_000);
    const cachedResult = {
      version: 2,
      suggestionId: 'suggestion-1',
      headline: 'Keep today easy',
      summary: 'Use a short recovery session.',
      recommendation: { kind: 'RECOVERY' },
      confidence: 'MEDIUM',
      evidence: [],
      primaryIntent: null,
      secondaryIntents: [],
      validUntil: validUntil.toISOString(),
      delivery: {
        state: 'GENERATED',
        reasonCode: 'GENERATED',
        generatedAt: generatedAt.toISOString(),
      },
    };
    const cached = {
      id: 'row-1',
      generationToken: 'suggestion-1',
      generatedAt,
      validUntil,
      constraintHash: 'c'.repeat(64),
      signatureHash: 'f'.repeat(64),
      keyContext: { edition: 'self-host' },
      continuityHash: 'd'.repeat(64),
      structuredResult: cachedResult,
      tags: [],
    };
    const prisma = {
      aiTodaySuggestion: {
        findUnique: jest.fn(async () => cached),
        update: jest.fn(async () => cached),
        upsert: jest.fn(),
      },
    };
    const projection = {
      locale: 'en',
      date: '2026-10-29',
      timezone: 'Asia/Shanghai',
      edition: 'self-host',
      factHash: 'f'.repeat(64),
      constraintHash: 'c'.repeat(64),
      continuityHash: 'd'.repeat(64),
    } as TodaySuggestionConstraintProjection;
    const engagement = { rollover: jest.fn(async () => ({})) };
    const service = new TodaySuggestionOrchestratorService(
      prisma as never,
      { project: jest.fn(async () => projection) } as never,
      {} as never,
      {} as never,
      new TodaySuggestionDeliveryPolicy(),
      engagement as never,
    );

    await service.get({ userId: 'user-1', locale: 'en', allowAi: true });

    expect(prisma.aiTodaySuggestion.update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: {
        keyContext: expect.objectContaining({ timezone: 'Asia/Shanghai' }),
      },
    });
    expect(prisma.aiTodaySuggestion.upsert).not.toHaveBeenCalled();
  });
});
