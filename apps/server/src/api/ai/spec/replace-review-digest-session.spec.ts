import { describe, expect, it, jest } from '@jest/globals';
import { AiCoachMessageRole, AiCoachReviewScope, AiCoachSessionType } from '@prisma/client';
import { AiService } from '../ai.service';

describe('AiService.replaceReviewDigestSession', () => {
  it('replaces the review-digest session and assistant message', async () => {
    const upsert = jest.fn(async () => undefined);
    const deleteMany = jest.fn(async () => ({ count: 1 }));
    const create = jest.fn(async () => undefined);
    const prisma = {
      $transaction: jest.fn(
        async (
          fn: (tx: {
            aiCoachSession: { upsert: typeof upsert };
            aiCoachMessage: { deleteMany: typeof deleteMany; create: typeof create };
          }) => Promise<void>,
        ) =>
        fn({
          aiCoachSession: { upsert },
          aiCoachMessage: { deleteMany, create },
        }),
      ),
    };
    const service = Object.create(AiService.prototype) as AiService;
    (service as unknown as { prisma: typeof prisma }).prisma = prisma;

    await service.replaceReviewDigestSession({
      userId: 'user-1',
      digestId: 'digest-9',
      type: 'WEEKLY',
      lang: 'zh',
      title: 'Weekly review',
      markdown: '# hello',
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_id: { userId: 'user-1', id: 'review-digest-digest-9' } },
        create: expect.objectContaining({
          type: AiCoachSessionType.REVIEW,
          reviewScope: AiCoachReviewScope.WEEKLY,
          title: 'Weekly review',
          nextSequence: 2,
        }),
      }),
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', sessionId: 'review-digest-digest-9' },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: AiCoachMessageRole.ASSISTANT,
        content: '# hello',
        sequence: 1,
      }),
    });
  });
});
