import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  CoachRunStore,
  type CoachRunHandle,
} from '../../coach-run-store.service';
import type { CoachFactScope } from '../coach-fact-scope.port';

const url = process.env.COACH_FACT_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'Fact-guided interactions on PostgreSQL',
  () => {
    const db = new PrismaClient({
      datasourceUrl: url ?? 'postgresql://invalid/unused',
    });
    const peerDb = new PrismaClient({
      datasourceUrl: url ?? 'postgresql://invalid/unused',
    });
    let topics: CoachFactScope[];
    let userId: string;
    const users: string[] = [];
    let zones: Map<string, CoachFactScope[]>;
    const validator = {
      current: async (_userId: string, timezone?: string) =>
        timezone ? (zones.get(timezone) ?? topics) : topics,
    };
    const store = new CoachRunStore(
      db as never,
      undefined,
      undefined,
      validator,
    );
    const peer = new CoachRunStore(
      peerDb as never,
      undefined,
      undefined,
      validator,
    );
    beforeAll(() => {
      const target = new URL(url!);
      if (
        target.hostname !== '127.0.0.1' ||
        target.pathname !== '/coach_fact_test'
      )
        throw new Error('Dedicated local test database required');
    });
    beforeEach(async () => {
      userId = `fact-scope-${randomUUID()}`;
      users.push(userId);
      await db.t_user.create({
        data: {
          id: userId,
          email: `${userId}@fixtures.invalid`,
          name: 'Fixture',
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      zones = new Map();
      topics = [
        { topic: 'workout-match:activity-1', revision: 'candidates-v1' },
        { topic: 'today:2026-11-18', revision: 'health-v1' },
      ];
    });
    afterAll(async () => {
      await db.t_user.deleteMany({ where: { id: { in: users } } });
      await Promise.all([db.$disconnect(), peerDb.$disconnect()]);
    });
    const start = (topic = topics[0]) => ({
      userId,
      sid: `session-${topic.topic}`,
      branchId: null,
      lang: 'zh',
      prompt: '请核对当前事实',
      message: { content: [{ type: 'text' as const, text: '请核对当前事实' }] },
      operationId: randomUUID(),
      command: { kind: 'start' as const, requestId: randomUUID() },
      guidance: { ...topic, sessionId: `session-${topic.topic}` },
    });
    async function question(handle: CoachRunHandle, owner = store) {
      handle.projector.consume({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'question-call',
              name: 'AskUserQuestion',
              input: {
                questions: [
                  {
                    id: 'course',
                    header: '课程',
                    question: '这次完成了哪节课？',
                    options: [
                      { value: 'easy', label: '轻松跑', description: '第一节' },
                      {
                        value: 'tempo',
                        label: '节奏跑',
                        description: '第二节',
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      });
      handle.projector.finish('awaiting_input');
      await owner.checkpoint(handle, 'awaiting_input');
    }
    function answer(handle: CoachRunHandle) {
      const pending = handle.projector.pendingInteraction;
      return {
        ...start({
          topic: 'workout-match:activity-1',
          revision: 'candidates-v1',
        }),
        sid: handle.sessionId,
        guidance: undefined,
        prompt: '轻松跑',
        message: {
          content: [
            { type: 'text' as const, text: '轻松跑' },
            {
              type: 'tool_result' as const,
              tool_use_id: 'question-call',
              content: {
                kind: 'coach_question_reply',
                repliesToAssistantMessageId: pending.questionMessageId,
                questionToolUseId: pending.questionToolCallId,
                answers: { course: 'easy' },
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
    it('restores and answers in the server-verified timezone instead of the default UTC day', async () => {
      topics = [
        { topic: 'today:2026-11-17', revision: 'utc', timezone: 'UTC' },
      ];
      const local = {
        topic: 'today:2026-11-18',
        revision: 'local-v1',
        timezone: 'Asia/Shanghai',
      };
      zones.set('Asia/Shanghai', [local]);
      const { handle } = await store.begin(start(local));
      await question(handle!);
      await peer.reconcileCurrentFacts(userId);
      expect(
        (
          await db.coachRun.findUniqueOrThrow({
            where: { id: handle!.projector.run.runId },
          })
        ).status,
      ).toBe('awaiting_input');
      expect(
        await peer.contextTimezone(userId, handle!.projector.run.runId),
      ).toBe('Asia/Shanghai');
      expect(
        await peer.contextTimezone('another-user', handle!.projector.run.runId),
      ).toBeUndefined();
      const result = await peer.begin(answer(handle!));
      expect(result.handle).toBeTruthy();
    });
    it('still cancels a timezone-bound question when its own current facts change', async () => {
      topics = [
        { topic: 'today:2026-11-17', revision: 'utc', timezone: 'UTC' },
      ];
      const local = {
        topic: 'today:2026-11-18',
        revision: 'local-v1',
        timezone: 'Asia/Shanghai',
      };
      zones.set('Asia/Shanghai', [local]);
      const { handle } = await store.begin(start(local));
      await question(handle!);
      zones.set('Asia/Shanghai', [{ ...local, revision: 'local-v2' }]);
      await peer.reconcileCurrentFacts(userId);
      expect(
        (
          await db.coachRun.findUniqueOrThrow({
            where: { id: handle!.projector.run.runId },
          })
        ).status,
      ).toBe('cancelled');
      await expect(peer.begin(answer(handle!))).rejects.toThrow();
    });
    it('deduplicates simultaneous entries from two instances but keeps distinct topics independent', async () => {
      const results = await Promise.all([
        store.begin(start()),
        peer.begin(start()),
      ]);
      expect(results.filter((result) => result.handle)).toHaveLength(1);
      expect(results.filter((result) => result.replay)).toHaveLength(1);
      await store.begin(start(topics[1]));
      expect(await db.coachRun.count({ where: { userId } })).toBe(2);
      expect(
        await db.aiCoachMessage.count({ where: { userId, role: 'USER' } }),
      ).toBe(2);
    });
    it('cancels a fact-dependent question from an ordinary conversation before history restore and rejects its late answer', async () => {
      const args = { ...start(), guidance: undefined };
      const { handle } = await store.begin(args);
      const basis = {
        topic: 'coach-context:2026-11-18',
        revision: 'shared-v1',
      };
      topics.push(basis);
      await store.bindFactScope(userId, handle!.projector.run.runId, basis);
      await question(handle!);
      topics = topics.filter((topic) => topic.topic !== basis.topic);
      await peer.reconcileCurrentFacts(userId);
      expect(
        (
          await db.coachRun.findUniqueOrThrow({
            where: { id: handle!.projector.run.runId },
          })
        ).status,
      ).toBe('cancelled');
      await expect(peer.begin(answer(handle!))).rejects.toThrow();
    });
    it('binds the next accepted attempt to its newly read facts before a second question', async () => {
      const basis = {
        topic: 'coach-context:2026-11-18',
        revision: 'shared-v1',
      };
      topics.push(basis);
      const { handle } = await store.begin({ ...start(), guidance: undefined });
      await store.bindFactScope(userId, handle!.projector.run.runId, basis);
      await question(handle!);
      const resumed = (await store.begin(answer(handle!))).handle!;
      const next = { ...basis, revision: 'shared-v2' };
      topics = topics
        .filter((topic) => topic.topic !== basis.topic)
        .concat(next);
      await store.bindFactScope(userId, resumed.projector.run.runId, next);
      await question(resumed);
      expect(
        (
          await db.coachRun.findUniqueOrThrow({
            where: { id: resumed.projector.run.runId },
          })
        ).status,
      ).toBe('awaiting_input');
    });
    it('retires an unverified legacy conversation question rather than accepting an answer after upgrade', async () => {
      const unverified = new CoachRunStore(db as never);
      const { handle } = await unverified.begin({
        ...start(),
        guidance: undefined,
      });
      await question(handle!, unverified);
      await expect(peer.begin(answer(handle!))).rejects.toThrow();
      expect(
        (
          await db.coachRun.findUniqueOrThrow({
            where: { id: handle!.projector.run.runId },
          })
        ).status,
      ).toBe('cancelled');
    });
    it('preserves the precise matching dependency when the shared conversation context is attached', async () => {
      const args = start();
      const { handle } = await store.begin(args);
      await store.bindFactScope(userId, handle!.projector.run.runId, {
        topic: 'coach-context:2026-11-18',
        revision: 'different',
      });
      expect(
        (
          await db.coachRun.findUniqueOrThrow({
            where: { id: handle!.projector.run.runId },
          })
        ).factScope,
      ).toEqual(topics[0]);
    });
    it('does not cancel a matching question for an unrelated sleep revision', async () => {
      const { handle } = await store.begin(start());
      await question(handle!);
      topics[1] = { ...topics[1], revision: 'health-v2' };
      expect(await store.reconcileFactGuidance(userId, topics)).toBe(0);
      expect(
        (
          await db.coachRun.findUniqueOrThrow({
            where: { id: handle!.projector.run.runId },
          })
        ).status,
      ).toBe('awaiting_input');
    });
    it('persists cancellation before accepting an answer when candidates change', async () => {
      const { handle } = await store.begin(start());
      await question(handle!);
      topics[0] = { ...topics[0], revision: 'candidates-v2' };
      await expect(peer.begin(answer(handle!))).rejects.toThrow();
      const run = await db.coachRun.findUniqueOrThrow({
        where: { id: handle!.projector.run.runId },
      });
      expect(run.status).toBe('cancelled');
      expect(run.pendingInteraction).toBeNull();
      const message = await db.aiCoachMessage.findUniqueOrThrow({
        where: { id: handle!.projector.message.id },
      });
      expect(message.message).toMatchObject({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: 'data-coach-interaction',
            data: expect.objectContaining({ status: 'cancelled' }),
          }),
        ]),
      });
      expect(await db.coachRunAttempt.count({ where: { userId } })).toBe(1);
    });
    it('fences a question generated while its basis is withdrawn and never revives it', async () => {
      const args = start();
      const { handle } = await store.begin(args);
      topics = [];
      await expect(question(handle!)).rejects.toThrow('facts_changed');
      topics = [args.guidance];
      const fresh = await peer.begin({
        ...args,
        operationId: randomUUID(),
        command: { kind: 'start', requestId: randomUUID() },
      });
      expect(fresh.handle!.projector.run.runId).not.toBe(
        handle!.projector.run.runId,
      );
      expect(
        (
          await db.coachRun.findUniqueOrThrow({
            where: { id: handle!.projector.run.runId },
          })
        ).status,
      ).toBe('cancelled');
    });
    it('replays the same answer across devices once and rejects a different late answer', async () => {
      const { handle } = await store.begin(start());
      await question(handle!);
      const args = answer(handle!);
      const results = await Promise.all([store.begin(args), peer.begin(args)]);
      expect(results.filter((result) => result.handle)).toHaveLength(1);
      expect(await db.coachRunAttempt.count({ where: { userId } })).toBe(2);
      topics = [];
      expect(
        (await peer.begin({ ...args, operationId: randomUUID() })).replay,
      ).toBeDefined();
      await expect(peer.begin(answer(handle!))).rejects.toThrow();
    });
    it('rejects a forged session or another user without writing an answer', async () => {
      const args = start();
      await expect(store.begin({ ...args, sid: 'foreign' })).rejects.toThrow(
        'FACT_GUIDANCE_SESSION_CHANGED',
      );
      const { handle } = await store.begin(args);
      await question(handle!);
      await expect(
        peer.begin({ ...answer(handle!), userId: 'other-user' }),
      ).rejects.toThrow();
      expect(await db.coachRunAttempt.count({ where: { userId } })).toBe(1);
    });
  },
);
