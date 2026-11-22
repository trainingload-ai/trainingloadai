import { createAiFallbackI18n } from '../spec/ai-fallback-i18n.test-util';
import { uncontendedGeneration } from './testing/generation.fixture';
import { TodaySuggestionConstraintProjector } from './today-suggestion-constraint.projector';
import { TodaySuggestionOrchestratorService } from './today-suggestion-orchestrator.service';
import { TodaySuggestionDeliveryPolicy } from './today-suggestion-delivery-policy';
import { TodaySuggestionEngagementService } from './today-suggestion-engagement.service';
import { validateTodaySuggestionDraftForProjection } from './today-suggestion-draft.validator';
import type { TodaySuggestionDraft } from './today-suggestion.types';

function harness() {
  let row: any = null;
  let state: any = null;
  const stateTable = {
    findUnique: jest.fn(async () => state),
    upsert: jest.fn(
      async ({ create, update }) =>
        (state = state ? { ...state, ...update } : { ...create }),
    ),
    update: jest.fn(async ({ data }) => (state = { ...state, ...data })),
  };
  const prisma = {
    aiTodaySuggestion: {
      findUnique: jest.fn(async () => row),
      findFirst: jest.fn(async () => row),
      update: jest.fn(async ({ data }) => (row = { ...row, ...data })),
      upsert: jest.fn(
        async ({ create, update }) =>
          (row = { id: 'row', ...(row ? { ...row, ...update } : create) }),
      ),
    },
    todaySuggestionEngagementState: stateTable,
    $transaction: jest.fn(async (fn) => fn(prisma)),
  };
  const engagement = new TodaySuggestionEngagementService(
    prisma as never,
    {
      cancelFutureTrainingReminderById: jest.fn(),
    } as never,
  );
  const execution = {
    factHash: 'execution',
    contextId: null,
    recentEvents: [],
    plan: null,
    anchor: { anchorDate: '2026-11-11', timezone: 'UTC' },
    day: {
      plannedWorkouts: [],
      linkedActivities: [],
      unlinkedActivities: [],
      completionState: 'NO_PLAN',
    },
    tomorrow: { plannedWorkouts: [] },
    recentLoad: {},
    competitionContext: {},
  };
  const independent: any[] = [];
  const coachState: any = {
    decisions: [],
    athleteState: null,
    decisionReadStatus: 'AVAILABLE',
    recentReviews: [],
  };
  const runtimeAi = { state: 'enabled', provider: 'test' };
  const access = { allowed: true };
  const coverage = {
    activities: {
      latestReadyAt: '2026-11-10T10:00:00Z',
      readyCount: 10,
      processing: [],
    },
  };
  const recentActivities: any[] = [
    { hashId: 'activity-1', startTime: '2026-11-10T10:00:00Z' },
  ];
  const diagnosis: any = {
    kind: 'training_data_coverage',
    asOf: '2026-11-11T10:00:00Z',
    window: { days: 35 },
    activities: coverage.activities,
    availableActivityImportMethods: {
      fileUpload: { enabled: true, formats: ['FIT', 'TCX', 'GPX'] },
      providers: [],
    },
    imports: { activeBatchCount: 0, recentBatches: [] },
    integrations: [],
    signals: {
      hasConnectedActivityImport: false,
      hasAutomaticActivityImport: false,
      hasRecentFileImport: false,
      syncInProgress: false,
      syncError: false,
      activityProcessingPending: false,
    },
  };
  const projector = new TodaySuggestionConstraintProjector(
    { buildContext: jest.fn(async () => execution) } as never,
    { build: jest.fn(async () => coachState) } as never,
    { pendingInquiry: jest.fn(async () => null) } as never,
    {
      activityEvidence: jest.fn(async () => coverage),
      recentActivityFacts: jest.fn(async () => recentActivities),
      snapshot: jest.fn(async () => diagnosis),
    } as never,
    {} as never,
    { snapshot: () => ({ capabilities: { ai: runtimeAi } }) } as never,
    {
      evaluate: async () => ({
        features: { 'ai.todaySuggestion': access },
      }),
    } as never,
    engagement,
    { findMany: jest.fn(async () => independent) } as never,
  );
  const agent = {
    run: jest.fn(async ({ projection }) => ({
      draft: validateTodaySuggestionDraftForProjection(
        {
          headline: 'Keep today easy',
          summary: 'A short easy session fits the recorded training load.',
          recommendation: { kind: 'TRAIN', intensity: 'EASY' },
          confidence: 'MEDIUM',
          evidenceCodes: ['RECENT_ACTIVITY'],
          preferredIntent: null,
          secondaryIntents: [],
          tags: [],
        } satisfies TodaySuggestionDraft,
        projection,
      ),
      runId: 'run',
      provider: 'test',
      model: 'test',
    })),
  };
  const workoutGenerator = { generate: jest.fn() };
  const service = new TodaySuggestionOrchestratorService(
    prisma as never,
    projector,
    agent as never,
    workoutGenerator as never,
    new TodaySuggestionDeliveryPolicy(createAiFallbackI18n()),
    engagement,
    uncontendedGeneration(prisma),
  );
  return {
    service,
    projector,
    agent,
    workoutGenerator,
    engagement,
    execution,
    coverage,
    independent,
    coachState,
    runtimeAi,
    access,
    prisma,
    recentActivities,
    diagnosis,
  };
}

