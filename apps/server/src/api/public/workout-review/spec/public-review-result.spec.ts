import { describe, expect, it, jest } from '@jest/globals';
import {
  PublicReviewAiService,
  PublicReviewValidationError,
  readPublicReviewMaxCompletionTokens,
  validatePublicWorkoutReview,
} from '../public-review-result';
import type { PublicReviewEvidence } from '../public-review-artifacts';

const valid = {
  schemaVersion: '1.0',
  language: 'zh',
  sport: 'RUN',
  verdict: '这是一堂节奏稳定的有氧跑。',
  overview:
    '这次训练以稳定的有氧耐力刺激为主，配速和心率整体受控。结合分段趋势来看，后半程没有出现足以说明明显失速的变化。\n\n本次数据适合用来判断单次执行质量，但不能替代连续训练负荷、睡眠和主观恢复信息。',
  workoutType: { label: '有氧耐力', rationale: '平均心率 145 bpm。' },
  keyFindings: [
    {
      title: '强度稳定',
      evidence: '平均心率 145 bpm',
      interpretation: '强度控制平稳',
    },
    {
      title: '时长适中',
      evidence: '计时时长 1800 秒',
      interpretation: '适合作为基础训练',
    },
  ],
  intensityAssessment: '中等',
  recoverySuggestion: '正常补水并观察疲劳。',
  nextWorkoutSuggestion: '下一次安排轻松跑。',
  limitations: ['缺少功率数据'],
  disclaimer: '本工具提供训练数据解读，不构成医疗诊断或个体化医疗建议。',
};

describe('validatePublicWorkoutReview', () => {
  it('accepts the stable result contract and rejects missing or oversized findings', () => {
    expect(validatePublicWorkoutReview(valid, 'zh')).toEqual(valid);
    expect(() =>
      validatePublicWorkoutReview(
        { ...valid, keyFindings: valid.keyFindings.slice(0, 1) },
        'zh',
      ),
    ).toThrow('RESPONSE_INVALID');
    expect(() =>
      validatePublicWorkoutReview({ ...valid, language: 'en' }, 'zh'),
    ).toThrow('RESPONSE_INVALID');
  });

  it('rejects internal field paths, markdown markers and raw metres-per-second units', () => {
    expect(() =>
      validatePublicWorkoutReview(
        { ...valid, overview: '**平均速度 2.65 m/s（summary.avgSpeedMps）**' },
        'zh',
      ),
    ).toThrow('RESPONSE_INVALID');
  });

  it('returns a precise validation reason without exposing the invalid payload', () => {
    try {
      validatePublicWorkoutReview(
        { ...valid, keyFindings: valid.keyFindings.slice(0, 1) },
        'zh',
      );
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(PublicReviewValidationError);
      expect((error as PublicReviewValidationError).reason).toBe(
        'keyFindings必须包含2至5项且每项字段完整',
      );
    }
  });
});

describe('PublicReviewAiService', () => {
  it('leaves the completion cap off until PUBLIC_AI_REVIEW_MAX_COMPLETION_TOKENS is set', () => {
    const previous = process.env.PUBLIC_AI_REVIEW_MAX_COMPLETION_TOKENS;
    delete process.env.PUBLIC_AI_REVIEW_MAX_COMPLETION_TOKENS;
    expect(readPublicReviewMaxCompletionTokens()).toBeUndefined();
    process.env.PUBLIC_AI_REVIEW_MAX_COMPLETION_TOKENS = '500';
    expect(readPublicReviewMaxCompletionTokens()).toBe(1_000);
    process.env.PUBLIC_AI_REVIEW_MAX_COMPLETION_TOKENS = '99999';
    expect(readPublicReviewMaxCompletionTokens()).toBe(12_000);
    if (previous === undefined)
      delete process.env.PUBLIC_AI_REVIEW_MAX_COMPLETION_TOKENS;
    else process.env.PUBLIC_AI_REVIEW_MAX_COMPLETION_TOKENS = previous;
  });

  it('runs the anonymous review through the shared activity-review Agent skill', async () => {
    const runAnonymousCoachTask = jest.fn(
      async (input: { validateResult: (value: unknown) => unknown }) => ({
        result: input.validateResult(valid),
        usage: {
          inputTokens: 300,
          outputTokens: 200,
          cachedInputTokens: 0,
          reported: true,
        },
        provider: 'test-provider',
        model: 'test-model',
      }),
    );
    const computeUsageMetrics = jest.fn(() => ({ weightedTokens: 900 }));
    const service = new PublicReviewAiService(
      { runAnonymousCoachTask } as never,
      { computeUsageMetrics } as never,
    );

    const evidence = {
      schemaVersion: '1.0',
      language: 'zh',
      sport: 'RUN',
      summary: { timerTimeSec: 1800, avgHeartRateBpm: 145 },
      laps: [],
      userContext: {},
      dataAvailability: {
        recordCount: 100,
        hasHeartRate: true,
        hasPower: false,
        hasSpeed: true,
        hasAltitude: false,
        hasRoute: false,
      },
      derived: {},
    } satisfies PublicReviewEvidence;
    const result = await service.generate(evidence, undefined, {
      requestId: 'request-test',
    });

    expect(result).toEqual({ review: valid, weightedTokens: 900 });
    expect(runAnonymousCoachTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'PUBLIC_ACTIVITY_REVIEW',
        activeSkillName: 'activity-review',
        allowedToolNames: [],
        requestRef: 'request-test',
      }),
    );
    const task = runAnonymousCoachTask.mock.calls[0]?.[0] as {
      instructions: string;
      validateResult: (value: unknown) => unknown;
    };
    expect(task.instructions).toContain('# Public tool addendum');
    expect(task.instructions).toContain('coach_task_submit_result');
    expect(() => task.validateResult({ ...valid, language: 'en' })).toThrow(
      PublicReviewValidationError,
    );
  });

  it('preserves failed Agent usage for quota settlement', async () => {
    const error = Object.assign(new Error('RESPONSE_INVALID'), {
      usage: {
        inputTokens: 1_000,
        outputTokens: 6_000,
        cachedInputTokens: 0,
        reported: true,
      },
    });
    const service = new PublicReviewAiService(
      {
        runAnonymousCoachTask: jest.fn(async () => {
          throw error;
        }),
      } as never,
      {
        computeUsageMetrics: jest.fn(() => ({ weightedTokens: 19_000 })),
      } as never,
    );

    await expect(
      service.generate({
        schemaVersion: '1.0',
        language: 'zh',
        sport: 'RUN',
        summary: {},
        laps: [],
        userContext: {},
        dataAvailability: {
          recordCount: 1,
          hasHeartRate: false,
          hasPower: false,
          hasSpeed: false,
          hasAltitude: false,
          hasRoute: false,
        },
        derived: {},
      }),
    ).rejects.toMatchObject({
      message: 'RESPONSE_INVALID',
      weightedTokens: 19_000,
    });
  });
});
