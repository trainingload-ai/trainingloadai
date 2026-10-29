import { describe, expect, it, jest } from '@jest/globals';
import { ActivityAiReviewWorkerService } from '../activity-ai-review.worker';

type ActivityAiReviewInternals = {
  logger: {
    log: ReturnType<typeof jest.fn>;
    warn: ReturnType<typeof jest.fn>;
    error: ReturnType<typeof jest.fn>;
  };
  orchestrateClaimedJob(
    job: { id: string; activityId: number; userId: string },
    progress: { sequence: number; batchPosition: number; batchTotal: number },
  ): Promise<unknown>;
};

jest.mock('@/api/ai/ai.service', () => ({
  AiService: class AiService {},
}));

describe('ActivityAiReviewWorkerService', () => {
  it('logs the drain sequence, batch position, and queue remainder', async () => {
    const queueCounts = [4, 1, 3, 0];
    let countIndex = 0;
    const service = new ActivityAiReviewWorkerService(
      {
        activityAiReview: {
          count: jest.fn(async () => queueCounts[countIndex++] ?? 0),
        },
      } as never,
      {} as never,
      {
        processQueuedActivityAiReview: jest.fn(async () => ({
          outcome: 'SUCCEEDED' as const,
          activityId: 1355,
          weightedTokens: 2506,
        })),
      } as never,
    );
    const log = jest.fn();
    (service as unknown as ActivityAiReviewInternals).logger = {
      log,
      warn: jest.fn(),
      error: jest.fn(),
    };

    await (
      service as unknown as ActivityAiReviewInternals
    ).orchestrateClaimedJob(
      {
        id: 'review-1',
        activityId: 1355,
        userId: 'user-1',
      },
      {
        sequence: 7,
        batchPosition: 2,
        batchTotal: 5,
      },
    );

    expect(log).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        '开始 本轮第=7 当前批次=2/5 队列剩余=5（等待=4，处理中=1，含当前任务）',
      ),
    );
    expect(log).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        '完成 本轮第=7 当前批次=2/5 队列剩余=3（等待=3，处理中=0）',
      ),
    );
    expect(log).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('结果=SUCCEEDED 加权令牌=2506'),
    );
  });

  it('does not fail consumption when queue progress cannot be read', async () => {
    const processQueuedActivityAiReview = jest.fn(async () => undefined);
    const service = new ActivityAiReviewWorkerService(
      {
        activityAiReview: {
          count: jest.fn(async () => {
            throw new Error('database metrics unavailable');
          }),
        },
      } as never,
      {} as never,
      { processQueuedActivityAiReview } as never,
    );
    const log = jest.fn();
    const warn = jest.fn();
    (service as unknown as ActivityAiReviewInternals).logger = {
      log,
      warn,
      error: jest.fn(),
    };

    await expect(
      (service as unknown as ActivityAiReviewInternals).orchestrateClaimedJob(
        {
          id: 'review-2',
          activityId: 1356,
          userId: 'user-1',
        },
        {
          sequence: 8,
          batchPosition: 3,
          batchTotal: 5,
        },
      ),
    ).resolves.toBeUndefined();

    expect(processQueuedActivityAiReview).toHaveBeenCalledWith('review-2');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('队列剩余=未知'));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('database metrics unavailable'),
    );
  });
});