describe('activity-first today suggestion regressions', () => {
  const args = { userId: 'athlete', locale: 'zh', allowAi: true };
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-11-11T10:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it('rejects an ungrounded moved-course recommendation through projection, generation and cached delivery', async () => {
    const { service, execution, agent } = harness();
    execution.day.plannedWorkouts.push({
      id: 'moved-course',
      status: 'MOVED',
      scheduledDate: '2026-11-11',
      name: 'Endurance ride',
      plannedDurationSeconds: 3900,
      linkedActivities: [],
    } as never);
    execution.tomorrow.plannedWorkouts.push({
      id: 'tomorrow-course',
      status: 'PLANNED',
      scheduledDate: '2026-11-12',
      name: 'Endurance ride',
      plannedDurationSeconds: 3900,
      linkedActivities: [],
    } as never);
    const result = await service.get(args);
    const projected = agent.run.mock.calls[0][0].projection;
    expect(projected.lightContext.todayExecution).toMatchObject({
      scheduledCount: 0,
      remainingCount: 0,
      remainingWorkoutIds: [],
      movedWorkoutIds: ['moved-course'],
    });
    expect(result.delivery.reasonCode).toBe('OUTPUT_REJECTED');
    expect(result.recommendation.kind).toBe('RECOVER');
    expect(result.summary).not.toContain('A short easy session');
    expect((await service.get(args)).recommendation.kind).toBe('RECOVER');
    expect(agent.run).toHaveBeenCalledTimes(1);
  });

  it('keeps access-denied fallback usable and refreshes it when access returns', async () => {
    const { service, access, coverage, recentActivities, agent } = harness();
    access.allowed = false;
    coverage.activities.readyCount = 0;
    coverage.activities.latestReadyAt = null as never;
    recentActivities.length = 0;
    const denied = await service.get(args);
    expect(denied.delivery.reasonCode).toBe('ACCESS_DENIED');
    expect(denied.primaryIntent?.type).toBe('OPEN_IMPORT');
    expect(denied.secondaryIntents).toEqual([]);
    expect(denied.summary).not.toContain('告诉教练');
    expect(agent.run).not.toHaveBeenCalled();
    expect((await service.get(args)).secondaryIntents).toEqual([]);
    access.allowed = true;
    const restored = await service.get(args);
    expect(restored.delivery.reasonCode).toBe('GENERATED');
    expect(restored.suggestionId).not.toBe(denied.suggestionId);
    expect(agent.run).toHaveBeenCalledTimes(1);
  });

  it('falls back and reuses the safe result when recovery carries an additional-training basis', async () => {
    const { service, agent, workoutGenerator, prisma } = harness();
    agent.run.mockImplementationOnce(async ({ projection }) => ({
      draft: validateTodaySuggestionDraftForProjection(
        {
          headline: 'Recover today',
          summary: 'Keep the rest of today light.',
          recommendation: { kind: 'RECOVER' },
          preferredIntent: 'ASK_COACH',
          secondaryIntents: [],
          trainingBasis: { kind: 'ADDITIONAL', reason: 'An easy ride fits.' },
        },
        projection,
      ),
      runId: 'inconsistent-run',
      provider: 'test',
      model: 'test',
    }));

    const first = await service.get(args);
    const second = await service.get(args);
    expect(first.delivery).toMatchObject({
      state: 'FACT_FALLBACK',
      reasonCode: 'OUTPUT_REJECTED',
    });
    expect(second.suggestionId).toBe(first.suggestionId);
    expect(second.delivery.cached).toBe(true);
    expect(agent.run).toHaveBeenCalledTimes(1);
    expect(workoutGenerator.generate).not.toHaveBeenCalled();
    expect(prisma.aiTodaySuggestion.upsert).toHaveBeenCalledTimes(1);
  });

  it('falls back as a whole when an additional-training preview cannot be generated', async () => {
    const { service, agent, workoutGenerator } = harness();
    const reason =
      'An optional additional ride fits the recent easy load and time available.';
    agent.run.mockImplementationOnce(async ({ projection }) => ({
      draft: validateTodaySuggestionDraftForProjection(
        {
          headline: 'An optional extra ride',
          summary: reason,
          recommendation: {
            kind: 'TRAIN',
            durationMinutes: 30,
            intensity: 'EASY',
          },
          confidence: 'MEDIUM',
          evidenceCodes: ['RECENT_ACTIVITY'],
          preferredIntent: 'CREATE_TODAY_WORKOUT',
          secondaryIntents: [],
          tags: [],
          trainingBasis: { kind: 'ADDITIONAL', reason },
        },
        projection,
      ),
      runId: 'extra-run',
      provider: 'test',
      model: 'test',
    }));
    workoutGenerator.generate.mockRejectedValueOnce(
      new Error('generator unavailable'),
    );
    const result = await service.get(args);
    expect(result.delivery.reasonCode).toBe('OUTPUT_REJECTED');
    expect(result.recommendation.kind).toBe('RECOVER');
    expect(result.primaryIntent?.type).not.toBe('CREATE_TODAY_WORKOUT');
    expect(result.summary).not.toBe(reason);
  });

  it('keeps fallback grounded in the actual morning session without inventing a plan', async () => {
    const { service, execution, recentActivities, agent } = harness();
    execution.day.unlinkedActivities.push({
      hashId: 'morning-run',
      startTime: '2026-11-11T01:07:00Z',
    } as never);
    recentActivities.unshift({
      hashId: 'morning-run',
      startTime: '2026-11-11T01:07:00Z',
      distanceKm: 10.01,
      durationMinutes: 52.25,
      avgHeartRate: 172,
    });
    agent.run.mockRejectedValueOnce(
      new Error('BACKGROUND_COACH_TASK_RESULT_MISSING'),
    );
    const result = await service.get(args);
    expect(result.delivery.reasonCode).toBe('OUTPUT_REJECTED');
    expect(result.summary).toContain('10.0 公里');
    expect(result.summary).toContain('52 分钟');
    expect(result.summary).toContain('172');
    expect(result.summary).not.toContain('原有安排');
    expect(result.summary).not.toContain('停训两周');
  });
  it('updates the cached judgment after an explicit rest choice and retains that choice', async () => {
    const { service, agent, engagement } = harness();
    const first = await service.get(args);
    await engagement.recordInteraction({
      userId: args.userId,
      generationToken: first.suggestionId,
      input: { kind: 'FEEDBACK', feedback: 'REST_TODAY' },
    });
    const after = await service.get(args);
    expect(after.suggestionId).not.toBe(first.suggestionId);
    expect(after.recommendation.kind).toBe('REST');
    expect(after.summary).not.toContain('补充');
    expect((await service.get(args)).recommendation.kind).toBe('REST');
    expect(agent.run).toHaveBeenCalledTimes(2);
    expect(
      await engagement.feedbackForDate(args.userId, '2026-11-11'),
    ).toMatchObject({ feedback: 'REST_TODAY' });
  });

  it('keeps failure provenance on cache hits and retries a transient failure after one minute', async () => {
    const { service, agent } = harness();
    agent.run.mockRejectedValueOnce(new Error('upstream unavailable'));
    const first = await service.get(args);
    const second = await service.get(args);
    expect(first.delivery.state).toBe('FACT_FALLBACK');
    expect(second.delivery).toMatchObject({
      state: first.delivery.state,
      reasonCode: first.delivery.reasonCode,
      generatedAt: first.delivery.generatedAt,
      cached: true,
    });
    expect(second.source).toBe('fallback');
    expect(second.summary).not.toContain('事实不足');
    expect(agent.run).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(61_000);
    expect((await service.get(args)).delivery.state).toBe('GENERATED');
    expect(agent.run).toHaveBeenCalledTimes(2);
  });

  function independentWorkout(id: string, status = 'PLANNED') {
    return {
      id,
      planId: null,
      scheduledDate: new Date('2026-11-11T00:00:00Z'),
      name: 'Scheduled session',
      notes: null,
      text: 'work 30m',
      sportType: 'RUN',
      status,
      plannedDurationSeconds: 1_800,
      revision: 1,
      updatedAt: new Date('2026-11-11T09:00:00Z'),
      _count: { links: 0 },
    };
  }

  it('provides normal advice from recent activity alone without requiring setup or a response', async () => {
    const { service, agent } = harness();
    const result = await service.get(args);
    expect(result.delivery.state).toBe('GENERATED');
    expect(result.recommendation.kind).toBe('TRAIN');
    expect(result.primaryIntent).toBeNull();
    const projection = agent.run.mock.calls[0][0].projection;
    expect(projection.activePlan).toBeNull();
    expect(projection.coverageDiagnosis).toBeNull();
    expect(projection.lightContext.recentActivities).toHaveLength(1);
  });

  it('does not change the prescription because a suggestion was merely presented', async () => {
    const { service, agent, engagement } = harness();
    const first = await service.get(args);
    await engagement.recordInteraction({
      userId: args.userId,
      generationToken: first.suggestionId,
      input: { kind: 'PRESENTED' },
    });
    const second = await service.get(args);
    expect(second.suggestionId).toBe(first.suggestionId);
    expect(second.recommendation).toEqual(first.recommendation);
    expect(agent.run).toHaveBeenCalledTimes(1);
  });

  it('sees independent sessions without an active plan and refreshes after an edit', async () => {
    const { projector, service, independent, agent } = harness();
    independent.push(independentWorkout('independent-1'));
    const projected = await projector.project(args);
    expect(projected.todayWorkouts[0]).toMatchObject({
      id: 'independent-1',
      planId: null,
    });
    const first = await service.get(args);
    independent[0].revision += 1;
    const second = await service.get(args);
    expect(second.suggestionId).not.toBe(first.suggestionId);
    expect(agent.run).toHaveBeenCalledTimes(2);
  });

  it('does not treat one completed session as completion of a multi-session day', async () => {
    const { projector, independent } = harness();
    independent.push(
      independentWorkout('done', 'DONE'),
      independentWorkout('remaining'),
    );
    const projected = await projector.project(args);
    expect(projected.constraints).not.toContain('TODAY_WORKOUT_COMPLETED');
    expect(projected.lightContext.todayExecution).toMatchObject({
      completedCount: 1,
      remainingCount: 1,
    });
  });

  it('offers recovery rather than adding training once every scheduled session is complete', async () => {
    const { service, independent } = harness();
    independent.push(independentWorkout('done', 'DONE'));
    const result = await service.get(args);
    expect(result.recommendation.kind).toBe('RECOVER');
    expect(result.primaryIntent).toBeNull();
  });

  it('permits evening training and uses actual remaining time near midnight', async () => {
    const { service } = harness();
    jest.setSystemTime(new Date('2026-11-11T21:00:00Z'));
    expect((await service.get(args)).recommendation.kind).toBe('TRAIN');
    jest.setSystemTime(new Date('2026-11-11T23:50:00Z'));
    const late = await service.get(args);
    expect(late.recommendation.kind).toBe('RECOVER');
    expect(late.primaryIntent).toBeNull();
  });

  it('waits for pending activity processing without assigning setup tasks', async () => {
    const { service, recentActivities, coverage, agent } = harness();
    recentActivities.length = 0;
    coverage.activities.readyCount = 0;
    coverage.activities.latestReadyAt = null as never;
    coverage.activities.processing.push({
      status: 'PROCESSING',
      count: 1,
    } as never);
    agent.run.mockRejectedValueOnce(new Error('upstream unavailable'));
    const result = await service.get(args);
    expect(result.summary).toContain('无需额外反馈');
    expect(result.primaryIntent).toBeNull();
    expect(Date.parse(result.validUntil) - Date.now()).toBe(30_000);
  });

  it('treats an assessment read failure as unavailable and skips model generation', async () => {
    const { service, coachState, agent } = harness();
    (coachState as any).assessmentReadStatus = 'UNAVAILABLE';
    const result = await service.get(args);
    expect(agent.run).not.toHaveBeenCalled();
    expect(result.recommendation.kind).toBe('RECOVER');
  });
  it('keeps equal assessment semantics stable when a repeat assessment only extends its expiry', async () => {
    const { projector, coachState } = harness();
    (coachState as any).athleteState = {
      state: 'STABLE',
      decisionReadiness: 'SUFFICIENT',
      assessmentId: 'a1',
      evidenceHash: 'audit1',
      expiresAt: '2026-11-11T12:00:00Z',
    };
    const before = await projector.project(args);
    Object.assign((coachState as any).athleteState, {
      assessmentId: 'a2',
      evidenceHash: 'audit2',
      expiresAt: '2026-11-11T12:05:00Z',
    });
    const after = await projector.project(args);
    expect(after.factHash).toBe(before.factHash);
    expect(after.constraintHash).toBe(before.constraintHash);
  });
  it('invalidates on a goal-only edit while ignoring unchanged audit timestamps', async () => {
    const { projector, execution } = harness();
    (execution as any).plan = {
      id: 'plan',
      title: 'Current plan',
      goal: 'Finish',
      status: 'ACTIVE',
      currentWeekIndex: 1,
      updatedAt: 'audit1',
    };
    const before = await projector.project(args);
    (execution as any).plan.updatedAt = 'audit2';
    expect((await projector.project(args)).factHash).toBe(before.factHash);
    (execution as any).plan.goal = 'Improve the 10K';
    expect((await projector.project(args)).factHash).not.toBe(before.factHash);
  });
  it('revalidates facts after generation and discards an outdated first draft', async () => {
    const { service, coverage, agent, prisma, projector } = harness();
    const normalRun = agent.run.getMockImplementation()!;
    agent.run.mockImplementationOnce(async (input) => {
      coverage.activities.readyCount += 1;
      return normalRun(input);
    });
    await service.get(args);
    expect(agent.run).toHaveBeenCalledTimes(2);
    expect(prisma.aiTodaySuggestion.upsert).toHaveBeenCalledTimes(1);
    expect(
      prisma.aiTodaySuggestion.upsert.mock.calls[0][0].create.signatureHash,
    ).toBe((await projector.project(args)).factHash);
  });

  it('keeps unavailable AI transparent and recovers after configuration changes', async () => {
    const { service, runtimeAi, agent } = harness();
    runtimeAi.state = 'not_configured';
    expect((await service.get(args)).delivery.state).toBe('AI_UNAVAILABLE');
    expect((await service.get(args)).delivery.state).toBe('AI_UNAVAILABLE');
    expect(agent.run).not.toHaveBeenCalled();
    runtimeAi.state = 'enabled';
    expect((await service.get(args)).delivery.state).toBe('GENERATED');
  });

  it('does not overwrite a valid concurrent AI result with a fallback', async () => {
    const { service, projector, agent, prisma } = harness();
    const facts = await projector.project(args);
    const validUntil = new Date(Date.now() + 3_600_000);
    const winner = {
      id: 'winner',
      generatedAt: new Date(),
      generationToken: 'winner-generation',
      signatureHash: facts.factHash,
      constraintHash: facts.constraintHash,
      validUntil,
      keyContext: { weatherImpact: facts.weatherImpact },
      tags: [],
      structuredResult: {
        version: 2,
        suggestionId: 'winner-generation',
        headline: 'Current advice',
        summary: 'Use the already completed judgment.',
        recommendation: { kind: 'RECOVER' },
        confidence: 'MEDIUM',
        evidence: [],
        primaryIntent: null,
        secondaryIntents: [],
        validUntil: validUntil.toISOString(),
        delivery: {
          state: 'GENERATED',
          reasonCode: 'GENERATED',
          generatedAt: new Date().toISOString(),
        },
      },
    };
    prisma.aiTodaySuggestion.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    agent.run.mockRejectedValueOnce(
      new Error('upstream temporarily unavailable'),
    );
    const result = await service.get(args);
    expect(result.summary).toBe('Use the already completed judgment.');
    expect(result.delivery.state).toBe('CACHED');
    expect(prisma.aiTodaySuggestion.upsert).not.toHaveBeenCalled();
  });

  it('invalidates advice when new ready training records arrive', async () => {
    const { service, agent, coverage } = harness();
    const first = await service.get(args);
    coverage.activities.readyCount += 1;
    coverage.activities.latestReadyAt = '2026-11-11T10:01:00Z';
    const second = await service.get(args);
    expect(second.suggestionId).not.toBe(first.suggestionId);
    expect(agent.run).toHaveBeenCalledTimes(2);
  });
});
