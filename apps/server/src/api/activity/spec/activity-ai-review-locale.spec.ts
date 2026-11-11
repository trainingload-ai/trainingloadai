import { describe, expect, it, jest } from '@jest/globals';
import { ActivityAiReviewService } from '../activity-ai-review.service';
import {
  ACTIVITY_AI_REVIEW_PROMPT_VERSION,
  ACTIVITY_COACH_EVIDENCE_VERSION,
} from '@/api/ai/activity-coach.constants';

jest.mock('@/api/ai/core/coach-upstream.adapter', () => ({
  createCoachClient: () => ({}),
  getCoachModel: () => 'test-model',
  getCoachUpstreamProvider: () => 'test-provider',
}));

describe('ActivityAiReviewService locale lookup', () => {
  it.each(['RUNNING', 'FAILED', 'DEAD'])(
    'preserves the existing %s execution for unchanged import evidence',
    async (status) => {
      const existing = {
        id: 'review-1',
        status,
        evidenceHash: 'same',
        promptVersion: ACTIVITY_AI_REVIEW_PROMPT_VERSION,
        evidenceVersion: ACTIVITY_COACH_EVIDENCE_VERSION,
      };
      const update = jest.fn();
      const create = jest.fn();
      const service = Object.create(
        ActivityAiReviewService.prototype,
      ) as ActivityAiReviewService;
      Object.defineProperties(service, {
        prisma: {
          value: {
            activityAiReview: {
              findFirst: async () => existing,
              update,
              create,
            },
          },
        },
        buildCoachEvidenceBundle: {
          value: async () => ({ evidenceSnapshot: {}, evidenceHash: 'same' }),
        },
      });
      await expect(
        service.enqueueForActivity({
          activityId: 42,
          userId: 'user-1',
          trigger: 'IMPORT',
        }),
      ).resolves.toEqual({ id: 'review-1', status });
      expect(update).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('creates an inline review with a lease so workers cannot claim the same generation', async () => {
    const create = jest.fn(async (_args: unknown) => ({
      id: 'review-1',
      status: 'RUNNING',
    }));
    const service = Object.create(
      ActivityAiReviewService.prototype,
    ) as ActivityAiReviewService;
    Object.defineProperties(service, {
      prisma: {
        value: { activityAiReview: { findFirst: async () => null, create } },
      },
      buildCoachEvidenceBundle: {
        value: async () => ({ evidenceSnapshot: {}, evidenceHash: 'same' }),
      },
    });
    await service.enqueueForActivity({
      activityId: 42,
      userId: 'user-1',
      trigger: 'MANUAL',
      runInline: true,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RUNNING',
          lockedAt: expect.any(Date),
          availableAt: expect.any(Date),
        }),
      }),
    );
  });

  it.each(['en', 'de', 'fr', 'es', 'pt-BR', 'it', 'ko', 'ja', 'zh', 'zh-hant'])(
    'reads the review stored for %s',
    async (language) => {
      const findFirstReview = jest.fn(async () => null);
      const prisma = {
        activity: {
          findFirst: jest.fn(async () => ({ id: 42 })),
        },
        activityAiReview: {
          findFirst: findFirstReview,
        },
      };
      const service = new ActivityAiReviewService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await service.getAiReviewForActivityHash({
        userId: 'user-1',
        activityHashId: 'activity-1',
        language,
      });

      expect(findFirstReview).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            activityId: 42,
            userId: 'user-1',
            language,
          },
        }),
      );
    },
  );

  it('persists exactly one usage event for one manually delivered analysis', async () => {
    const recordUsageEvent = jest.fn(async () => undefined);
    const tx = {
      activityAiReview: {
        create: jest.fn(async () => ({ id: 'review-1' })),
      },
    };
    const prisma = {
      activityAiReview: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const aiUsage = {
      computeUsageMetrics: jest.fn(() => ({
        inputTokens: 1_000,
        outputTokens: 100,
        cachedInputTokens: 0,
        billableInputTokens: 1_000,
        weightedTokens: 1_300,
        costMicroYuan: BigInt(1),
      })),
      recordUsageEvent,
    };
    const service = new ActivityAiReviewService(
      prisma as never,
      aiUsage as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.persistCoachMarkdownFromAnalysis({
      activityId: 42,
      userId: 'user-1',
      operationId: 'operation-1',
      lang: 'zh',
      markdown: '本次训练执行稳定。',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      purpose: 'REASONING',
      unifiedInput: {} as never,
      evidenceHash: 'evidence-1',
      usage: {
        inputTokens: 1_000,
        outputTokens: 100,
        cachedInputTokens: 0,
      },
    });

    expect(recordUsageEvent).toHaveBeenCalledTimes(1);
    expect(recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'operation-1',
        callKey: 'operation-1:activity-analysis:0',
        purpose: 'REASONING',
      }),
    );
  });

  it('keeps the recoverable activity result when usage persistence fails', async () => {
    const tx = {
      activityAiReview: {
        create: jest.fn(async () => ({ id: 'review-1' })),
      },
    };
    const prisma = {
      activityAiReview: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const aiUsage = {
      computeUsageMetrics: jest.fn(() => ({
        inputTokens: 1_000,
        outputTokens: 100,
        cachedInputTokens: 0,
        billableInputTokens: 1_000,
        weightedTokens: 1_300,
        costMicroYuan: BigInt(1),
      })),
      recordUsageEvent: jest.fn(async () => {
        throw new Error('usage database unavailable');
      }),
    };
    const service = new ActivityAiReviewService(
      prisma as never,
      aiUsage as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.persistCoachMarkdownFromAnalysis({
        activityId: 42,
        userId: 'user-1',
        operationId: 'operation-1',
        lang: 'zh',
        markdown: '本次训练执行稳定。',
        provider: 'deepseek',
        model: 'deepseek-v4-pro',
        purpose: 'REASONING',
        unifiedInput: {} as never,
        evidenceHash: 'evidence-1',
        usage: {
          inputTokens: 1_000,
          outputTokens: 100,
          cachedInputTokens: 0,
        },
      }),
    ).resolves.toEqual({ id: 'review-1' });
    expect(tx.activityAiReview.create).toHaveBeenCalledTimes(1);
  });
});
