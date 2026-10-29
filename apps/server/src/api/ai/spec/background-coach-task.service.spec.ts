import { AiService } from '../ai.service';
import { AiUsageKind } from '@prisma/client';

function installBackgroundPersistence(service: AiService) {
  const projector = {
    run: {
      runId: 'run-1',
      attemptId: 'attempt-1',
      messageId: 'message-1',
    },
    consume: jest.fn(() => []),
    finish: jest.fn(() => []),
  };
  const coachRuns = {
    beginBackground: jest.fn(async () => ({
      handle: {
        projector,
        revision: 0,
        userId: 'user-1',
        sessionId: 'background:task',
        operationId: 'operation-1',
        previousExecutionMs: 0,
      },
    })),
    checkpoint: jest.fn(async () => undefined),
    heartbeat: jest.fn(async () => null),
  };
  const operations = {
    begin: jest.fn(async () => ({
      replay: false,
      operation: { status: 'STARTED' },
    })),
    get: jest.fn(async () => null),
    heartbeat: jest.fn(async () => undefined),
    markDelivered: jest.fn(async () => ({ status: 'RUNNING' })),
    complete: jest.fn(async () => ({ status: 'COMPLETED' })),
    fail: jest.fn(async () => undefined),
  };
  Object.defineProperty(service, 'coachRuns', { value: coachRuns });
  Object.defineProperty(service, 'operations', { value: operations });
  const aiUsage = {
    recordUsageEvent: jest.fn(async () => undefined),
  };
  Object.defineProperty(service, 'aiUsage', { value: aiUsage });
  return { coachRuns, operations, projector, aiUsage };
}

