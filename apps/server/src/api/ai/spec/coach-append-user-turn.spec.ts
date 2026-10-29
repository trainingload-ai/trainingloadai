import { describe, expect, it, jest } from '@jest/globals';
import { AiCoachMessageRole } from '@prisma/client';
import { AiService } from '../ai.service';
import { buildStoredCoachUiMessageEnvelope } from '../core/coach-history-messages';

type TailRow = {
  id: string;
  role: AiCoachMessageRole;
  content: string;
  message: unknown;
};

const session = { user: { id: 'user-1' } } as Parameters<
  AiService['coachAppendUserTurn']
>[0]['session'];

function userRow(id: string, content: string): TailRow {
  return {
    id,
    role: AiCoachMessageRole.USER,
    content,
    message: buildStoredCoachUiMessageEnvelope({
      role: 'user',
      content,
      message: { content: [{ type: 'text', text: content }] },
    }),
  };
}

function assistantRow(id: string, content: string): TailRow {
  return {
    id,
    role: AiCoachMessageRole.ASSISTANT,
    content,
    message: buildStoredCoachUiMessageEnvelope({
      role: 'assistant',
      content,
      message: { content: [{ type: 'text', text: content }] },
    }),
  };
}

function failureRow(id: string): TailRow {
  const content = '模型暂时无法响应，请尝试切换模型后重试。';
  return {
    id,
    role: AiCoachMessageRole.ASSISTANT,
    content,
    message: buildStoredCoachUiMessageEnvelope({
      role: 'assistant',
      content,
      message: { content: [{ type: 'text', text: content }] },
      turnError: { code: 'model_unavailable' },
    }),
  };
}

/** `tail` is newest-first, like `orderBy: { sequence: 'desc' }`. */
function setup(tail: TailRow[]) {
  const upsert = jest.fn(async () => undefined);
  const findMany = jest.fn(async () => tail);
  const create = jest.fn(async (_args: unknown) => ({ id: 'created-1' }));
  const deleteMany = jest.fn(async (_args: unknown) => ({ count: 0 }));
  const findUnique = jest.fn(async () => ({ title: '你好' }));
  const update = jest.fn(async () => ({ nextSequence: 2 }));
  const tx = {
    aiCoachSession: { upsert, findUnique, update },
    aiCoachMessage: { findMany, create, deleteMany },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const service = Object.create(AiService.prototype) as AiService;
  Object.assign(service, {
    prisma,
    i18n: { t: (key: string) => key },
    logger: { warn: jest.fn(), debug: jest.fn(), log: jest.fn() },
  });
  return { service, create, findMany, deleteMany };
}

describe('AiService.coachAppendUserTurn', () => {
  it('skips inserting a duplicate trailing USER row on the same sid retry', async () => {
    const { service, create, findMany, deleteMany } = setup([
      userRow('u1', '你好'),
    ]);

    await expect(
      service.coachAppendUserTurn({
        session,
        sid: 'session-1',
        lang: 'zh',
        content: '你好',
      }),
    ).resolves.toBe('session-1');

    expect(findMany).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('reuses the USER row behind a persisted failure and drops the superseded failure on retry', async () => {
    const { service, create, deleteMany } = setup([
      failureRow('f2'),
      failureRow('f1'),
      userRow('u1', '你好'),
    ]);

    await service.coachAppendUserTurn({
      session,
      sid: 'session-1',
      lang: 'zh',
      content: '你好',
    });

    expect(create).not.toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', id: { in: ['f2', 'f1'] } },
    });
  });

  it('keeps the failure visible and appends a new USER row for a different question', async () => {
    const { service, create, deleteMany } = setup([
      failureRow('f1'),
      userRow('u1', '你好'),
    ]);

    await service.coachAppendUserTurn({
      session,
      sid: 'session-1',
      lang: 'zh',
      content: '今天怎么练？',
    });

    expect(deleteMany).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: AiCoachMessageRole.USER,
        content: '今天怎么练？',
      }),
    });
  });

  it('does not treat a normal assistant reply as a failure to skip', async () => {
    const { service, create } = setup([
      assistantRow('a1', '你好，我是你的教练。'),
      userRow('u1', '你好'),
    ]);

    await service.coachAppendUserTurn({
      session,
      sid: 'session-1',
      lang: 'zh',
      content: '你好',
    });

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('inserts a USER row when the session has no trailing matching message', async () => {
    const { service, create } = setup([]);

    await expect(
      service.coachAppendUserTurn({
        session,
        sid: 'session-1',
        lang: 'zh',
        content: '你好',
      }),
    ).resolves.toBe('session-1');

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: AiCoachMessageRole.USER,
        content: '你好',
        sessionId: 'session-1',
      }),
    });
  });
});

describe('AiService.assertCoachSkipAppendMatchesPrompt', () => {
  it('looks past persisted failure rows to the real last USER turn', async () => {
    const { service } = setup([failureRow('f1'), userRow('u1', '你好')]);
    await expect(
      service.assertCoachSkipAppendMatchesPrompt({
        session,
        sid: 'session-1',
        prompt: '你好',
      }),
    ).resolves.toBeUndefined();
  });

  it('still rejects when the last real turn is not the prompt', async () => {
    const { service } = setup([
      assistantRow('a1', '回复'),
      userRow('u1', '你好'),
    ]);
    await expect(
      service.assertCoachSkipAppendMatchesPrompt({
        session,
        sid: 'session-1',
        prompt: '你好',
      }),
    ).rejects.toThrow();
  });
});

describe('AiService.coachAppendTurnFailure', () => {
  it('stores a visible, non-replayable assistant row carrying the failure part', async () => {
    const { service, create } = setup([]);
    (
      service as unknown as { allocateCoachMessageSequence: unknown }
    ).allocateCoachMessageSequence = jest.fn(async () => 7);

    await expect(
      service.coachAppendTurnFailure({
        session,
        sid: 'session-1',
        lang: 'zh',
        content: '模型暂时无法响应，请尝试切换模型后重试。',
        code: 'model_unavailable',
      }),
    ).resolves.toBe('created-1');

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: AiCoachMessageRole.ASSISTANT,
        content: '模型暂时无法响应，请尝试切换模型后重试。',
        sequence: 7,
        message: expect.objectContaining({
          providerReplay: false,
          parts: [
            { type: 'text', text: '模型暂时无法响应，请尝试切换模型后重试。' },
            {
              type: 'data-coach-turn-error',
              id: 'coach-turn-error',
              data: {
                code: 'model_unavailable',
                message: '模型暂时无法响应，请尝试切换模型后重试。',
              },
            },
          ],
        }),
      }),
    });
  });
});
