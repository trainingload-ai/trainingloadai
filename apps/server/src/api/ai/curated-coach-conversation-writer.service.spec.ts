import { describe, expect, it, jest } from '@jest/globals';
import { CuratedCoachConversationWriterService } from './curated-coach-conversation-writer.service';
import { isStoredCoachTurnFailureRow } from './core/coach-history-messages';

describe('CuratedCoachConversationWriterService', () => {
  it('replaces only namespaced Demo conversations in one transaction', async () => {
    const calls: unknown[] = [];
    const tx = {
      aiCoachSession: {
        deleteMany: jest.fn(async (input) => {
          calls.push(['delete', input]);
          return { count: 0 };
        }),
        create: jest.fn(async (input) => {
          calls.push(['session', input]);
          return input;
        }),
      },
      aiCoachMessage: {
        create: jest.fn(async (input) => {
          calls.push(['message', input]);
          return input;
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    };
    const result = await new CuratedCoachConversationWriterService(
      prisma as never,
    ).replacePublicDemoConversations({
      userId: 'demo-user',
      conversations: [
        {
          id: 'demo-recovery',
          lang: 'zh',
          title: { zh: '恢复建议', en: 'Recovery advice' },
          occurredAt: new Date('2026-10-16T08:00:00.000Z'),
          messages: [
            {
              role: 'USER',
              content: { zh: '今天练吗？', en: 'Should I train today?' },
            },
            {
              role: 'ASSISTANT',
              content: { zh: '今天恢复。', en: 'Recover today.' },
            },
          ],
        },
      ],
    });

    expect(result).toEqual({ sessionCount: 1, messageCount: 2 });
    expect(tx.aiCoachSession.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'demo-user', id: { startsWith: 'demo-' } },
    });
    expect(tx.aiCoachMessage.create).toHaveBeenCalledTimes(2);
    const firstMessageCall = tx.aiCoachMessage.create.mock.calls[0]?.[0] as {
      data: { message: unknown };
    };
    expect(firstMessageCall.data.message).toMatchObject({
      kind: 'ui_message',
      version: 1,
      role: 'user',
    });
    expect(firstMessageCall.data.message).not.toHaveProperty('providerReplay');
    const assistantMessageCall = tx.aiCoachMessage.create.mock
      .calls[1]?.[0] as {
      data: { message: unknown };
    };
    expect(
      isStoredCoachTurnFailureRow({
        role: 'ASSISTANT',
        message: assistantMessageCall.data.message,
      }),
    ).toBe(false);
    expect(calls.map((call) => (call as unknown[])[0])).toEqual([
      'delete',
      'session',
      'message',
      'message',
    ]);
  });

  it('rejects conversations outside the Demo namespace', async () => {
    const service = new CuratedCoachConversationWriterService({} as never);
    await expect(
      service.replacePublicDemoConversations({
        userId: 'demo-user',
        conversations: [
          {
            id: 'real-session',
            lang: 'zh',
            title: { zh: '错误', en: 'bad' },
            occurredAt: new Date(),
            messages: [
              { role: 'USER', content: { zh: 'x', en: 'x' } },
              { role: 'ASSISTANT', content: { zh: 'y', en: 'y' } },
            ],
          },
        ],
      }),
    ).rejects.toThrow('invalid curated Demo conversation id');
  });
});