describe('AiService background coach tasks', () => {
  it('uses an isolated background Agent run and aggregates successful usage', async () => {
    const service = Object.create(AiService.prototype) as AiService;
    Object.defineProperty(service, 'getCoachModel', {
      value: () => 'fallback-model',
    });
    const persistence = installBackgroundPersistence(service);
    const coachStream = jest.fn(async (input: Record<string, unknown>) => {
      const task = input.backgroundTask as {
        submitResult: (result: unknown) => Promise<void> | void;
      };
      await task.submitResult({ summary: '保持轻松。' });
      return (async function* () {
        yield {
          type: 'model_usage' as const,
          usage: { inputTokens: 10, outputTokens: 3 },
          model: 'agent-model',
          provider: 'test-provider',
          status: 'SUCCESS' as const,
        };
        yield {
          type: 'model_usage' as const,
          usage: { inputTokens: 4, outputTokens: 2, cachedTokens: 1 },
          model: 'agent-model',
          provider: 'test-provider',
          status: 'SUCCESS' as const,
        };
        yield {
          type: 'result' as const,
          subtype: 'success' as const,
          is_error: false,
          result: '',
        };
      })();
    });
    Object.defineProperty(service, 'coachStream', { value: coachStream });

    const run = await service.runBackgroundCoachTask({
      userId: 'user-1',
      lang: 'zh',
      taskType: 'ATHLETE_CHECK_IN',
      activeSkillName: 'readiness-check',
      instructions: 'Assess today.',
      validateResult: (result) => result as { summary: string },
    });

    expect(run.result).toEqual({ summary: '保持轻松。' });
    expect(run.usage).toMatchObject({
      inputTokens: 14,
      outputTokens: 5,
      cachedInputTokens: 1,
      reported: true,
    });
    expect(run.provider).toBe('test-provider');
    expect(run.model).toBe('agent-model');
    expect(run).toMatchObject({
      runId: 'run-1',
      operationId: 'operation-1',
      replayed: false,
    });
    expect(coachStream).toHaveBeenCalledWith(
      expect.objectContaining({
        executionMode: 'background',
        activeSkillName: 'readiness-check',
        sid: 'background:task',
        operationId: 'operation-1',
      }),
    );
    expect(persistence.coachRuns.checkpoint).toHaveBeenLastCalledWith(
      expect.any(Object),
      'completed',
      undefined,
      expect.objectContaining({ resultType: 'ATHLETE_CHECK_IN' }),
    );
    expect(persistence.operations.complete).toHaveBeenCalledWith(
      'user-1',
      'operation-1',
    );
    expect(persistence.aiUsage.recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        operationId: 'operation-1',
        callKey: 'operation-1:background-aggregate',
        kind: AiUsageKind.OTHER,
        usage: expect.objectContaining({ inputTokens: 14, outputTokens: 5 }),
      }),
    );
    expect(
      persistence.aiUsage.recordUsageEvent.mock.invocationCallOrder[0],
    ).toBeLessThan(persistence.operations.complete.mock.invocationCallOrder[0]);
  });

  it('audits a platform-funded run without admitting or charging a user operation', async () => {
    const service = Object.create(AiService.prototype) as AiService;
    Object.defineProperty(service, 'getCoachModel', {
      value: () => 'fallback-model',
    });
    const persistence = installBackgroundPersistence(service);
    const coachStream = jest.fn(async (input: Record<string, unknown>) => {
      const task = input.backgroundTask as {
        submitResult: (result: unknown) => Promise<void> | void;
      };
      await task.submitResult({ summary: '今天保持轻松。' });
      return (async function* () {
        yield {
          type: 'model_usage' as const,
          usage: { inputTokens: 9, outputTokens: 3 },
          model: 'agent-model',
          provider: 'test-provider',
          status: 'SUCCESS' as const,
        };
        yield {
          type: 'result' as const,
          subtype: 'success' as const,
          is_error: false,
          result: '',
        };
      })();
    });
    Object.defineProperty(service, 'coachStream', { value: coachStream });

    const run = await service.runBackgroundCoachTask({
      userId: 'user-1',
      lang: 'zh',
      taskType: 'TODAY_SUGGESTION',
      activeSkillName: 'readiness-check',
      instructions: 'Assess today.',
      funding: 'PLATFORM',
      model: 'fallback-model',
      usageKind: AiUsageKind.TODAY_SUGGESTION,
      validateResult: (result) => result as { summary: string },
    });

    expect(run).toMatchObject({
      result: { summary: '今天保持轻松。' },
      runId: 'run-1',
      operationId: 'operation-1',
    });
    expect(persistence.operations.begin).not.toHaveBeenCalled();
    expect(persistence.operations.heartbeat).not.toHaveBeenCalled();
    expect(persistence.operations.markDelivered).not.toHaveBeenCalled();
    expect(persistence.operations.complete).not.toHaveBeenCalled();
    expect(persistence.operations.fail).not.toHaveBeenCalled();
    expect(persistence.aiUsage.recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        operationId: null,
        callKey: 'operation-1:background-aggregate',
        kind: AiUsageKind.TODAY_SUGGESTION,
      }),
    );
    expect(persistence.coachRuns.checkpoint).toHaveBeenLastCalledWith(
      expect.any(Object),
      'completed',
      undefined,
      expect.objectContaining({ resultType: 'TODAY_SUGGESTION' }),
    );
  });

  it('replays a completed background run without calling the model or recording a second attempt', async () => {
    const service = Object.create(AiService.prototype) as AiService;
    Object.defineProperty(service, 'getCoachModel', {
      value: () => 'fallback-model',
    });
    const coachStream = jest.fn();
    const coachRuns = {
      beginBackground: jest.fn(async () => ({
        replay: {
          runId: 'run-existing',
          operationId: 'operation-existing',
          result: {
            resultType: 'ATHLETE_CHECK_IN',
            result: { summary: '使用已完成结果。' },
            usage: {
              inputTokens: 8,
              outputTokens: 2,
              cachedInputTokens: 1,
              reported: true,
            },
            provider: 'test-provider',
            model: 'test-model',
          },
        },
      })),
    };
    const operations = {
      get: jest.fn(async () => ({ status: 'COMPLETED' })),
      markDelivered: jest.fn(),
      complete: jest.fn(),
    };
    Object.defineProperty(service, 'coachRuns', { value: coachRuns });
    Object.defineProperty(service, 'operations', { value: operations });
    Object.defineProperty(service, 'coachStream', { value: coachStream });

    const replayed = await service.runBackgroundCoachTask({
      userId: 'user-1',
      lang: 'zh',
      taskType: 'ATHLETE_CHECK_IN',
      activeSkillName: 'readiness-check',
      instructions: 'Assess today.',
      validateResult: (result) => result as { summary: string },
    });

    expect(replayed).toMatchObject({
      result: { summary: '使用已完成结果。' },
      runId: 'run-existing',
      operationId: 'operation-existing',
      replayed: true,
    });
    expect(coachStream).not.toHaveBeenCalled();
    expect(operations.markDelivered).not.toHaveBeenCalled();
  });

  it('keeps an API-owned operation separate when replaying a durable task', async () => {
    const service = Object.create(AiService.prototype) as AiService;
    Object.defineProperty(service, 'getCoachModel', {
      value: () => 'fallback-model',
    });
    const coachRuns = {
      beginBackground: jest.fn(async () => ({
        replay: {
          runId: 'run-existing',
          operationId: 'operation-existing',
          result: {
            resultType: 'ACTIVITY_REVIEW',
            result: { markdown: '已保存的复盘。' },
            usage: { inputTokens: 8, outputTokens: 2 },
            provider: 'test-provider',
            model: 'test-model',
          },
        },
      })),
    };
    const operations = {
      get: jest.fn(),
      markDelivered: jest.fn(),
      complete: jest.fn(),
    };
    Object.defineProperty(service, 'coachRuns', { value: coachRuns });
    Object.defineProperty(service, 'operations', { value: operations });
    Object.defineProperty(service, 'coachStream', { value: jest.fn() });

    const replayed = await service.runBackgroundCoachTask({
      userId: 'user-1',
      lang: 'zh',
      taskType: 'ACTIVITY_REVIEW',
      activeSkillName: 'activity-review',
      instructions: 'Review the supplied activity.',
      callerManagedOperationId: 'operation-from-api',
      validateResult: (result) => result as { markdown: string },
    });

    expect(replayed).toMatchObject({
      runId: 'run-existing',
      operationId: 'operation-from-api',
      replayed: true,
    });
    expect(operations.get).not.toHaveBeenCalled();
    expect(operations.markDelivered).not.toHaveBeenCalled();
    expect(operations.complete).not.toHaveBeenCalled();
  });

  it('runs an anonymous task through the same Agent loop with no account tools', async () => {
    const service = Object.create(AiService.prototype) as AiService;
    Object.defineProperty(service, 'getCoachModel', {
      value: () => 'fallback-model',
    });
    Object.defineProperty(service, 'logger', {
      value: { log: jest.fn() },
    });
    const coachStream = jest.fn(async (input: Record<string, unknown>) => {
      const task = input.backgroundTask as {
        submitResult: (result: unknown) => Promise<void> | void;
      };
      await task.submitResult({ verdict: '轻松跑' });
      return (async function* () {
        yield {
          type: 'model_usage' as const,
          usage: { inputTokens: 12, outputTokens: 4 },
          model: 'public-model',
          provider: 'test-provider',
          status: 'SUCCESS' as const,
        };
        yield {
          type: 'result' as const,
          subtype: 'success' as const,
          is_error: false,
          result: '',
        };
      })();
    });
    Object.defineProperty(service, 'coachStream', { value: coachStream });

    const result = await service.runAnonymousCoachTask({
      lang: 'zh',
      taskType: 'PUBLIC_ACTIVITY_REVIEW',
      activeSkillName: 'activity-review',
      instructions: 'Review only the supplied evidence.',
      allowedToolNames: [],
      requestRef: 'request-1',
      validateResult: (value) => value as { verdict: string },
    });

    expect(result).toMatchObject({
      result: { verdict: '轻松跑' },
      provider: 'test-provider',
      model: 'public-model',
      usage: { inputTokens: 12, outputTokens: 4, reported: true },
    });
    expect(coachStream).toHaveBeenCalledWith(
      expect.objectContaining({
        executionMode: 'background',
        activeSkillName: 'activity-review',
        allowWithoutConsent: true,
        backgroundTask: expect.objectContaining({
          taskType: 'PUBLIC_ACTIVITY_REVIEW',
          allowedToolNames: [],
        }),
      }),
    );
  });

  it('routes today suggestion through the background readiness task', async () => {
    const service = Object.create(AiService.prototype) as AiService;
    const runBackgroundCoachTask = jest.fn(
      async (input: { validateResult: (value: unknown) => unknown }) => ({
        result: input.validateResult({
          summary: '今天进行 30 分钟轻松活动。',
          tags: ['轻松活动', '观察状态'],
          coachDecisionHandling: [],
        }),
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cachedInputTokens: 0,
          reported: true,
        },
        provider: 'test-provider',
        model: 'test-model',
      }),
    );
    Object.defineProperty(service, 'runBackgroundCoachTask', {
      value: runBackgroundCoachTask,
    });

    const result = await service.generateTrainingAdviceSnippet({
      userId: 'user-1',
      lang: 'zh',
      context: { groundingRules: { hasActivePlan: false } },
      taskType: 'TODAY_SUGGESTION',
      usageKind: AiUsageKind.TODAY_SUGGESTION,
      triggerType: 'HOME_TODAY_SUGGESTION',
      triggerRef: '2026-10-26:zh',
    });

    expect(result.summary).toBe('今天进行 30 分钟轻松活动。');
    expect(runBackgroundCoachTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'TODAY_SUGGESTION',
        activeSkillName: 'readiness-check',
        usageKind: AiUsageKind.TODAY_SUGGESTION,
        triggerType: 'HOME_TODAY_SUGGESTION',
        triggerRef: '2026-10-26:zh',
      }),
    );
  });

  it('runs a queued activity review through the durable activity-review skill', async () => {
    const service = Object.create(AiService.prototype) as AiService;
    const prepared = {
      outcome: 'READY' as const,
      review: {
        id: 'review-1',
        activityId: 42,
        userId: 'user-1',
        trigger: 'IMPORT' as const,
      },
      lang: 'zh',
      unifiedInput: {
        sport_context: {
          family: 'RUNNING',
          sportCode: 'RUN',
          allowedMetricDomains: [],
          coachingFocus: [],
          forbiddenInferences: [],
        },
        temporal_context: {
          activity_local_date: '2026-07-29',
          activity_timezone: 'Asia/Shanghai',
          historical_load_as_of: '2026-07-29',
          historical_load_window_days: 14,
        },
      },
      evidenceSnapshot: {
        version: 'evidence-v1',
        unifiedInput: {},
        lang: 'zh',
      },
      evidenceHash: 'evidence-hash',
    };
    const persistGeneratedReview = jest.fn(async () => ({
      outcome: 'SUCCEEDED' as const,
      activityId: 42,
      weightedTokens: 321,
    }));
    Object.defineProperty(service, 'activityAiReviewService', {
      value: {
        prepareGeneration: jest.fn(async () => prepared),
        persistGeneratedReview,
      },
    });
    Object.defineProperty(service, 'logger', {
      value: { log: jest.fn() },
    });
    Object.defineProperty(service, 'getCoachModel', {
      value: () => 'fallback-model',
    });
    const runBackgroundCoachTask = jest.fn(
      async (input: { validateResult: (value: unknown) => unknown }) => ({
        result: input.validateResult({ markdown: '### 结论\n训练稳定。' }),
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cachedInputTokens: 0,
          reported: true,
        },
        provider: 'test-provider',
        model: 'test-model',
        runId: 'run-1',
        operationId: 'operation-1',
        replayed: false,
      }),
    );
    Object.defineProperty(service, 'runBackgroundCoachTask', {
      value: runBackgroundCoachTask,
    });

    await expect(
      service.processQueuedActivityAiReview('review-1'),
    ).resolves.toMatchObject({ outcome: 'SUCCEEDED', activityId: 42 });
    expect(runBackgroundCoachTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'ACTIVITY_REVIEW',
        activeSkillName: 'activity-review',
        usageKind: AiUsageKind.ACTIVITY_ANALYSIS,
        allowedToolNames: [],
        triggerType: 'ACTIVITY_REVIEW_IMPORT',
        triggerRef: 'review-1',
      }),
    );
    const activityReviewTask = runBackgroundCoachTask.mock.calls[0][0] as {
      instructions: string;
    };
    expect(activityReviewTask.instructions).toContain(
      '\"historical_load_as_of\":\"2026-07-29\"',
    );
    expect(activityReviewTask.instructions).toContain(
      '\"recency\":\"historical\"',
    );
    expect(activityReviewTask.instructions).toContain('activity_age_days');
    expect(persistGeneratedReview).toHaveBeenCalledWith(
      expect.objectContaining({
        prepared,
        markdown: '### 结论\n训练稳定。',
        operationId: 'operation-1',
      }),
    );
  });

  it('keeps coverage tools in the readiness Agent loop', async () => {
    const service = Object.create(AiService.prototype) as AiService;
    const runBackgroundCoachTask = jest.fn(
      async (input: { validateResult: (value: unknown) => unknown }) => ({
        result: input.validateResult({
          summary: '可导入 FIT 文件，或连接 Intervals.icu。',
          tags: ['数据接入'],
          coachDecisionHandling: [],
        }),
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cachedInputTokens: 0,
          reported: true,
        },
        provider: 'test-provider',
        model: 'test-model',
      }),
    );
    Object.defineProperty(service, 'runBackgroundCoachTask', {
      value: runBackgroundCoachTask,
    });

    await service.generateTrainingAdviceSnippet({
      userId: 'user-1',
      lang: 'zh',
      context: {
        activityEvidence: {
          kind: 'activity_evidence',
          coverageInspection: {
            required: true,
            reasons: ['NEVER_RECORDED_ACTIVITY'],
          },
        },
        padding: 'x'.repeat(8_100),
        groundingRules: { tailRule: 'TAIL_GROUNDING_RULE_MUST_SURVIVE' },
      },
    });

    const task = runBackgroundCoachTask.mock.calls[0][0] as {
      activeSkillName: string;
      allowedToolNames?: string[];
      requiredToolNames?: string[];
      instructions: string;
    };
    expect(task.activeSkillName).toBe('readiness-check');
    expect(task.allowedToolNames).toBeUndefined();
    expect(task.requiredToolNames).toEqual(['training.data_coverage']);
    expect(task.instructions).toContain(
      'call training.data_coverage before submitting the result',
    );
    expect(task.instructions).toContain(
      'Never generalize a supported provider into a generic watch',
    );
    expect(task.instructions).toContain('TAIL_GROUNDING_RULE_MUST_SURVIVE');
  });

  it.each([
    ['daily', 'plan-day-review', AiUsageKind.REVIEW_DAILY],
    ['weekly', 'plan-week-review', AiUsageKind.REVIEW_WEEKLY],
    ['monthly', 'plan-cycle-review', AiUsageKind.REVIEW_MONTHLY],
  ] as const)(
    'routes %s plan judgment through %s',
    async (scale, activeSkillName, usageKind) => {
      const service = Object.create(AiService.prototype) as AiService;
      const runBackgroundCoachTask = jest.fn(
        async (input: { validateResult: (value: unknown) => unknown }) => ({
          result: input.validateResult({
            decision: 'KEEP',
            presentation: 'GUIDANCE',
            action: null,
            targetWorkoutId: null,
            sourceWorkoutId: null,
            targetDate: null,
            rationale: '当前计划可继续执行。',
            confidence: 0.7,
            evidenceCodes: ['PLAN_ON_TRACK'],
            adjustmentIntent: null,
          }),
          usage: {
            inputTokens: 12,
            outputTokens: 4,
            cachedInputTokens: 0,
            reported: true,
          },
          provider: 'test-provider',
          model: 'test-model',
        }),
      );
      Object.defineProperty(service, 'runBackgroundCoachTask', {
        value: runBackgroundCoachTask,
      });

      const result = await service.generatePlanReviewJudgment({
        userId: 'user-1',
        lang: 'zh',
        scale,
        context: { meta: { athleteToday: '2026-10-26' } },
      });

      expect(result.decision).toBe('KEEP');
      expect(result.presentation).toBe('GUIDANCE');
      expect(runBackgroundCoachTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: `PLAN_${scale.toUpperCase()}_REVIEW`,
          activeSkillName,
          usageKind,
        }),
      );
    },
  );
});
