import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import type {
  FitnessAssessmentResult,
  FitnessApplyOption,
} from '@shared/fitness-assessment';
import type { AiToolContext } from '../tool.types';
import { fitnessApplyTool } from '../tools/fitnessAssessment.tools';
import { askUserQuestionTool } from '../tools/askUserQuestion.tool';
import {
  fitnessConfirmationFromQuestion,
  fitnessConfirmationQuestion,
} from '../../fitness-assessment-confirmation';
import { loadReferencedCoachQuestion } from '../coach-question-reference';
import {
  stopAfterUiSurfaceTool,
  uiSurfaceAssistantForToolResult,
} from '../tool-loop-agent.runtime';
import { parseCoachQuestionReplyLikeToolResultPayload } from '@shared/ai-coach-schema';
import { FitnessAssessmentApplyService } from '../../fitness-assessment-apply.service';
import { fingerprint, localDay } from '@/fitness-calculation/fitness-input';
import { buildStoredCoachUiMessageEnvelope } from '../coach-history-messages';

const option: FitnessApplyOption = {
  id: 'target',
  sport: 'RUN',
  effectiveDate: localDay(new Date(), 'UTC'),
  changes: [
    {
      metric: 'LTHR',
      value: 165,
      unit: 'bpm',
      currentValue: null,
      delta: null,
    },
  ],
  proposalDigest: 'digest-for-exact-165',
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};
const i18n = {
  t: (key: string, options?: { args?: unknown }) =>
    `${key} ${JSON.stringify(options?.args ?? {})}`,
} as AiToolContext['i18n'];
const binding = {
  kind: 'fitness_apply_confirmation',
  calculationId: 'calc',
  applyOptionId: 'target',
  proposalDigest: option.proposalDigest,
};
const reply = {
  kind: 'coach_question_reply',
  repliesToAssistantMessageId: 'temporary-ui-id',
  questionToolUseId: 'stable-tool-id',
  answers: { fitness_apply: 'apply' },
  notes: { fitness_apply: '' },
};
const question = () =>
  fitnessConfirmationQuestion({
    calculationId: 'calc',
    option,
    i18n,
    lang: 'zh-CN',
  });
const context = {
  userId: 'athlete',
  sessionId: 'session',
  branchId: null,
  now: new Date(),
};

afterEach(() => jest.restoreAllMocks());

