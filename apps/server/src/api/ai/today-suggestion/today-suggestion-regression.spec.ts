import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Logger } from '@nestjs/common';
import type { LanguageModel } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { executeBackgroundCoachTask } from '../core/coach-task-runtime';
import type { CoachTurnInput } from '../core/coach-turn-input';
import { streamCoachAnswer } from '../core/tool-loop-agent.runtime';
import { coachTaskSubmitResultTool } from '../core/tools/coachTaskSubmitResult.tool';
import { createAiFallbackI18n } from '../spec/ai-fallback-i18n.test-util';
import { uncontendedGeneration } from './testing/generation.fixture';
import { TodaySuggestionAgentService } from './today-suggestion-agent.service';
import { TodaySuggestionConstraintProjector } from './today-suggestion-constraint.projector';
import { TodaySuggestionOrchestratorService } from './today-suggestion-orchestrator.service';
import { TodaySuggestionDeliveryPolicy } from './today-suggestion-delivery-policy';
import { TodaySuggestionEngagementService } from './today-suggestion-engagement.service';
import { TodayGenerationLeaseLost } from './today-suggestion-generation.service';
import { validateTodaySuggestionDraftForProjection } from './today-suggestion-draft.validator';
import type { TodaySuggestionDraft } from './today-suggestion.types';

let coachModel: LanguageModel;
jest.mock('../core/coach-upstream.adapter', () => ({
  ...jest.requireActual<typeof import('../core/coach-upstream.adapter')>(
    '../core/coach-upstream.adapter',
  ),
  createCoachLanguageModel: () => coachModel,
  getCoachUpstreamProvider: () => 'openrouter',
  getCoachBaseUrlForLog: () => 'test',
}));

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

function attachCoachRuntime(
  agent: ReturnType<typeof harness>['agent'],
  model: LanguageModel,
  { runId = 'today-run', maxSteps = 1 } = {},
) {
  coachModel = model;
  const projector = {
    run: { runId, attemptId: 'attempt', messageId: 'message' },
    consume: jest.fn(() => []),
    finish: jest.fn(),
  };
  const runs = {
    beginBackground: jest.fn(async () => ({
      handle: {
        projector,
        sessionId: 'background:today',
        operationId: 'operation',
      },
    })),
    checkpoint: jest.fn(async (_handle: unknown, _state?: string) => undefined),
    heartbeat: jest.fn(async () => null),
  };
  const submit = jest.fn(coachTaskSubmitResultTool.execute);
  const usage = { recordUsageEvent: jest.fn() };
  const background = {
    runs,
    logger: new Logger('TodaySuggestionRegression'),
    usage,
    runTurn: async ({
      backgroundTask,
      lang,
      prompt,
      session,
      signal,
      onActivity,
    }: CoachTurnInput) => {
      for (const toolName of backgroundTask!.requiredToolNames ?? []) {
        backgroundTask!.completedToolNames!.add(toolName);
      }
      return streamCoachAnswer({
        tools: [{ ...coachTaskSubmitResultTool, execute: submit }],
        ctx: {
          backgroundTask,
          signal,
          onActivity,
          session,
          lang,
          userService: { getPreferredTimezone: async () => 'UTC' },
        } as never,
        messages: [{ role: 'user', content: prompt }],
        model: 'test-model',
        maxSteps,
      });
    },
  };
  const todayAgent = new TodaySuggestionAgentService({
    runBackgroundCoachTask: (
      params: Parameters<typeof executeBackgroundCoachTask>[1],
    ) =>
      executeBackgroundCoachTask(
        background as unknown as Parameters<
          typeof executeBackgroundCoachTask
        >[0],
        { ...params, model: 'test-model' },
      ),
  } as never);
  agent.run.mockImplementation((params) => todayAgent.run(params) as never);
  return { projector, runs, submit, usage };
}

