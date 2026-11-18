import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { CoachBranchingService } from '../coach-branching.service';
import { CoachRunStore } from '../coach-run-store.service';
import { PlanQueryService } from '../../plan/application/plan-query.service';
import { PlanRepository } from '../../plan/persistence/plan.repository';
import { PlanWorkoutRepository } from '../../plan/persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '../../plan/persistence/plan-activity-link.repository';
import { CoachContextRepository } from '../../plan/persistence/coach-context.repository';
import { planStartFixture } from '../../plan/spec/plan-start.fixture';
import { buildStoredCoachUiMessageEnvelope } from '../core/coach-history-messages';
import type { PlanStartPreviewRequest } from '@shared/plan-proposal';

/** Exercises the public confirmation/apply interface with actual PostgreSQL transactions. */
describe('START decision confirmation / PostgreSQL', () => {
  let database: ChildProcess;
  let prisma: PrismaClient;
  let f: ReturnType<typeof planStartFixture>;
  let coach: CoachBranchingService;
  beforeAll(async () => {
    const fixture = process.env.PLAN_SYNC_TEST_NATIVE_POSTGRES_BIN
      ? '../../plan/spec/plan-sync-native-postgres.mjs'
      : '../core/spec/coach-run-postgres.mjs';
    database = fork(resolve(__dirname, fixture), [], {
      execArgv: [],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    const db = await new Promise<{ address: string; connectionLimit?: number }>(
      (done, reject) => {
        database.once('message', done);
        database.once('error', reject);
        database.once('exit', (code) =>
          reject(new Error(`Test database exited: ${code}`)),
        );
      },
    );
    prisma = new PrismaClient({
      datasourceUrl: `postgresql://postgres:postgres@${db.address}/postgres?connection_limit=${db.connectionLimit ?? 1}&sslmode=disable`,
    });
    await prisma.$connect();
    f = planStartFixture(prisma);
    const query = new PlanQueryService(
      prisma as never,
      new PlanRepository(prisma as never),
      new PlanWorkoutRepository(prisma as never),
      new PlanActivityLinkRepository(prisma as never),
      new CoachContextRepository(prisma as never),
      {} as never,
    );
    coach = new CoachBranchingService(
      prisma as never,
      f.service,
      f.context,
      query,
      f.apply,
      f.proposals,
    );
  }, 30000);
  afterAll(async () => {
    await prisma?.$disconnect();
    if (database && database.exitCode === null)
      await new Promise<void>((done) => {
        database.once('exit', () => done());
        database.send('close');
      });
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM t_user');
    await prisma.$executeRawUnsafe("INSERT INTO t_user(id) VALUES ('user')");
  });
  async function proposal(
    addition = false,
    schedule = false,
    mainChat = false,
  ) {
    const created = await f.service.createPlan('user', {
      title: 'Saved draft',
      periodWeeks: 1,
      workouts: [
        {
          weekIndex: 1,
          dayIndex: 1,
          sportType: 'RUN',
          definition: {
            kind: 'FREEFORM',
            version: 1,
            source: 'TEXT',
            text: 'Easy run 30m',
          },
        },
      ],
    });
    const planId = created.plan!.id;
    const session = await f.starts.conversation('user', planId, '2099-11-22');
    if (schedule)
      await prisma.$transaction((tx) =>
        f.service.activatePlan('user', planId, '2099-11-22', undefined, {
          tx,
          validatedStartPreview: true,
        }),
      );
    let branch = await coach.bindStartConversationBranch({
      userId: 'user',
      sid: session.sid,
      branchId: null,
      revision: 1,
    });
    const binding: { sid: string; branchId: string; userMessageId?: string } = {
      sid: session.sid,
      branchId: branch.id,
    };
    if (schedule) {
      await prisma.aiCoachSession.update({
        where: { userId_id: { userId: 'user', id: session.sid } },
        data: {
          planStartPlanId: null,
          planStartBranchId: null,
          planStartRevision: 0,
        },
      });
      const user = await prisma.aiCoachMessage.create({
        data: {
          userId: 'user',
          sessionId: session.sid,
          role: 'USER',
          sequence: -2,
          content: 'Change remaining availability',
          createdAt: new Date(Date.now() - 20000),
        },
      });
      const assistant = await prisma.aiCoachMessage.create({
        data: {
          userId: 'user',
          sessionId: session.sid,
          role: 'ASSISTANT',
          sequence: -1,
          content: '',
          createdAt: new Date(Date.now() - 19000),
        },
      });
      binding.userMessageId = user.id;
      await prisma.coachRun.create({
        data: {
          id: 'schedule-run',
          userId: 'user',
          sessionId: session.sid,
          branchId: branch.id,
          originMessageId: user.id,
          activeAttemptId: 'schedule-attempt',
          attempts: {
            create: {
              id: 'schedule-attempt',
              userId: 'user',
              requestId: 'req',
              requestHash: 'hash',
              inputMessageId: user.id,
              messageId: assistant.id,
              trigger: 'start',
              operationId: 'op',
              ownerId: 'test',
            },
          },
        },
      });
    }
    const request: PlanStartPreviewRequest = {
      mode: 'START',
      planId,
      startDate: '2099-11-22',
      rationale: 'Reviewed current facts',
      evidenceRefs: [
        { type: 'training', label: 'Available training reviewed' },
      ],
      changes: [],
      additions: addition
        ? [
            {
              candidateKey: 'extra',
              workout: {
                weekIndex: 1,
                dayIndex: 3,
                sportType: 'RUN',
                definition: {
                  kind: 'FREEFORM',
                  version: 1,
                  source: 'TEXT',
                  text: 'Easy run 20m',
                },
              },
            },
          ]
        : [],
      deletions: [],
      preserveUnmentioned: true,
    };
    const effectiveRequest = schedule
      ? {
          ...request,
          mode: 'SCHEDULE' as const,
          range: { from: '2099-11-22', to: '2099-11-28' },
        }
      : request;
    if (mainChat) {
      await prisma.coachRun.update({
        where: { id: 'schedule-run' },
        data: { branchId: null },
      });
      binding.branchId = '';
    }
    const preview = mainChat
      ? await coach.createPlanProposalPreview({
          userId: 'user',
          request: effectiveRequest,
          binding,
        })
      : await f.proposals.createPreview('user', effectiveRequest, binding);
    if (mainChat) {
      binding.branchId = (await coach.currentConversationBranch({
        userId: 'user',
        sid: session.sid,
        userMessageId: binding.userMessageId!,
      }))!;
      branch = await prisma.coachBranch.findUniqueOrThrow({
        where: { id: binding.branchId },
      });
    }
    const draft = await coach.squashBranch({
      userId: 'user',
      branchId: branch.id,
      binding,
      decisionType: preview.decisionType,
      payload: preview.decisionPayload,
    });
    const past = Date.now() - 10000;
    await prisma.coachDecision.update({
      where: { id: draft.decision.id },
      data: { createdAt: new Date(past) },
    });
    const assistant = await prisma.aiCoachMessage.create({
      data: {
        userId: 'user',
        sessionId: session.sid,
        role: 'ASSISTANT',
        sequence: 1,
        content: '',
        createdAt: new Date(past + 1000),
        message: buildStoredCoachUiMessageEnvelope({
          role: 'assistant',
          content: '',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'draft-tool',
                name: 'CoachDecisionDraft',
                input: {
                  decisionId: draft.decision.id,
                  branchId: branch.id,
                  decisionType: preview.decisionType,
                  payload: preview.decisionPayload,
                },
              },
            ],
          },
        }) as never,
      },
    });
    const message = {
      content: [
        {
          type: 'tool_result' as const,
          tool_use_id: assistant.id,
          content: {
            kind: 'coach_decision_confirmation',
            decisionId: draft.decision.id,
            repliesToAssistantMessageId: assistant.id,
          },
        },
      ],
    };
    await prisma.aiCoachMessage.create({
      data: {
        userId: 'user',
        sessionId: session.sid,
        role: 'USER',
        sequence: 2,
        content: 'Confirm',
        createdAt: new Date(past + 2000),
        message: buildStoredCoachUiMessageEnvelope({
          role: 'user',
          content: 'Confirm',
          message,
        }) as never,
      },
    });
    await prisma.aiCoachSession.update({
      where: { userId_id: { userId: 'user', id: session.sid } },
      data: { nextSequence: 3 },
    });
    const confirmation = {
      userId: 'user',
      decisionId: draft.decision.id,
      branchId: branch.id,
      proposedBefore: new Date(),
      confirmation: { sid: session.sid, assistantMessageId: assistant.id },
    };
    return { planId, binding, preview, draft, confirmation, message, session };
  }
  it('requires the real card confirmation, commits the same draft, and replays the same receipt after a lost response', async () => {
    const p = await proposal();
    await expect(
      coach.approveDecision({
        userId: 'user',
        decisionId: p.draft.decision.id,
      }),
    ).rejects.toThrow('START_CONFIRMATION_REQUIRED');
    await coach.approveDecision(p.confirmation);
    const first = await coach.applyDecision({
      userId: 'user',
      decisionId: p.draft.decision.id,
    });
    const replay = await coach.applyDecision({
      userId: 'user',
      decisionId: p.draft.decision.id,
    });
    expect(first).toMatchObject({
      result: 'APPLIED',
      receipt: { planId: p.planId, readbackVerified: true },
      commit: { id: expect.any(String) },
    });
    expect(replay).toMatchObject({
      result: 'APPLIED',
      commit: { id: first.commit!.id },
      receipt: first.receipt,
    });
    expect((await f.service.getPlanDetail('user', p.planId)).plan!.status).toBe(
      'ACTIVE',
    );
    expect(
      await prisma.coachCommit.count({
        where: { decisionId: p.draft.decision.id },
      }),
    ).toBe(1);
    expect(await prisma.plan.count()).toBe(1);
  });
  it('serializes double confirmation/application without a second commit or duplicate new workout', async () => {
    const p = await proposal(true);
    const apply = async () => {
      await coach.approveDecision(p.confirmation);
      return coach.applyDecision({
        userId: 'user',
        decisionId: p.draft.decision.id,
      });
    };
    const [first, second] = await Promise.all([apply(), apply()]);
    expect(first.result).toBe('APPLIED');
    expect(second.result).toBe('APPLIED');
    expect(first.commit!.id).toBe(second.commit!.id);
    expect(
      await prisma.coachCommit.count({
        where: { decisionId: p.draft.decision.id },
      }),
    ).toBe(1);
    expect(
      (await f.service.getPlanDetail('user', p.planId)).plan!.workouts,
    ).toHaveLength(2);
    expect(first).toMatchObject({ receipt: { addedWorkoutCount: 1 } });
  });
  it('converges two different user confirmation turns for the same actual card to one receipt', async () => {
    const p = await proposal(true);
    await coach.approveDecision(p.confirmation);
    const runs = new CoachRunStore(
      prisma as never,
      undefined,
      undefined,
      undefined,
      f.starts,
    );
    await runs.begin({
      userId: 'user',
      sid: p.session.sid,
      branchId: p.binding.branchId,
      lang: 'en',
      prompt: 'Confirm',
      message: p.message,
      operationId: 'second-click',
      command: { kind: 'start', requestId: 'second-click' },
    });
    const [first, second] = await Promise.all([
      coach.applyDecision({ userId: 'user', decisionId: p.draft.decision.id }),
      (async () => {
        await coach.approveDecision({
          ...p.confirmation,
          proposedBefore: new Date(),
        });
        return coach.applyDecision({
          userId: 'user',
          decisionId: p.draft.decision.id,
        });
      })(),
    ]);
    expect(first.result).toBe('APPLIED');
    expect(second.result).toBe('APPLIED');
    expect(first.commit!.id).toBe(second.commit!.id);
    expect(
      await prisma.coachCommit.count({
        where: { decisionId: p.draft.decision.id },
      }),
    ).toBe(1);
    expect(
      (await f.service.getPlanDetail('user', p.planId)).plan!.workouts,
    ).toHaveLength(2);
  });
  it('atomically rolls back activation when Commit persistence fails', async () => {
    const p = await proposal();
    await coach.approveDecision(p.confirmation);
    await prisma.$executeRawUnsafe(
      "CREATE FUNCTION reject_start_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test commit rejected'; END $$",
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER test_reject_start_commit BEFORE INSERT ON t_coach_commit FOR EACH ROW EXECUTE FUNCTION reject_start_commit()',
    );
    try {
      await expect(
        coach.applyDecision({
          userId: 'user',
          decisionId: p.draft.decision.id,
        }),
      ).rejects.toThrow(/test commit rejected/);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER test_reject_start_commit ON t_coach_commit',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION reject_start_commit()');
    }
    expect((await f.service.getPlanDetail('user', p.planId)).plan!.status).toBe(
      'DRAFT',
    );
    expect(
      (
        await prisma.coachDecision.findUniqueOrThrow({
          where: { id: p.draft.decision.id },
        })
      ).state,
    ).toBe('APPROVED');
    expect(
      (
        await prisma.planProposalPreview.findUniqueOrThrow({
          where: { id: p.preview.previewId },
        })
      ).appliedAt,
    ).toBeNull();
  });
  it('revokes an approved card before persisting a new discussion turn with additional constraints', async () => {
    const p = await proposal();
    await coach.approveDecision(p.confirmation);
    const runs = new CoachRunStore(
      prisma as never,
      undefined,
      undefined,
      undefined,
      f.starts,
    );
    await runs.begin({
      userId: 'user',
      sid: p.session.sid,
      branchId: p.binding.branchId,
      lang: 'en',
      prompt: 'Wednesday must be a rest day',
      message: {
        content: [{ type: 'text', text: 'Wednesday must be a rest day' }],
      },
      operationId: 'new-constraint',
      command: { kind: 'start', requestId: 'new-constraint' },
    });
    const result = await coach.applyDecision({
      userId: 'user',
      decisionId: p.draft.decision.id,
    });
    expect(result.result).toBe('SKIPPED');
    expect((await f.service.getPlanDetail('user', p.planId)).plan!.status).toBe(
      'DRAFT',
    );
  });
  it('rejects a delayed evaluation run after a newer user instruction was persisted', async () => {
    const p = await proposal();
    const original = await prisma.aiCoachMessage.findFirstOrThrow({
      where: { userId: 'user', sessionId: p.session.sid, role: 'USER' },
      orderBy: { sequence: 'desc' },
    });
    const runs = new CoachRunStore(
      prisma as never,
      undefined,
      undefined,
      undefined,
      f.starts,
    );
    await runs.begin({
      userId: 'user',
      sid: p.session.sid,
      branchId: p.binding.branchId,
      lang: 'en',
      prompt: 'Keep Wednesday free',
      message: { content: [{ type: 'text', text: 'Keep Wednesday free' }] },
      operationId: 'newer-request',
      command: { kind: 'start', requestId: 'newer-request' },
    });
    const request: PlanStartPreviewRequest = {
      mode: 'START',
      planId: p.planId,
      startDate: '2099-11-22',
      rationale: 'Old evaluation',
      evidenceRefs: [],
      changes: [],
      additions: [],
      deletions: [],
      preserveUnmentioned: true,
    };
    await expect(
      f.proposals.createPreview('user', request, {
        ...p.binding,
        userMessageId: original.id,
      }),
    ).rejects.toThrow('evaluation turn was replaced');
    expect((await f.service.getPlanDetail('user', p.planId)).plan!.status).toBe(
      'DRAFT',
    );
  });
  it('accepts an exact card confirmation through the durable run admission before applying it', async () => {
    const p = await proposal();
    const runs = new CoachRunStore(
      prisma as never,
      undefined,
      undefined,
      undefined,
      f.starts,
    );
    await runs.begin({
      userId: 'user',
      sid: p.session.sid,
      branchId: p.binding.branchId,
      lang: 'en',
      prompt: 'Confirm',
      message: p.message,
      operationId: 'confirm-card',
      command: { kind: 'start', requestId: 'confirm-card' },
    });
    await coach.approveDecision({
      ...p.confirmation,
      proposedBefore: new Date(),
    });
    expect(
      (
        await coach.applyDecision({
          userId: 'user',
          decisionId: p.draft.decision.id,
        })
      ).result,
    ).toBe('APPLIED');
  });
  it('concurrent initial opens share one bound branch and one durable first turn', async () => {
    const created = await f.service.createPlan('user', {
      title: 'Fresh',
      periodWeeks: 1,
      workouts: [
        {
          weekIndex: 1,
          dayIndex: 1,
          sportType: 'RUN',
          definition: {
            kind: 'FREEFORM',
            version: 1,
            source: 'TEXT',
            text: 'Easy run',
          },
        },
      ],
    });
    const session = await f.starts.conversation(
      'user',
      created.plan!.id,
      '2099-11-22',
    );
    const [a, b] = await Promise.all([
      coach.bindStartConversationBranch({
        userId: 'user',
        sid: session.sid,
        branchId: null,
        revision: 1,
      }),
      coach.bindStartConversationBranch({
        userId: 'user',
        sid: session.sid,
        branchId: null,
        revision: 1,
      }),
    ]);
    expect(a.id).toBe(b.id);
    const runs = new CoachRunStore(
      prisma as never,
      undefined,
      undefined,
      undefined,
      f.starts,
    );
    const args = {
      userId: 'user',
      sid: session.sid,
      branchId: a.id,
      lang: 'en',
      prompt: 'Assess this draft',
      message: {
        content: [{ type: 'text' as const, text: 'Assess this draft' }],
      },
      operationId: `coach-entry:${session.entryKey}`,
      command: { kind: 'start' as const, requestId: session.entryKey },
    };
    const attempts = await Promise.all([runs.begin(args), runs.begin(args)]);
    const first = attempts.find((attempt) => attempt.handle)!;
    const replay = attempts.find((attempt) => attempt.replay)!;
    expect(first.handle).toBeDefined();
    expect(replay.replay?.id).toBe(first.handle!.projector.message.id);
    expect(
      await prisma.aiCoachMessage.count({
        where: { userId: 'user', sessionId: session.sid, role: 'USER' },
      }),
    ).toBe(1);
    expect(
      await prisma.coachRunAttempt.count({
        where: { userId: 'user', operationId: args.operationId },
      }),
    ).toBe(1);
    expect(
      (await f.starts.conversation('user', created.plan!.id)).evaluationStarted,
    ).toBe(true);
  });
  it('continues the same start conversation on a writable followup branch after the start commit', async () => {
    const p = await proposal();
    await coach.approveDecision(p.confirmation);
    await coach.applyDecision({
      userId: 'user',
      decisionId: p.draft.decision.id,
    });
    const next = await coach.bindStartConversationBranch({
      userId: 'user',
      sid: p.session.sid,
      branchId: p.binding.branchId,
      revision: 1,
    });
    expect(next.status).toBe('OPEN');
    expect(next.id).not.toBe(p.binding.branchId);
    expect((await f.starts.conversation('user', p.planId)).sid).toBe(
      p.session.sid,
    );
  });

  it('requires an actual card in an ordinary conversation and commits a SCHEDULE receipt exactly once', async () => {
    const p = await proposal(false, true);
    expect(p.preview.mode).toBe('SCHEDULE');
    await expect(
      coach.approveDecision({
        userId: 'user',
        decisionId: p.draft.decision.id,
      }),
    ).rejects.toThrow('START_CONFIRMATION_REQUIRED');
    await coach.approveDecision(p.confirmation);
    const applied = await coach.applyDecision({
      userId: 'user',
      decisionId: p.draft.decision.id,
    });
    expect(applied).toMatchObject({
      result: 'APPLIED',
      receipt: {
        mode: 'SCHEDULE',
        readbackVerified: true,
        changedWorkoutCount: 0,
      },
      commit: { id: expect.any(String) },
    });
    const replay = await coach.applyDecision({
      userId: 'user',
      decisionId: p.draft.decision.id,
    });
    expect(replay.receipt).toEqual(applied.receipt);
  });
  it('creates a server-owned branch from a branchless ordinary chat and restores it for real-card confirmation', async () => {
    const p = await proposal(false, true, true);
    expect(
      await coach.decisionConversationBranch(
        'user',
        p.session.sid,
        p.draft.decision.id,
      ),
    ).toBe(p.binding.branchId);
    expect(
      await coach.decisionConversationBranch(
        'user',
        'different-session',
        p.draft.decision.id,
      ),
    ).toBeNull();
    await coach.approveDecision(p.confirmation);
    expect(
      await coach.applyDecision({
        userId: 'user',
        decisionId: p.draft.decision.id,
      }),
    ).toMatchObject({
      result: 'APPLIED',
      receipt: { mode: 'SCHEDULE', readbackVerified: true },
    });
  });
  it('keeps the committed schedule receipt authoritative when the post-commit notification fails', async () => {
    const p = await proposal(false, true);
    await coach.approveDecision(p.confirmation);
    Object.assign(f.write, {
      events: {
        emitAsync: async () => {
          throw new Error('provider unavailable');
        },
      },
    });
    try {
      const result = await coach.applyDecision({
        userId: 'user',
        decisionId: p.draft.decision.id,
      });
      expect(result).toMatchObject({
        result: 'APPLIED',
        receipt: { mode: 'SCHEDULE', readbackVerified: true },
        commit: { id: expect.any(String) },
      });
      expect(
        (await f.service.getPlanDetail('user', p.planId)).plan!.status,
      ).toBe('ACTIVE');
      expect(
        (
          await coach.applyDecision({
            userId: 'user',
            decisionId: p.draft.decision.id,
          })
        ).receipt,
      ).toEqual(result.receipt);
    } finally {
      Object.assign(f.write, { events: undefined });
    }
  });
  it('converges eight simultaneous confirmations to one committed schedule receipt', async () => {
    const p = await proposal(false, true);
    let notifications = 0;
    Object.assign(f.write, {
      events: {
        emitAsync: async (type: string) => {
          if (type === 'plan.workoutsChanged') notifications++;
        },
      },
    });
    const results = await Promise.all(
      Array.from({ length: 8 }, async () => {
        await coach.approveDecision(p.confirmation);
        return coach.applyDecision({
          userId: 'user',
          decisionId: p.draft.decision.id,
        });
      }),
    );
    expect(results.map((result) => result.result)).toEqual(
      Array(8).fill('APPLIED'),
    );
    expect(new Set(results.map((result) => result.commit!.id)).size).toBe(1);
    for (const result of results)
      expect(result.receipt).toEqual(results[0].receipt);
    expect(
      await prisma.coachCommit.count({
        where: { decisionId: p.draft.decision.id },
      }),
    ).toBe(1);
    expect(notifications).toBe(1);
    Object.assign(f.write, { events: undefined });
  });
});
