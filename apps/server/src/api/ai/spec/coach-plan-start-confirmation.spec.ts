import { describe, expect, it } from '@jest/globals';
import { CoachBranchingService } from '../coach-branching.service';
import { AiService } from '../ai.service';

function setup() {
  const decision = {
    id: 'decision',
    decisionType: 'PLAN_START',
    state: 'PROPOSED',
    branchId: 'branch',
    createdAt: new Date('2026-11-18T10:00:00Z'),
    context: { planId: 'plan' },
    payload: { planId: 'plan', previewId: 'preview' },
  };
  const session = {
    planStartPlanId: 'plan',
    planStartBranchId: 'branch',
    planStartRevision: 1,
  };
  const assistant = {
    id: 'assistant',
    role: 'ASSISTANT',
    userId: 'user',
    sessionId: 'sid',
    createdAt: new Date('2026-11-18T10:01:00Z'),
    message: {
      content: [
        {
          type: 'tool_use',
          name: 'CoachDecisionDraft',
          input: {
            decisionId: 'decision',
            branchId: 'branch',
            payload: { planId: 'plan', previewId: 'preview' },
          },
        },
      ],
    },
  };
  const user = {
    id: 'confirmation',
    role: 'USER',
    userId: 'user',
    sessionId: 'sid',
    createdAt: new Date('2026-11-18T10:02:00Z'),
    message: {
      content: [
        {
          type: 'tool_result',
          content: {
            kind: 'coach_decision_confirmation',
            decisionId: 'decision',
            repliesToAssistantMessageId: 'assistant',
          },
        },
      ],
    },
  };
  const service = Object.create(
    CoachBranchingService.prototype,
  ) as CoachBranchingService;
  const db = {
    planProposalPreview: {
      findUnique: async () => ({
        id: 'preview',
        userId: 'user',
        sourcePlanId: 'plan',
        expiresAt: new Date(Date.now() + 60_000),
        appliedAt: decision.state === 'APPLIED' ? new Date() : null,
        discardedAt: null,
      }),
    },
    aiCoachSession: { findUnique: async () => session },
    aiCoachMessage: {
      findFirst: async ({ where }: { where: { role?: string } }) =>
        where.role === 'ASSISTANT' ? assistant : user,
    },
    coachDecision: {
      update: async ({ data }: { data: object }) => ({ ...decision, ...data }),
      updateMany: async ({
        data,
        where,
      }: {
        data: object;
        where: { state: { in: string[] } };
      }) => {
        if (!where.state.in.includes(decision.state)) return { count: 0 };
        Object.assign(decision, data);
        return { count: 1 };
      },
      findUnique: async () => decision,
      findUniqueOrThrow: async () => decision,
    },
  };
  Object.assign(service, {
    requireDecisionOwner: async () => decision,
    prisma: {
      ...db,
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
    },
  });
  const confirm = {
    userId: 'user',
    decisionId: 'decision',
    branchId: 'branch',
    proposedBefore: new Date('2026-11-18T10:03:00Z'),
    confirmation: { sid: 'sid', assistantMessageId: 'assistant' },
  };
  return { service, decision, session, assistant, user, confirm, db };
}

describe('schedule draft rejection', () => {
  it('discards a proposal idempotently without changing a committed decision', async () => {
    const s = setup();
    s.decision.decisionType = 'PLAN_SCHEDULE';
    const args = {
      userId: 'user',
      decisionId: s.decision.id,
      reason: 'user_cancelled_plan_proposal',
    };
    await expect(s.service.rejectDecision(args)).resolves.toMatchObject({
      decision: { state: 'REJECTED', rationale: '[rejected] user_cancelled_plan_proposal' },
    });
    await expect(s.service.rejectDecision(args)).resolves.toMatchObject({
      decision: { state: 'REJECTED', rationale: '[rejected] user_cancelled_plan_proposal' },
    });
    s.decision.state = 'APPLIED';
    await expect(s.service.rejectDecision(args)).rejects.toThrow('DECISION_STATE_CHANGED');
    expect(s.decision.state).toBe('APPLIED');
  });
});

