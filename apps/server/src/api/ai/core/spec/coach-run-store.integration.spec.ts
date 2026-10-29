import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '@/prisma/prisma.service';
import {
  CoachRunStore,
  CoachRunCancelledError,
  type CoachRunHandle,
} from '../../coach-run-store.service';
import { createAiSdkCoachTools } from '../ai-sdk-tool-adapter';
import type { AiToolContext } from '../tool.types';
import {
  buildHistoryMessages,
  sanitizeStoredCoachMessageForClient,
} from '../coach-history-messages';

/** A disposable real PostgreSQL engine. NEVER loads .env or connects to application databases. */
describe('Coach run transactions / PostgreSQL constraints', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;
  let store: CoachRunStore;
  beforeAll(async () => {
    database = fork(resolve(__dirname, 'coach-run-postgres.mjs'), [], {
      execArgv: [],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const address = await new Promise<string>((resolveAddress, reject) => {
      database.once('message', (value: { address: string }) =>
        resolveAddress(value.address),
      );
      database.once('error', reject);
      database.once('exit', (code) =>
        reject(new Error(`Test database exited: ${code}`)),
      );
    });
    prisma = new PrismaClient({
      datasourceUrl: `postgresql://postgres:postgres@${address}/postgres?connection_limit=1&sslmode=disable`,
    });
    await prisma.$connect();
    store = new CoachRunStore(prisma as PrismaService);
  }, 30_000);
  afterAll(async () => {
    await prisma?.$disconnect();
    if (database && database.exitCode === null)
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
  });
  beforeEach(async () => {
    // A constraint violation can close PGlite Socket's current protocol connection;
    // reconnect between cases while keeping the same in-memory database.
    await prisma.$disconnect();
    await prisma.$connect();
    await prisma.aiCoachSession.deleteMany();
    await prisma.$executeRawUnsafe('DELETE FROM t_user');
    await prisma.$executeRawUnsafe(
      "INSERT INTO t_user(id) VALUES ('athlete'),('intruder')",
    );
  });

  const startArgs = () => ({
    userId: 'athlete',
    sid: 'session',
    branchId: null,
    lang: 'zh',
    prompt: '训练建议',
    message: { content: [{ type: 'text' as const, text: '训练建议' }] },
    operationId: randomUUID(),
    command: { kind: 'start' as const, requestId: randomUUID() },
  });
  const question = {
    questions: [
      {
        id: 'goal',
        header: '目标',
        question: '本次目标？',
        options: [
          { value: 'race', label: '比赛', description: '准备比赛' },
          { value: 'health', label: '健康', description: '保持健康' },
        ],
      },
    ],
  };

  it('rolls back the user message when extraction job creation fails in the same transaction', async () => {
    const transactionalStore = new CoachRunStore(
      prisma as PrismaService,
      {
        enqueueEligibleMessage: async ({
          tx,
          userId,
          sessionId,
          sourceMessageId,
        }) => {
          await tx.aiCoachMemoryExtractionJob.create({
            data: {
              userId,
              sessionId,
              sourceMessageId,
              policyVersion: 'test-transaction',
            },
          });
          throw new Error('forced enqueue failure');
        },
      } as never,
    );
    await expect(transactionalStore.begin(startArgs())).rejects.toThrow(
      'forced enqueue failure',
    );
    expect(await prisma.aiCoachMessage.count()).toBe(0);
    expect(await prisma.aiCoachMemoryExtractionJob.count()).toBe(0);
  });

  it('persists a hidden background run and replays its structured result without a second attempt', async () => {
    const args = {
      userId: 'athlete',
      taskKind: 'ATHLETE_CHECK_IN',
      lang: 'zh',
      instructions: 'Inspect authoritative facts and submit one result.',
      dedupeKey: 'today:2026-10-26:facts-v1',
      inputHash: 'input-hash-v1',
      operationId: randomUUID(),
      triggerType: 'HOME_TODAY_SUGGESTION',
      triggerRef: '2026-10-26',
    };
    const started = await store.beginBackground(args);
    expect(started.replay).toBeUndefined();
    const handle = started.handle!;
    handle.projector.consume({
      type: 'activity',
      activity: {
        key: 'tool:coverage',
        kind: 'tool',
        labelKey: 'tool',
        toolName: 'training.data_coverage',
        toolCallId: 'coverage',
        status: 'completed',
      },
    });
    handle.projector.finish('completed');
    await store.checkpoint(handle, 'completed', undefined, {
      resultType: 'ATHLETE_CHECK_IN',
      resultRef: {
        resultType: 'ATHLETE_CHECK_IN',
        result: { summary: '今天保持轻松。', tags: ['轻松'] },
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cachedInputTokens: 0,
          reported: true,
        },
        provider: 'test-provider',
        model: 'test-model',
      },
    });

    const run = await prisma.coachRun.findUniqueOrThrow({
      where: { id: handle.projector.run.runId },
      include: { session: true, attempts: true },
    });
    expect(run).toMatchObject({
      taskKind: 'ATHLETE_CHECK_IN',
      triggerType: 'HOME_TODAY_SUGGESTION',
      triggerRef: '2026-10-26',
      dedupeKey: 'today:2026-10-26:facts-v1',
      inputHash: 'input-hash-v1',
      resultType: 'ATHLETE_CHECK_IN',
      status: 'completed',
      activeAttemptId: null,
      session: { type: 'BACKGROUND' },
    });
    expect(run.attempts).toHaveLength(1);
    expect(
      await prisma.aiCoachMessage.findMany({
        where: { userId: 'athlete', sessionId: handle.sessionId },
        orderBy: { sequence: 'asc' },
        select: { role: true },
      }),
    ).toEqual([{ role: 'SYSTEM' }, { role: 'ASSISTANT' }]);

    const replayed = await store.beginBackground({
      ...args,
      operationId: randomUUID(),
    });
    expect(replayed.handle).toBeUndefined();
    expect(replayed.replay).toMatchObject({
      runId: run.id,
      operationId: args.operationId,
      result: {
        resultType: 'ATHLETE_CHECK_IN',
        result: { summary: '今天保持轻松。' },
      },
    });
    expect(
      await prisma.coachRunAttempt.count({ where: { runId: run.id } }),
    ).toBe(1);
  });
  async function ask() {
    const { handle } = await store.begin(startArgs());
    handle.projector.consume({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'question-call',
            name: 'AskUserQuestion',
            input: question,
          },
        ],
      },
    });
    handle.projector.finish('awaiting_input');
    await store.checkpoint(handle, 'awaiting_input');
    return handle;
  }
  function answerArgs(handle: CoachRunHandle) {
    const pending = handle.projector.pendingInteraction;
    return {
      ...startArgs(),
      prompt: '选择比赛',
      message: {
        content: [
          { type: 'text' as const, text: '选择比赛' },
          {
            type: 'tool_result' as const,
            tool_use_id: 'question-call',
            content: {
              kind: 'coach_question_reply',
              repliesToAssistantMessageId: pending.questionMessageId,
              questionToolUseId: pending.questionToolCallId,
              answers: { goal: 'race' },
              notes: {},
            },
          },
        ],
      },
      command: {
        kind: 'answer' as const,
        requestId: randomUUID(),
        runId: pending.runId,
        interactionId: pending.interactionId,
        submissionId: randomUUID(),
      },
    };
  }

  it.each(['completed', 'cancelled', 'interrupted', 'failed'] as const)(
    'persists public summaries in a %s process-only message without raw reasoning',
    async (status) => {
      const { handle } = await store.begin(startArgs());
      const summary = {
        source: 'assistant_public_summary' as const,
        text: '先核对训练负荷，再确定恢复安排。',
      };
      handle.projector.consume({
        type: 'activity',
        activity: {
          key: 'model:1:1',
          kind: 'analysis',
          labelKey: 'analysis',
          status: 'completed',
          publicSummary: summary,
        },
      });
      handle.projector.consume({
        type: 'stream_event',
        event: { type: 'reasoning_delta', text: 'private raw reasoning' },
      });
      await store.checkpoint(handle);
      handle.projector.finish(status);
      await store.checkpoint(handle, status);
      const rows = await prisma.aiCoachMessage.findMany({
        where: { sessionId: handle.sessionId },
      });
      const stored = rows.find((row) => row.role === 'ASSISTANT');
      expect(stored).toBeDefined();
      expect(stored.content).toBe('');
      const restored = sanitizeStoredCoachMessageForClient(stored.message);
      expect(restored).toMatchObject({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: 'data-coach-activity',
            data: expect.objectContaining({ publicSummary: summary }),
          }),
          expect.objectContaining({
            type: 'data-coach-run',
            data: expect.objectContaining({ status }),
          }),
        ]),
      });
      expect(JSON.stringify(stored.message)).not.toContain(
        'private raw reasoning',
      );
    },
  );

  it('persists hidden failed attempts for audit while restoring only the public outcome', async () => {
    const { handle } = await store.begin(startArgs());
    for (const key of ['invalid-1', 'invalid-2']) {
      handle.projector.consume({
        type: 'activity',
        activity: {
          key,
          kind: 'tool',
          labelKey: 'tool',
          toolName: 'present_training_visualization',
          toolCallId: key,
          status: 'failed',
          failure: { stage: 'validate_input', code: 'INVALID_INPUT' },
        },
      });
      await store.checkpoint(handle);
    }
    handle.projector.consume({
      type: 'activity',
      activity: {
        key: 'valid-3',
        kind: 'tool',
        labelKey: 'tool',
        toolName: 'present_training_visualization',
        toolCallId: 'valid-3',
        status: 'completed',
      },
    });
    handle.projector.finish('completed');
    await store.checkpoint(handle, 'completed');
    const row = await prisma.aiCoachMessage.findUniqueOrThrow({
      where: { id: handle.projector.message.id },
    });
    expect(row.message).toMatchObject({
      activityAudit: expect.arrayContaining([
        expect.objectContaining({
          key: 'invalid-1',
          status: 'failed',
          failure: { stage: 'validate_input', code: 'INVALID_INPUT' },
        }),
        expect.objectContaining({ key: 'invalid-2', status: 'failed' }),
      ]),
    });
    const restored = sanitizeStoredCoachMessageForClient(row.message);
    expect(JSON.stringify(restored)).not.toContain('activityAudit');
    expect(JSON.stringify(restored)).not.toContain('INVALID_INPUT');
    expect(restored).toMatchObject(
      JSON.parse(JSON.stringify(handle.projector.message)),
    );
  });

  it('persists a real tool → question → answer → new attempt → restored history', async () => {
    const { handle } = await store.begin(startArgs());
    const tool = createAiSdkCoachTools({
      tools: [
        {
          name: 'training.test',
          description: 'test',
          parameters: { type: 'object' },
          cost: 'low',
          kind: 'read',
          execute: async () => ({ ok: true }),
        },
      ],
      ctx: {
        signal: new AbortController().signal,
        session: { user: { id: 'athlete' } },
        onActivity: async (activity) => {
          handle.projector.consume({ type: 'activity', activity });
          await store.checkpoint(handle);
        },
      } as unknown as AiToolContext,
    });
    await tool.training_test.execute(
      {},
      { toolCallId: 'real-call', messages: [] },
    );
    handle.projector.consume({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'question-call',
            name: 'AskUserQuestion',
            input: question,
          },
        ],
      },
    });
    handle.projector.finish('awaiting_input');
    await store.checkpoint(handle, 'awaiting_input');
    const next = (await store.begin(answerArgs(handle))).handle;
    expect(next.projector.run.runId).toBe(handle.projector.run.runId);
    expect(next.projector.run.attemptId).not.toBe(
      handle.projector.run.attemptId,
    );
    next.projector.consume({
      type: 'stream_event',
      event: { type: 'text_delta', text: '已制定建议', placement: 'answer' },
    });
    next.projector.finish('completed');
    await store.checkpoint(next, 'completed');
    const rows = await prisma.aiCoachMessage.findMany({
      orderBy: { sequence: 'asc' },
    });
    expect(rows.map((row) => row.role)).toEqual([
      'USER',
      'ASSISTANT',
      'USER',
      'ASSISTANT',
    ]);
    expect(rows[1].message).toMatchObject({
      version: 2,
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-activity',
          data: expect.objectContaining({
            toolCallId: 'real-call',
            status: 'completed',
          }),
        }),
      ]),
    });
    expect(rows[3].message).toEqual(
      JSON.parse(JSON.stringify(next.projector.envelope().message)),
    );
    expect(rows[3].message).toMatchObject({
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-interaction',
          data: expect.objectContaining({ status: 'resolved' }),
        }),
      ]),
    });
  });

  it('replays repeated and concurrent submissions without creating an operation twice', async () => {
    const handle = await ask();
    const args = answerArgs(handle);
    const [a, b] = await Promise.all([store.begin(args), store.begin(args)]);
    expect(Number(Boolean(a.handle)) + Number(Boolean(b.handle))).toBe(1);
    expect(await prisma.coachRunAttempt.count()).toBe(2);
    const replay = await store.begin({
      ...args,
      operationId: randomUUID(),
      command: { ...args.command, requestId: randomUUID() },
    });
    expect(replay.replay.id).toBe((a.handle ?? b.handle).projector.message.id);
    expect(await prisma.aiCoachMessage.count()).toBe(4);
  });

  it('rejects foreign, stale, altered and mismatched-branch answers', async () => {
    const handle = await ask();
    const args = answerArgs(handle);
    await expect(store.begin({ ...args, userId: 'intruder' })).rejects.toThrow(
      'not found',
    );
    await expect(store.begin({ ...args, branchId: 'other' })).rejects.toThrow(
      'branch',
    );
    await expect(
      store.begin({
        ...args,
        command: { ...args.command, interactionId: 'obsolete' },
      }),
    ).rejects.toThrow('pending');
    await store.begin(args);
    await expect(
      store.begin({ ...args, message: { content: [] } }),
    ).rejects.toThrow('already used');
    await expect(store.begin(answerArgs(handle))).rejects.toThrow('pending');
  });

  it('keeps multi-round receipts and bridges old UIMessage answer requests', async () => {
    const first = await ask();
    const args = answerArgs(first);
    const command = await store.legacyAnswerCommand(
      'athlete',
      'session',
      args.message,
      args.operationId,
    );
    expect(command).toMatchObject({
      kind: 'answer',
      runId: first.projector.run.runId,
    });
    expect(
      await store.legacyAnswerCommand(
        'intruder',
        'session',
        args.message,
        args.operationId,
      ),
    ).toBeNull();
    const second = (await store.begin({ ...args, command })).handle;
    second.projector.consume({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'question-call',
            name: 'AskUserQuestion',
            input: question,
          },
        ],
      },
    });
    second.projector.finish('awaiting_input');
    await store.checkpoint(second, 'awaiting_input');
    const third = (await store.begin(answerArgs(second))).handle;
    third.projector.finish('completed');
    await store.checkpoint(third, 'completed');
    const receiptRows = await prisma.aiCoachMessage.findMany({
      where: { role: 'ASSISTANT' },
      orderBy: { sequence: 'asc' },
    });
    expect(receiptRows).toHaveLength(3);
    expect(receiptRows[1].message).toMatchObject({
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-interaction',
          data: expect.objectContaining({
            questionMessageId: first.projector.message.id,
            status: 'resolved',
          }),
        }),
      ]),
    });
    expect((await store.begin({ ...args, command })).replay.id).toBe(
      second.projector.message.id,
    );
  });

  it('requires answer commands for durable questions and validates free text / options', async () => {
    const handle = await ask();
    const args = answerArgs(handle);
    await expect(
      store.begin({ ...args, command: startArgs().command }),
    ).rejects.toThrow('answer command');
    const input = args.message.content[1] as {
      content: {
        answers: Record<string, string>;
        notes: Record<string, string>;
      };
    };
    input.content.answers.goal = 'invented';
    await expect(store.begin(args)).rejects.toThrow('selection');
    input.content.answers = {};
    input.content.notes = { goal: '我想先恢复体能' };
    expect((await store.begin(args)).handle).toBeDefined();
  });

  it('retains old attempts on safe retry and refuses stale retry targets', async () => {
    const { handle } = await store.begin(startArgs());
    handle.projector.finish('interrupted');
    await store.checkpoint(handle, 'interrupted');
    const args = {
      ...startArgs(),
      command: {
        kind: 'retry' as const,
        runId: handle.projector.run.runId,
        attemptId: handle.projector.run.attemptId,
        requestId: randomUUID(),
      },
    };
    const next = (await store.begin(args)).handle;
    next.projector.finish('failed');
    await store.checkpoint(next, 'failed');
    expect(await prisma.aiCoachMessage.count()).toBe(3);
    await expect(
      store.begin({
        ...args,
        operationId: randomUUID(),
        command: { ...args.command, requestId: randomUUID() },
      }),
    ).rejects.toThrow('safely retried');
    expect(await prisma.coachRunAttempt.count()).toBe(2);
  });

  it('arbitrates cancel vs completion in the terminal transaction', async () => {
    const { handle } = await store.begin(startArgs());
    const { runId, attemptId } = handle.projector.run;
    await expect(store.cancel('intruder', runId, attemptId)).rejects.toThrow(
      'not found',
    );
    await store.cancel('athlete', runId, attemptId);
    handle.projector.finish('completed');
    await expect(store.checkpoint(handle, 'completed')).rejects.toBeInstanceOf(
      CoachRunCancelledError,
    );
    handle.projector.finish('cancelled');
    await store.checkpoint(handle, 'cancelled');
    expect(await store.cancel('athlete', runId, attemptId)).toMatchObject({
      accepted: false,
    });
    expect(
      await prisma.coachRun.findUnique({ where: { id: runId } }),
    ).toMatchObject({ status: 'cancelled', activeAttemptId: null });
  });

  it('reconciles a late write without reviving or making it blindly retryable', async () => {
    const { handle } = await store.begin(startArgs());
    handle.projector.consume({
      type: 'activity',
      activity: {
        key: 'tool:write',
        kind: 'tool',
        labelKey: 'tool',
        status: 'running',
        toolCallId: 'write',
        mutation: true,
      },
    });
    await store.checkpoint(handle);
    await prisma.coachRunAttempt.update({
      where: { id: handle.projector.run.attemptId },
      data: { heartbeatAt: new Date(Date.now() - 120_000) },
    });
    await store.recoverStale('athlete', 'session');
    await store.recordLateOutcome(handle, {
      key: 'tool:write',
      kind: 'tool',
      labelKey: 'tool',
      toolCallId: 'write',
      mutation: true,
      status: 'completed',
    });
    expect(
      await prisma.coachRunAttempt.findUnique({
        where: { id: handle.projector.run.attemptId },
      }),
    ).toMatchObject({ status: 'interrupted', unresolvedTools: [] });
    const row = await prisma.aiCoachMessage.findUnique({
      where: { id: handle.projector.message.id },
    });
    expect(row.message).toMatchObject({
      parts: expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-activity',
          data: expect.objectContaining({
            status: 'completed',
            summary: 'late_outcome',
          }),
        }),
      ]),
    });
    await expect(
      store.begin({
        ...startArgs(),
        command: {
          kind: 'retry',
          runId: handle.projector.run.runId,
          attemptId: handle.projector.run.attemptId,
          requestId: randomUUID(),
        },
      }),
    ).rejects.toThrow('safely retried');
  });

  it('enforces one running attempt and request / operation identities in PostgreSQL', async () => {
    const args = startArgs();
    const { handle } = await store.begin(args);
    await expect(
      store.begin({ ...args, command: startArgs().command }),
    ).rejects.toThrow();
    const source = await prisma.coachRunAttempt.findUnique({
      where: { id: handle.projector.run.attemptId },
    });
    const message = await prisma.aiCoachMessage.create({
      data: {
        id: 'another-message',
        userId: 'athlete',
        sessionId: 'session',
        role: 'ASSISTANT',
        content: '',
        sequence: 10,
      },
    });
    await expect(
      prisma.coachRunAttempt.create({
        data: {
          ...source,
          id: randomUUID(),
          requestId: randomUUID(),
          operationId: randomUUID(),
          messageId: message.id,
          unresolvedTools: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await prisma.$disconnect();
    await prisma.$connect();
    await expect(
      prisma.coachRun.update({
        where: { id: handle.projector.run.runId },
        data: { status: 'invented' },
      }),
    ).rejects.toThrow('t_coach_run_status_check');
  });

  it('keeps provider tool order private and outside the visible message sequence', async () => {
    const { handle } = await store.begin(startArgs());
    handle.projector.consume({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'lookup', name: 'profile.zones', input: {} },
        ],
      },
    });
    handle.projector.consume({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'lookup',
            content: { secretMetric: 123 },
          },
        ],
      },
    });
    handle.projector.consume({
      type: 'stream_event',
      event: { type: 'text_delta', text: '完成' },
    });
    handle.projector.finish('completed');
    await store.checkpoint(handle, 'completed');
    const row = await prisma.aiCoachMessage.findUnique({
      where: { id: handle.projector.message.id },
    });
    expect(
      JSON.stringify(sanitizeStoredCoachMessageForClient(row.message)),
    ).not.toContain('secretMetric');
    const replay = buildHistoryMessages({
      provider: null,
      rows: [row],
      thinking: false,
      currentUserMessage: { content: [{ type: 'text', text: '继续' }] },
    });
    expect(replay.map((item) => item.role)).toEqual([
      'assistant',
      'tool',
      'assistant',
      'user',
    ]);
    expect(await prisma.aiCoachMessage.count()).toBe(2);
  });
});
