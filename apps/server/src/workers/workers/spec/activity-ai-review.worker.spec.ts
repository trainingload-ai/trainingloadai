import { describe, expect, it, jest } from '@jest/globals';
import { ActivityAiReviewWorkerService } from '../activity-ai-review.worker';
import { aiOperationError } from '@/api/ai/ai-operation.error';

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
  it.each([
    'AI_OPERATION_IN_PROGRESS',
    'AI_OPERATION_COMPLETION_PENDING',
  ] as const)(
    'defers %s without consuming attempts or replacing a newer result',
    async (code) => {
      const now = new Date('2026-11-11T13:00:00Z');
      jest.useFakeTimers().setSystemTime(now);
      try {
        const updateMany = jest.fn(async (_input: unknown) => ({ count: 1 }));
        const service = new ActivityAiReviewWorkerService(
          { activityAiReview: { updateMany } } as never,
          { get: () => 3 } as never,
          {
            processQueuedActivityAiReview: async () => {
              throw aiOperationError(code);
            },
          } as never,
        );
        const result = await (service as any).executeJob({
          id: 'review-1',
          activityId: 42,
          userId: 'user-1',
          attempts: 2,
          maxAttempts: 3,
          lockedAt: now,
        });
        expect(result.outcome).toBe('DEFERRED');
        expect(updateMany).toHaveBeenCalledTimes(1);
        expect(updateMany).toHaveBeenCalledWith({
          where: { id: 'review-1', status: 'RUNNING', lockedAt: now },
          data: {
            status: 'PENDING',
            availableAt: new Date(now.getTime() + 15_000),
            lockedAt: null,
            failedAt: null,
            finishedAt: null,
            errorCode: null,
            errorMessage: null,
          },
        });
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it.each([
    [0, 'FAILED'],
    [2, 'DEAD'],
  ] as const)(
    'atomically records attempt %s with its retry deadline and terminal state',
    async (attempts, status) => {
      const updateMany = jest.fn(async (_input: unknown) => ({ count: 1 }));
      const service = new ActivityAiReviewWorkerService(
        { activityAiReview: { updateMany } } as never,
        { get: () => 3 } as never,
        {
          processQueuedActivityAiReview: async () => {
            throw new Error('provider unavailable');
          },
        } as never,
      );
      const before = Date.now();
      await (service as any).executeJob({
        id: 'review-1',
        activityId: 42,
        userId: 'user-1',
        attempts,
        maxAttempts: 3,
      });
      expect(updateMany).toHaveBeenCalledTimes(1);
      const write = updateMany.mock.calls[0][0] as any;
      expect(write.data.status).toBe(status);
      expect(write.data.attempts).toBe(attempts + 1);
      expect(write.data.availableAt.getTime()).toBeGreaterThan(before + 60_000);
      expect(write.where.status).toBe('RUNNING');
    },
  );

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