describe('saved draft start confirmation', () => {
  it('rejects direct approval without a persisted conversation card reference', async () => {
    const s = setup();
    await expect(
      s.service.approveDecision({ userId: 'user', decisionId: 'decision' }),
    ).rejects.toThrow('START_CONFIRMATION_REQUIRED');
  });
  it('accepts only the actual persisted card and records its user confirmation', async () => {
    const s = setup();
    const result = await s.service.approveDecision(s.confirm);
    expect(result.decision).toMatchObject({
      state: 'APPROVED',
      payload: {
        startConfirmation: {
          sid: 'sid',
          assistantMessageId: 'assistant',
          userMessageId: 'confirmation',
          sessionRevision: 1,
        },
      },
    });
  });
  it('accepts the v2 persisted UI envelope used by actual streaming sessions', async () => {
    const s = setup();
    const assistantBody = s.assistant.message,
      userBody = s.user.message;
    Object.assign(s.assistant, {
      message: {
        kind: 'ui_message',
        version: 2,
        parts: [],
        legacyMessage: assistantBody,
      },
    });
    Object.assign(s.user, {
      message: {
        kind: 'ui_message',
        version: 1,
        parts: [],
        legacyMessage: userBody,
      },
    });
    expect((await s.service.approveDecision(s.confirm)).decision.state).toBe(
      'APPROVED',
    );
  });
  it('does not regress an already committed START when another approval arrives late', async () => {
    const s = setup();
    Object.assign(s.service, {
      requireDecisionOwner: async () => ({ ...s.decision }),
      prisma: {
        ...s.db,
        $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
          s.decision.state = 'APPLIED';
          return run(s.db);
        },
      },
    });
    expect((await s.service.approveDecision(s.confirm)).decision.state).toBe(
      'APPLIED',
    );
  });
  it('rejects a different preview pasted into the assistant reference', async () => {
    const s = setup();
    s.assistant.message.content[0].input.payload.previewId = 'other-preview';
    await expect(s.service.approveDecision(s.confirm)).rejects.toThrow(
      'START_CARD_MISMATCH',
    );
  });
  it('rejects a session bound to another source plan or branch', async () => {
    const s = setup();
    s.session.planStartPlanId = 'other-plan';
    await expect(s.service.approveDecision(s.confirm)).rejects.toThrow(
      'START_SESSION_MISMATCH',
    );
  });
  it('rejects consent that does not reference the assistant card in this user turn', async () => {
    const s = setup();
    s.user.message.content[0].content.repliesToAssistantMessageId =
      'other-assistant';
    await expect(s.service.approveDecision(s.confirm)).rejects.toThrow(
      'START_CONFIRMATION_REQUIRED',
    );
  });
});

describe('START card history readback', () => {
  it('projects current decision state into both actual UI parts and legacy cards without changing the proposal', async () => {
    const input = {
      decisionType: 'PLAN_START',
      decisionId: 'd',
      state: 'PROPOSED',
      payload: {
        previewId: 'preview',
        presentation: { summary: 'Original immutable candidate' },
      },
    };
    const message = {
      kind: 'ui_message',
      version: 2,
      parts: [
        {
          type: 'data-coach-tool',
          data: { name: 'CoachDecisionDraft', input },
        },
      ],
      legacyMessage: {
        content: [{ type: 'tool_use', name: 'CoachDecisionDraft', input }],
      },
    };
    const service = Object.create(AiService.prototype) as AiService;
    Object.assign(service, {
      prisma: {
        aiCoachSession: { findUnique: async () => ({ lang: 'en' }) },
        aiCoachMessage: {
          findMany: async () => [
            {
              id: 'assistant',
              role: 'ASSISTANT',
              content: '',
              message,
              createdAt: new Date(),
            },
          ],
        },
        coachDecision: {
          findMany: async () => [{ id: 'd', state: 'SUPERSEDED', payload: {} }],
        },
      },
    });
    const rows = await service.listCoachSessionMessages({
      userId: 'user',
      sid: 'sid',
    });
    expect(rows[0].message).toMatchObject({
      parts: [
        {
          data: {
            input: {
              state: 'SUPERSEDED',
              payload: {
                presentation: { summary: 'Original immutable candidate' },
              },
            },
          },
        },
      ],
      legacyMessage: { content: [{ input: { state: 'SUPERSEDED' } }] },
    });
    expect(input.state).toBe('PROPOSED');
  });
});