describe('activity-first today suggestion regressions', () => {
  const args = { userId: 'athlete', locale: 'zh', allowAi: true };
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-11-11T10:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  describe('model transport faults', () => {
    afterEach(() => jest.restoreAllMocks());

    it.each([
      { fault: 'transient DNS', attempts: 2, timeoutMs: 0 },
      { fault: 'persistent DNS', attempts: 3, timeoutMs: 0 },
      { fault: 'idle timeout', attempts: 1, timeoutMs: 20_000 },
      { fault: 'step timeout', attempts: 1, timeoutMs: 10_000 },
    ])(
      'handles $fault before delivering today’s suggestion',
      async ({ fault, attempts, timeoutMs }) => {
        jest.replaceProperty(process, 'env', {
          ...process.env,
          AI_COACH_STREAM_IDLE_TIMEOUT_MS: '20000',
          AI_COACH_STEP_TIMEOUT_MS:
            fault === 'step timeout' ? '10000' : '300000',
        });
        const { service, agent, workoutGenerator, prisma, execution } =
          harness();
        execution.day.unlinkedActivities.push({
          hashId: 'morning-run',
          startTime: '2026-11-11T01:07:00Z',
        } as never);
        const draft = {
          headline: 'Recover today',
          summary: 'Use today for easy recovery after the recorded activity.',
          recommendation: { kind: 'RECOVER' },
          confidence: 'MEDIUM',
          evidenceCodes: ['RECENT_ACTIVITY'],
        };
        const startedAt = Date.now();
        let abortAfterMs: number | undefined;
        let transportRecovered = false;
        const chunk = (choice: unknown) =>
          JSON.stringify({
            id: 'fixture',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'test-model',
            choices: [choice],
          });
        const fetchModel = jest.fn<
          ReturnType<typeof fetch>,
          Parameters<typeof fetch>
        >(async (_input, init) => {
          if (fault === 'step timeout') {
            return new Response(
              new ReadableStream({
                start(controller) {
                  const started = chunk({
                    index: 0,
                    delta: { content: 'Reviewing the recorded activity.' },
                    finish_reason: null,
                  });
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${started}\n\n`),
                  );
                  init?.signal?.addEventListener(
                    'abort',
                    () => {
                      abortAfterMs = Date.now() - startedAt;
                      controller.error(
                        new DOMException('Model request aborted', 'AbortError'),
                      );
                    },
                    { once: true },
                  );
                },
              }),
              { headers: { 'content-type': 'text/event-stream' } },
            );
          }
          if (timeoutMs) {
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => {
                  abortAfterMs = Date.now() - startedAt;
                  reject(
                    new DOMException('Model request aborted', 'AbortError'),
                  );
                },
                { once: true },
              );
            });
          }
          if (
            !transportRecovered &&
            (fault === 'persistent DNS' || fetchModel.mock.calls.length === 1)
          ) {
            throw new TypeError('fetch failed', {
              cause: Object.assign(
                new Error('getaddrinfo EAI_AGAIN fixture.invalid'),
                {
                  code: 'EAI_AGAIN',
                },
              ),
            });
          }
          const events = [
            chunk({
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'submit',
                    type: 'function',
                    function: {
                      name: 'coach_task_submit_result',
                      arguments: JSON.stringify({ result: draft }),
                    },
                  },
                ],
              },
              finish_reason: null,
            }),
            chunk({ index: 0, delta: {}, finish_reason: 'tool_calls' }),
            '[DONE]',
          ];
          return new Response(
            events.map((event) => `data: ${event}\n\n`).join(''),
            {
              headers: { 'content-type': 'text/event-stream' },
            },
          );
        });
        const model = createOpenAICompatible({
          name: 'openrouter',
          baseURL: 'https://fixture.invalid/v1',
          apiKey: 'fixture',
          fetch: fetchModel,
        })('test-model');
        const { runs, submit, usage } = attachCoachRuntime(agent, model);
        const pending = service.get({ ...args, locale: 'en' });
        await jest.advanceTimersByTimeAsync(timeoutMs ? 61_000 : 8_000);
        const result = await pending;

        expect(fetchModel).toHaveBeenCalledTimes(attempts);
        expect(prisma.aiTodaySuggestion.upsert).toHaveBeenCalledTimes(1);
        expect(workoutGenerator.generate).not.toHaveBeenCalled();
        expect(result.recommendation.kind).toBe('RECOVER');
        if (fault === 'transient DNS') {
          expect(result.delivery).toMatchObject({
            state: 'GENERATED',
            reasonCode: 'GENERATED',
          });
          expect(submit).toHaveBeenCalledTimes(1);
          expect(usage.recordUsageEvent).toHaveBeenCalledTimes(1);
          expect(runs.checkpoint.mock.lastCall?.[1]).toBe('completed');
          return;
        }

        expect(result.delivery).toMatchObject({
          state: 'FACT_FALLBACK',
          reasonCode: timeoutMs ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
        });
        expect(submit).not.toHaveBeenCalled();
        expect(usage.recordUsageEvent).not.toHaveBeenCalled();
        expect(runs.checkpoint.mock.lastCall?.[1]).toBe('failed');
        if (timeoutMs) {
          expect(abortAfterMs).toBe(timeoutMs);
          return;
        }

        const cached = await service.get({ ...args, locale: 'en' });
        expect(cached.delivery).toMatchObject({
          reasonCode: 'UPSTREAM_ERROR',
          cached: true,
        });
        expect(fetchModel).toHaveBeenCalledTimes(attempts);
        transportRecovered = true;
        await jest.advanceTimersByTimeAsync(61_000);
        const recovered = await service.get({ ...args, locale: 'en' });
        expect(recovered.delivery.state).toBe('GENERATED');
        expect(fetchModel).toHaveBeenCalledTimes(attempts + 1);
        expect(prisma.aiTodaySuggestion.upsert).toHaveBeenCalledTimes(2);
      },
    );
  });

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

  it('keeps in-flight and cached advice stable across unapplied calendar proposal states', async () => {
    const { service, coachState, agent } = harness();
    const proposal = {
      id: 'unapplied-calendar-move',
      decisionType: 'PLAN_SCHEDULE',
      state: 'PROPOSED',
      stateRole: 'ACTIVE_PROPOSAL',
      riskTier: 'HIGH',
      relevance: 'TODAY',
    };
    const normalRun = agent.run.getMockImplementation()!;
    agent.run.mockImplementationOnce(async (input) => {
      coachState.decisions = [proposal];
      return normalRun(input);
    });
    const first = await service.get(args);
    expect(first.delivery.state).toBe('GENERATED');
    for (const state of ['PROPOSED', 'APPROVED', 'SUPERSEDED']) {
      coachState.decisions = [{
        ...proposal,
        state,
        stateRole: state === 'SUPERSEDED' ? 'SUPERSEDED_HISTORY' : 'ACTIVE_PROPOSAL',
      }];
      const cached = await service.get(args);
      expect(cached.delivery.state).toBe('CACHED');
      expect(cached.suggestionId).toBe(first.suggestionId);
      expect(cached.decisionRef).toBeUndefined();
    }
    coachState.decisions = [];
    expect((await service.get(args)).suggestionId).toBe(first.suggestionId);
    expect(agent.run).toHaveBeenCalledTimes(1);
  });

  it('generates without asking the model to classify inactive schedule decisions', async () => {
    const { service, coachState, agent } = harness();
    coachState.decisions.push(
      {
        id: 'superseded-schedule',
        state: 'SUPERSEDED',
        stateRole: 'SUPERSEDED_HISTORY',
        relevance: 'UNKNOWN',
      },
      {
        id: 'draft-schedule',
        state: 'DRAFT',
        stateRole: 'INTERNAL_DRAFT',
        relevance: 'TODAY',
      },
    );

    expect((await service.get(args)).delivery.state).toBe('GENERATED');
    expect(
      agent.run.mock.calls[0][0].projection.lightContext.relevantDecisions,
    ).toEqual([]);
  });

  it('replaces a still-live cached suggestion produced with an expired calendar proposal', async () => {
    const { service, prisma, agent } = harness();
    const original = await service.get(args);
    const legacyId = 'advice-from-before-calendar-policy';
    await prisma.aiTodaySuggestion.update({
      data: {
        signatureHash: 'old-projection-that-included-the-calendar-proposal',
        generationToken: legacyId,
        summary: 'Move the run to tomorrow after accepting the proposal.',
        structuredResult: {
          ...original,
          suggestionId: legacyId,
          summary: 'Move the run to tomorrow after accepting the proposal.',
          decisionRef: { decisionId: 'expired-calendar-proposal' },
        },
      },
    });
    expect(Date.parse(original.validUntil)).toBeGreaterThan(Date.now());

    const updated = await service.get(args);
    expect(updated.delivery.state).toBe('GENERATED');
    expect(updated.suggestionId).not.toBe(legacyId);
    expect(updated.summary).toBe(original.summary);
    expect(updated.decisionRef).toBeUndefined();
    await expect(service.get(args)).resolves.toMatchObject({
      suggestionId: updated.suggestionId, delivery: { state: 'CACHED' },
    });
    expect(agent.run).toHaveBeenCalledTimes(2);
  });

  describe('draft rejection in a background run', () => {
    const draft = {
      headline: 'A short easy workout',
      summary: 'Optional extra training fits the current load and schedule.',
      recommendation: { kind: 'TRAIN', intensity: 'EASY' },
      preferredIntent: null,
      secondaryIntents: [],
    };
    const rejectedDrafts = [
      {
        code: 'TRAINING_BASIS_REQUIRED',
        correction: 'Provide trainingBasis',
        input: draft,
      },
      {
        code: 'TRAINING_BASIS_WORKOUT_UNAVAILABLE',
        correction: 'Select a PLANNED or IN_PROGRESS workout',
        input: {
          ...draft,
          trainingBasis: { kind: 'SCHEDULED', workoutId: 'invalid-workout' },
        },
      },
      {
        code: 'TRAINING_BASIS_OPEN_WORKOUT_CONFLICT',
        correction: 'Remove OPEN_TODAY_WORKOUT',
        input: {
          ...draft,
          trainingBasis: { kind: 'ADDITIONAL', reason: draft.summary },
          preferredIntent: 'CREATE_TODAY_WORKOUT',
          secondaryIntents: ['OPEN_TODAY_WORKOUT'],
        },
      },
    ];

    afterEach(() => jest.restoreAllMocks());

    const decisionDraft = {
      ...draft,
      recommendation: { kind: 'RECOVER' },
      coachDecisionHandling: [
        { decisionId: 'rejected-schedule', handling: 'IGNORE' },
      ],
    };
    const scenarios = [
      ...rejectedDrafts.flatMap((scenario) =>
        [true, false].map((repaired) => ({
          ...scenario,
          decision: false,
          repaired,
          attempts: repaired ? 2 : 1,
          maxSteps: repaired ? 3 : 1,
          category: 'TODAY_SUGGESTION_OUTPUT_REJECTED_TRAINING_BASIS',
        })),
      ),
      ...[true, false].map((repaired) => ({
        code: 'INVALID_RECOMMENDATION',
        correction: 'Use a supported recommendation.kind',
        input: { ...draft, recommendation: { kind: 'RESUME_PLAN' } },
        decision: false,
        repaired,
        attempts: repaired ? 2 : 1,
        maxSteps: repaired ? 3 : 1,
        category: 'TODAY_SUGGESTION_OUTPUT_REJECTED_DRAFT',
      })),
      {
        code: 'UNNECESSARY_CHECK_IN',
        correction: 'without requiring a check-in',
        input: { ...draft, recommendation: { kind: 'CHECK_IN' } },
        decision: false,
        repaired: false,
        attempts: 1,
        maxSteps: 1,
        category: 'TODAY_SUGGESTION_OUTPUT_REJECTED_UNNECESSARY_CHECK_IN',
      },
      ...[true, false].map((repaired) => ({
        code: 'COACH_DECISION_INVALID_HANDLING',
        correction: 'Set handling for decisionId "rejected-schedule" to HISTORY.',
        input: decisionDraft,
        decision: true,
        repaired,
        attempts: repaired ? 2 : 3,
        maxSteps: 6,
        category: 'TODAY_SUGGESTION_OUTPUT_REJECTED_COACH_DECISION',
      })),
    ];
    it.each(scenarios)(
      'surfaces $code and correlates the outcome (repaired=$repaired)',
      async ({
        code,
        correction,
        input,
        repaired,
        decision,
        attempts,
        maxSteps,
        category,
      }) => {
        const log = jest
          .spyOn(Logger.prototype, 'log')
          .mockImplementation(() => undefined);
        const warn = jest
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);
        const {
          service,
          execution,
          agent,
          workoutGenerator,
          prisma,
          coachState,
        } = harness();
        if (decision) {
          coachState.decisions.push({
            id: 'rejected-schedule',
            state: 'REJECTED',
            stateRole: 'REJECTED_HISTORY',
            relevance: 'TODAY',
          });
        }
        execution.day.plannedWorkouts.push({
          id: 'moved-course',
          status: 'MOVED',
          scheduledDate: '2026-11-11',
          linkedActivities: [],
        } as never);
        const runId = repaired ? 'repaired-run' : 'rejected-run';
        const usage = {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 10, text: 10, reasoning: 0 },
        };
        const corrected = {
          ...draft,
          headline: 'Recover today',
          summary: 'Use today for recovery.',
          recommendation: { kind: 'RECOVER' },
          ...(decision && {
            coachDecisionHandling: [
              { decisionId: 'rejected-schedule', handling: 'HISTORY' },
            ],
          }),
        };
        let modelStep = 0;
        const model = new MockLanguageModelV3({
          doStream: async () => {
            const step = modelStep++;
            return {
              stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                {
                  type: 'tool-call' as const,
                  toolCallId: `submit-${step}`,
                  toolName: 'coach_task_submit_result',
                  input: JSON.stringify({
                    result: step > 0 && repaired ? corrected : input,
                  }),
                },
                {
                  type: 'finish' as const,
                  finishReason: {
                    unified: 'tool-calls' as const,
                    raw: 'tool_calls',
                  },
                  usage,
                },
              ]),
            };
          },
        });
        const { runs, submit, projector } = attachCoachRuntime(agent, model, {
          runId,
          maxSteps,
        });

        const result = await service.get(args);
        expect(model.doStreamCalls).toHaveLength(attempts);
        expect(submit).toHaveBeenCalledTimes(attempts);
        await expect(submit.mock.results[0].value).resolves.toEqual({
          code,
          error: expect.stringContaining(correction),
          stage: 'execute',
        });
        if (repaired) {
          const toolReply = model.doStreamCalls[1].prompt
            .flatMap((message) =>
              message.role === 'tool' ? message.content : [],
            )
            .find((part) => part.toolName === 'coach_task_submit_result');
          expect(
            toolReply?.output.type === 'text'
              ? JSON.parse(toolReply.output.value)
              : null,
          ).toMatchObject({ code, error: expect.stringContaining(correction) });
          await expect(submit.mock.results[1].value).resolves.toEqual({
            kind: 'coach_task_result_accepted',
            taskType: 'TODAY_SUGGESTION',
          });
        }
        const delivery = repaired
          ? { state: 'GENERATED', reasonCode: 'GENERATED' }
          : { state: 'FACT_FALLBACK', reasonCode: 'OUTPUT_REJECTED' };
        expect(result.delivery).toMatchObject(delivery);
        expect(result.recommendation.kind).toBe('RECOVER');
        expect(workoutGenerator.generate).not.toHaveBeenCalled();
        expect(projector.consume).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'activity',
            activity: expect.objectContaining({
              status: 'failed',
              failure: { code, stage: 'execute' },
            }),
          }),
        );
        expect(runs.checkpoint.mock.lastCall?.[1]).toBe(
          repaired ? 'completed' : 'failed',
        );
        expect(prisma.aiTodaySuggestion.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({ runId: repaired ? runId : null }),
          }),
        );
        const rejectionLog = warn.mock.calls
          .map(([message]) => String(message))
          .find((message) => message.includes(`runId=${runId}`));
        expect(rejectionLog).toContain(category);
        expect(rejectionLog).toContain(`attemptId=attempt`);
        expect(rejectionLog).toContain(`reasonCode=${code}`);
        expect(rejectionLog).not.toContain(input.summary);
        const acceptedLog = expect.stringContaining(
          `corrected result accepted task=TODAY_SUGGESTION runId=${runId} attemptId=attempt`,
        );
        if (repaired) {
          expect(log).toHaveBeenCalledWith(acceptedLog);
        } else {
          expect(log).not.toHaveBeenCalledWith(acceptedLog);
        }
        expect(log).toHaveBeenCalledWith(
          expect.stringContaining(
            `state=${delivery.state} reason=${delivery.reasonCode} runId=${runId} attemptId=attempt`,
          ),
        );
      },
    );
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
      input.onRunStarted('outdated-run', 'first-attempt');
      return { ...(await normalRun(input)), runId: 'outdated-run' };
    });
    const log = jest.spyOn(Logger.prototype, 'log');
    try {
      await service.get(args);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          'attempt superseded reason=FACTS_CHANGED runId=outdated-run attemptId=first-attempt',
        ),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          'state=GENERATED reason=GENERATED runId=outdated-run attemptId=first-attempt',
        ),
      );
    } finally {
      log.mockRestore();
    }
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
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    agent.run.mockImplementationOnce(async ({ onRunStarted }) => {
      onRunStarted('rejected-run', 'first-attempt');
      throw new Error('BACKGROUND_COACH_TASK_RESULT_MISSING');
    });
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    try {
      const result = await service.get(args);
      expect(agent.run).toHaveBeenCalledTimes(1);
      expect(result.summary).toBe('Use the already completed judgment.');
      expect(result.delivery.state).toBe('CACHED');
      expect(prisma.aiTodaySuggestion.upsert).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          'state=CACHED reason=CACHE_HIT runId=rejected-run attemptId=first-attempt',
        ),
      );
    } finally {
      log.mockRestore();
    }
  });

  it('correlates the in-progress fallback when the publishing lease is lost', async () => {
    const { service, agent, prisma } = harness();
    agent.run.mockImplementationOnce(async ({ onRunStarted }) => {
      onRunStarted('rejected-run', 'first-attempt');
      throw new Error('BACKGROUND_COACH_TASK_RESULT_MISSING');
    });
    prisma.$transaction.mockRejectedValueOnce(new TodayGenerationLeaseLost());
    const log = jest.spyOn(Logger.prototype, 'log');
    try {
      const result = await service.get(args);
      expect(result.delivery).toMatchObject({
        state: 'FACT_FALLBACK',
        reasonCode: 'GENERATION_IN_PROGRESS',
      });
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          'state=FACT_FALLBACK reason=GENERATION_IN_PROGRESS runId=rejected-run attemptId=first-attempt',
        ),
      );
    } finally {
      log.mockRestore();
    }
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

describe('Report case 08: tomorrow workout duration and weekly load claims', () => {
  const request = { userId: 'test-athlete', locale: 'en', allowAi: true };
  const planName = 'Synthetic endurance ride';

  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-11-15T23:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  async function deliver(
    minutes: number,
    change: number,
    {
      locale = 'en',
      comparable = true,
      direction = 'higher',
      period = 'the same days last week',
      detail = '',
      summary = '',
    } = {},
  ) {
    const { service, execution, agent } = harness();
    execution.anchor.anchorDate = '2026-11-15';
    execution.tomorrow.plannedWorkouts.push({
      id: 'tomorrow-workout',
      status: 'PLANNED',
      scheduledDate: '2026-11-16',
      name: planName,
      plannedDurationSeconds: 3_960,
      linkedActivities: [],
    } as never);
    Object.assign(execution.recentLoad, {
      currentWeekLoad: 330,
      previousWeekLoad: 300,
      ...(comparable ? { weekToDateLoadChangePercent: 10 } : {}),
      dailyLoadLast7d: [50, 50, 30, 60, 40, 50, 50],
    });

    const suggestionAgent = new TodaySuggestionAgentService({
      runBackgroundCoachTask: async (task) => ({
        result: task.validateResult({
          headline: 'Recover today',
          summary:
            summary ||
            (locale === 'de'
              ? `Nutze den Abend zur Erholung. Deine Wochenlast liegt um ${String(change).replace('.', ',')} % höher als an den gleichen Tagen der letzten Woche.`
              : `Use today for recovery. This week's recorded load is ${change}% ${direction} than on ${period}.`),
          recommendation: {
            kind: 'RECOVER',
            details: [
              detail ||
                (locale === 'de'
                  ? `Morgen: ${planName}, ${minutes} min mit 3 × 12 min.`
                  : `Tomorrow: ${planName}, ${minutes} minutes.`),
            ],
          },
          confidence: 'MEDIUM',
          evidenceCodes: ['RECENT_ACTIVITY'],
          preferredIntent: 'VIEW_TOMORROW',
          secondaryIntents: [],
        }),
        runId: 'synthetic-run',
        provider: 'test',
        model: 'test-model',
      }),
    } as never);
    agent.run.mockImplementationOnce((input) => suggestionAgent.run(input));

    const delivered = await service.get({ ...request, locale });
    const projection = agent.run.mock.calls[0][0].projection;
    expect(projection.lightContext).toMatchObject({
      tomorrowWorkouts: [{ name: planName, plannedDurationSeconds: 3_960 }],
      load: { currentWeekLoad: 330, previousWeekLoad: 300 },
    });
    return delivered;
  }

  it('delivers the recovery suggestion when the claims match the projection', async () => {
    const delivered = await deliver(66, 10);
    expect(delivered.delivery.state).toBe('GENERATED');
    expect(delivered.summary).toContain('10% higher');
    expect(delivered.primaryIntent).toMatchObject({
      type: 'VIEW_TOMORROW',
      date: '2026-11-16',
    });
    expect(delivered.recommendation.details).toContain(
      `Tomorrow: ${planName}, 66 minutes.`,
    );
  });

  it('omits or corrects a tomorrow workout duration that disagrees with the projection', async () => {
    const delivered = await deliver(71, 10);
    expect(delivered.recommendation.kind).toBe('RECOVER');
    expect(delivered.primaryIntent?.type).toBe('VIEW_TOMORROW');
    const narrative = [
      delivered.summary,
      ...(delivered.recommendation.details ?? []),
    ].join(' ');
    expect(narrative).not.toMatch(/\b71\s*[-–]?\s*(?:minutes?|min|m)\b/i);
  });

  it('omits or corrects a weekly load comparison that disagrees with the projection', async () => {
    const delivered = await deliver(66, 24);
    expect(delivered.recommendation.kind).toBe('RECOVER');
    expect(delivered.primaryIntent?.type).toBe('VIEW_TOMORROW');
    const narrative = [
      delivered.summary,
      ...(delivered.recommendation.details ?? []),
    ].join(' ');
    expect(narrative).not.toMatch(/\b24(?:\s*%|\s+percent\b)/i);
  });
  it('preserves the German recovery advice, interval details and matching plan duration', async () => {
    const delivered = await deliver(66, 10, { locale: 'de' });
    expect(delivered.summary).toContain('10 % höher');
    expect(delivered.recommendation.details).toContain(
      `Morgen: ${planName}, 66 min mit 3 × 12 min.`,
    );
  });

  it('drops unsupported German claims while preserving the action', async () => {
    const delivered = await deliver(71, 24.5, { locale: 'de' });
    expect(delivered.summary).toBe('Nutze den Abend zur Erholung.');
    expect(delivered.recommendation.details ?? []).toHaveLength(0);
    expect(delivered.primaryIntent?.type).toBe('VIEW_TOMORROW');
  });

  it.each([{ comparable: false }, { direction: 'lower' }])(
    'omits a weekly load percentage with unsupported basis %j',
    async (options) => {
      const delivered = await deliver(66, 10, options);
      expect(delivered.summary).toBe('Use today for recovery.');
      expect(delivered.primaryIntent?.type).toBe('VIEW_TOMORROW');
    },
  );
  it.each([
    'Tomorrow’s 71-minute ride.',
    'Tomorrow: a 1:11 endurance ride.',
    '明天骑行71分钟即可。',
  ])('drops a mismatched tomorrow total written as %s', async (detail) => {
    const delivered = await deliver(66, 10, { detail });
    expect(delivered.recommendation.details ?? []).toHaveLength(0);
  });

  it.each([
    'Tomorrow: Synthetic endurance ride, 66 minutes including 10 min of warm-up.',
    'Recover for 20 minutes today before tomorrow’s ride.',
    'Tomorrow: Synthetic endurance ride, 1 h 6 min.',
    'Tomorrow: Synthetic endurance ride, 400 m of drills, 66 minutes.',
  ])(
    'keeps a supported duration or unrelated quantity in %s',
    async (detail) => {
      const delivered = await deliver(66, 10, { detail });
      expect(delivered.recommendation.details).toEqual([detail]);
    },
  );

  it.each([
    'Training load is 25% higher this week than the same days last week.',
    'Die Belastung dieser Woche liegt um 24 % höher als im gleichen Zeitraum der letzten Woche.',
    '本週負荷比上週同期高24%。',
  ])(
    'drops a mismatched weekly comparison written as %s',
    async (comparison) => {
      const delivered = await deliver(66, 10, {
        summary: `Use today for recovery. ${comparison}`,
      });
      expect(delivered.summary).toBe('Use today for recovery.');
      expect(delivered.primaryIntent?.type).toBe('VIEW_TOMORROW');
    },
  );
  it('keeps an actionable summary when its numeric rationale is unsupported', async () => {
    const delivered = await deliver(66, 10, {
      summary:
        "Use today for recovery because this week's recorded load is 25% higher than on the same days last week.",
    });
    expect(delivered.summary).toBe('Use today for recovery.');
    expect(delivered.primaryIntent?.type).toBe('VIEW_TOMORROW');
  });
});