describe('fitness confirmation through a question', () => {
  it('binds the displayed choice to the exact saved proposal, independent of reply text', () => {
    const output = question();
    expect(output.questions[0].question).toContain('LTHR: 165 bpm');
    expect(fitnessConfirmationFromQuestion(output, reply)).toEqual(binding);
    expect(parseCoachQuestionReplyLikeToolResultPayload(reply)).toMatchObject({
      ok: true,
      data: { questionToolUseId: 'stable-tool-id' },
    });
  });

  it.each([
    { ...reply, answers: { fitness_apply: 'keep' } },
    { ...reply, kind: 'coach_question_skip' },
    { ...reply, answers: { fitness_apply: ['apply', 'keep'] } },
    { ...reply, notes: { fitness_apply: '先别更新' } },
    { ...reply, answers: { fitness_apply: 'apply', another: 'yes' } },
  ])(
    'does not turn a declined, skipped or qualified answer into consent',
    (input) => {
      expect(
        fitnessConfirmationFromQuestion(question(), input),
      ).toBeUndefined();
    },
  );

  it('never accepts a binding supplied by a user reply or a model-generated generic question', async () => {
    const generic = {
      ...question(),
      metadata: { skill: 'fitness-assessment' },
    };
    expect(
      fitnessConfirmationFromQuestion(generic, {
        ...reply,
        fitnessConfirmation: binding,
      }),
    ).toBeUndefined();
    const modelQuestion = await askUserQuestionTool.execute(
      { activeSkillName: 'fitness-assessment' } as AiToolContext,
      question(),
    );
    expect(
      fitnessConfirmationFromQuestion(modelQuestion, reply),
    ).toBeUndefined();
  });

  it('finds a live question by its stable tool id within the authenticated conversation', async () => {
    const input = question();
    const findFirst = jest.fn(async () => ({
      message: {
        kind: 'ui_message',
        version: 1,
        parts: [],
        legacyMessage: {
          content: [
            {
              type: 'tool_use',
              id: 'stable-tool-id',
              name: 'AskUserQuestion',
              input,
            },
          ],
        },
      },
    }));
    const loaded = await loadReferencedCoachQuestion(
      { aiCoachMessage: { findFirst } } as never,
      context,
      reply,
    );
    expect(fitnessConfirmationFromQuestion(loaded, reply)).toEqual(binding);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'athlete',
          sessionId: 'session',
          role: 'ASSISTANT',
          createdAt: { lt: context.now },
          OR: expect.arrayContaining([
            {
              message: {
                path: ['legacyMessage', 'content'],
                array_contains: [
                  {
                    type: 'tool_use',
                    id: 'stable-tool-id',
                    name: 'AskUserQuestion',
                  },
                ],
              },
            },
          ]),
        }),
      }),
    );
  });

  it('does not accept a question from another branch', async () => {
    const input = {
      ...question(),
      metadata: { ...question().metadata, branchId: 'other-branch' },
    };
    const prisma = {
      aiCoachMessage: {
        findFirst: async () => ({
          message: {
            content: [{ id: 'stable-tool-id', name: 'AskUserQuestion', input }],
          },
        }),
      },
    };
    expect(
      await loadReferencedCoachQuestion(prisma as never, context, reply),
    ).toBeNull();
  });

  it('shows a bound question on missing consent and applies through the real guard after one selection', async () => {
    const savedEnv = { ...process.env };
    try {
      process.env.FITNESS_ASSESSMENT_ENABLED = 'true';
      process.env.FITNESS_ESTIMATE_APPLY_ENABLED = 'true';
      process.env.FITNESS_LTHR_APPLY_ENABLED = 'true';
      const input = {
        timezone: 'UTC',
        request: { sport: 'RUN' },
        window: { from: '2026-09-01T00:00:00Z', to: new Date().toISOString() },
      };
      const result = {
        kind: 'fitness_assessment_result',
        status: 'ESTIMATED',
        method: { id: 'lthr-activity-observation' },
        applyOptions: [option],
        evidence: {},
        limitations: [],
      } as unknown as FitnessAssessmentResult;
      const calculation = {
        id: 'calc',
        state: 'COMPLETED',
        methodId: 'lthr-activity-observation',
        methodVersion: '1',
        policyVersion: '1',
        taskRevision: 1,
        task: { revision: 1 },
        presentedAt: new Date(Date.now() - 10000),
        presentedMessageId: 'old-card',
        applyExpiresAt: new Date(option.expiresAt),
        input,
        inputHash: fingerprint(input),
        result,
        resultHash: fingerprint(result),
        selectionHash: 'evidence',
        baselineHash: 'baseline',
      };
      const calculations = { calculation: jest.fn(async () => calculation) };
      const tx = {
        $queryRaw: jest.fn(async () => [{ ready: true }]),
        fitnessCalculation: {
          findUniqueOrThrow: async () => calculation,
          findMany: async () => [calculation],
          update: jest.fn(async () => ({})),
        },
        aiCoachMessage: {
          findFirst: async () => ({ id: 'recent-explanation' }),
        },
      };
      let adopted = false;
      const users = {
        applyFitnessEstimateBatch: jest.fn(async () => {
          adopted = true;
          return { before: [] };
        }),
      };
      const reader = {
        selection: async () => ({ hash: 'evidence' }),
        baseline: async () => ({
          hash: 'baseline',
          values: adopted ? { LTHR: 165 } : {},
        }),
      };
      const actions = {
        run: async (operation: {
          exec: (tx: unknown) => Promise<Record<string, unknown>>;
          finalize: (tx: unknown, receipt: unknown) => Promise<void>;
        }) => {
          const changed = await operation.exec(tx);
          const receipt = {
            ...changed,
            actionId: 'action',
            type: 'USER_THRESHOLD_UPDATE',
            riskTier: 'HIGH',
          };
          await operation.finalize(tx, receipt);
          return receipt;
        },
      };
      const apply = new FitnessAssessmentApplyService(
        calculations as never,
        reader as never,
        users as never,
        actions as never,
        { assertGranted: async () => {} } as never,
      );
      const ctx = {
        session: { user: { id: 'athlete' } },
        sid: 'session',
        currentTurnStartedAt: new Date(),
        currentUserPrompt: '可以啊',
        fitnessCalculations: calculations,
        fitnessApply: apply,
        i18n,
        lang: 'zh',
      } as unknown as AiToolContext;
      const args = { calculationId: 'calc', applyOptionId: 'target' };
      const first = await fitnessApplyTool.execute(ctx, args);
      expect(first.kind).toBe('ask_user_question');
      expect(users.applyFitnessEstimateBatch).not.toHaveBeenCalled();
      expect(
        uiSurfaceAssistantForToolResult({
          id: 'stable-tool-id',
          name: 'mutation_apply_fitness_calculation',
          input: args,
          output: first,
          ok: true,
        }),
      ).toMatchObject({ message: { content: [{ name: 'AskUserQuestion' }] } });
      expect(
        stopAfterUiSurfaceTool({
          steps: [
            {
              toolResults: [
                {
                  toolName: 'mutation_apply_fitness_calculation',
                  output: first,
                },
              ],
            },
          ],
        }),
      ).toBe(true);
      const card = uiSurfaceAssistantForToolResult({
        id: 'stable-tool-id',
        name: 'mutation_apply_fitness_calculation',
        input: args,
        output: first,
        ok: true,
      });
      if (card?.type !== 'assistant')
        throw new Error('Missing confirmation question');
      const stored = buildStoredCoachUiMessageEnvelope({
        role: 'assistant',
        content: '',
        message: card.message,
      });
      const loaded = await loadReferencedCoachQuestion(
        {
          aiCoachMessage: { findFirst: async () => ({ message: stored }) },
        } as never,
        context,
        reply,
      );
      const confirmed = fitnessConfirmationFromQuestion(loaded, reply);
      const written = await fitnessApplyTool.execute(
        {
          ...ctx,
          currentUserPrompt: '你的选择\n- 确认采用',
          fitnessConfirmation: confirmed,
        },
        args,
      );
      expect(written).toMatchObject({
        kind: 'mutation_applied',
        payload: { changes: option.changes },
      });
      expect(users.applyFitnessEstimateBatch).toHaveBeenCalledTimes(1);
      expect(tx.fitnessCalculation.update).toHaveBeenCalledTimes(1);
    } finally {
      process.env = savedEnv;
    }
  });

  it('does not turn stale results into another confirmation request', async () => {
    const ctx = {
      session: { user: { id: 'athlete' } },
      fitnessApply: {
        apply: async () => {
          throw new ConflictException('STALE');
        },
      },
    } as unknown as AiToolContext;
    await expect(
      fitnessApplyTool.execute(ctx, {
        calculationId: 'calc',
        applyOptionId: 'target',
      }),
    ).rejects.toThrow('STALE');
  });
});
