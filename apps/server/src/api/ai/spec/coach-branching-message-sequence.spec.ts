import { describe, expect, it, jest } from '@jest/globals';
import { CoachBranchingService } from '../coach-branching.service';

describe('CoachBranchingService message sequence allocation', () => {
  it('allocates a branch source message from the shared thread head', async () => {
    const thread = {
      id: 'thread-1',
      contextId: 'context-1',
      headMsgSeq: 7,
    };
    const createdBranch = {
      id: 'branch-2',
      threadId: thread.id,
      contextId: 'context-1',
      status: 'OPEN',
      baseEventSeq: 12,
      baseCommitId: null,
      openedBy: 'user-1',
      openReason: 'conversation_adjustment',
      headMsgSeq: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      closedAt: null,
    };
    const coachThreadUpdate = jest.fn(async () => ({ headMsgSeq: 8 }));
    const coachBranchMessageCreate = jest.fn(async (args: unknown) => args);
    const coachBranchUpdate = jest.fn(async () => ({
      ...createdBranch,
      headMsgSeq: 8,
    }));
    const tx = {
      coachThread: {
        findFirst: jest.fn(async () => thread),
        update: coachThreadUpdate,
      },
      coachCommit: { findFirst: jest.fn(async () => null) },
      coachBranch: {
        create: jest.fn(async () => createdBranch),
        update: coachBranchUpdate,
      },
      coachBranchMessage: { create: coachBranchMessageCreate },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const planQuery = {
      findContextById: jest.fn(async () => ({
        id: 'context-1',
        userId: 'user-1',
        status: 'ACTIVE',
        headEventSeq: 12,
      })),
    };
    const service = new CoachBranchingService(
      prisma as never,
      {} as never,
      {} as never,
      planQuery as never,
      {} as never,
      {} as never,
    );

    const result = await service.openBranch({
      userId: 'user-1',
      contextId: 'context-1',
      openReason: 'conversation_adjustment',
      sourceNode: { page: 'conversation_adjustment' },
    });

    expect(coachThreadUpdate).toHaveBeenCalledWith({
      where: { id: 'thread-1' },
      data: { headMsgSeq: { increment: 1 } },
      select: { headMsgSeq: true },
    });
    expect(coachBranchMessageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        threadId: 'thread-1',
        branchId: 'branch-2',
        msgSeq: 8,
        role: 'system',
      }),
    });
    expect(coachBranchUpdate).toHaveBeenCalledWith({
      where: { id: 'branch-2' },
      data: { headMsgSeq: 8 },
    });
    expect(result.branch.headMsgSeq).toBe(8);
  });
});
