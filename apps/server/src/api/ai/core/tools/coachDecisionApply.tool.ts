import {
  aiToolError,
  buildAiTool,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import { hasCurrentDecisionConfirmation } from '../coach-workout-change';

type Input = {
  decisionId: string;
  selectedOptionKey?: string;
  userConfirmation: string;
  expectedBaseEventSeq?: number;
};

type Output = {
  kind: 'coach_decision_apply';
  decisionId: string;
  result: string;
  commitId?: string | null;
  branchId?: string | null;
  conflict?: {
    expectedBaseEventSeq: number;
    currentHeadEventSeq: number;
  } | null;
};

export const coachDecisionApplyTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'coach_decision_apply',
  aliases: ['decision.apply', 'coach.decision_apply'],
  description:
    'Apply an already-proposed decision in the current branch only after the user explicitly confirms it in the current conversation. This approves the decision and applies it to the main plan context. Do not use for vague consent or if there is no decisionId from coach_decision_draft.',
  searchHint: 'approve apply branch decision after user confirmation',
  cost: 'medium',
  kind: 'draft',
  isReadOnly: false,
  isConcurrencySafe: false,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['decisionId', 'userConfirmation'],
    properties: {
      decisionId: {
        type: 'string',
        description: 'The decision id returned by coach_decision_draft.',
      },
      selectedOptionKey: {
        type: 'string',
        description: 'Optional option key selected by the user.',
      },
      userConfirmation: {
        type: 'string',
        description:
          'Exact full text of the current user turn explicitly confirming the existing draft. Paraphrases or quotes from earlier turns are rejected.',
      },
      expectedBaseEventSeq: {
        type: 'integer',
        description:
          'Optional optimistic base event seq. Omit to use the decision base.',
      },
    },
  },
  isEnabled: async (ctx) => {
    if (ctx.athleteStateSafetyMode === 'HIGH_CONCERN') return false;
    const userId = ctx.session?.user?.id;
    const branchId = String(ctx.branchId ?? '').trim();
    if (!userId || !ctx.coachBranching) return false;
    if (ctx.confirmedDecisionId) return true;
    if (!branchId) return false;
    return ctx.coachBranching.canUseDecisionTools({ userId, branchId });
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  validateInput: (ctx, input) => {
    if (!String(input?.decisionId ?? '').trim()) {
      return aiToolError('decisionId is required', 'INVALID_INPUT');
    }
    if (
      ctx.confirmedDecisionId
        ? ctx.confirmedDecisionId !== input.decisionId
        : !hasCurrentDecisionConfirmation(
            ctx.currentUserPrompt,
            input?.userConfirmation ?? '',
          )
    ) {
      return aiToolError(
        'Explicit current-turn confirmation is required; do not fabricate consent',
        'CONFIRMATION_REQUIRED',
      );
    }
    return { ok: true };
  },
  execute: async (ctx, input) => {
    const userId = ctx.session?.user?.id;
    if (
      !userId ||
      !ctx.coachBranching ||
      (ctx.confirmedDecisionId
        ? ctx.confirmedDecisionId !== input.decisionId
        : !ctx.branchId ||
          !hasCurrentDecisionConfirmation(
            ctx.currentUserPrompt,
            input.userConfirmation,
          ))
    ) {
      throw new Error('coach_decision_apply requires branch context');
    }

    await ctx.coachBranching.approveDecision({
      userId,
      decisionId: input.decisionId,
      selectedOptionKey: input.selectedOptionKey,
      comment: input.userConfirmation,
      branchId: ctx.branchId ?? undefined,
      proposedBefore: ctx.currentTurnStartedAt,
    });
    const result = await ctx.coachBranching.applyDecision({
      userId,
      decisionId: input.decisionId,
      expectedBaseEventSeq: input.expectedBaseEventSeq,
    });

    const commit =
      'commit' in result &&
      result.commit &&
      typeof result.commit.id === 'string'
        ? result.commit
        : null;
    const conflict =
      'conflict' in result &&
      result.conflict &&
      typeof result.conflict.expectedBaseEventSeq === 'number' &&
      typeof result.conflict.currentHeadEventSeq === 'number'
        ? {
            expectedBaseEventSeq: result.conflict.expectedBaseEventSeq,
            currentHeadEventSeq: result.conflict.currentHeadEventSeq,
          }
        : null;
    return {
      kind: 'coach_decision_apply' as const,
      decisionId: input.decisionId,
      result: result.result,
      commitId: commit?.id ?? null,
      branchId: result.branch.id,
      conflict,
      receipt: 'receipt' in result ? result.receipt : null,
    };
  },
});
