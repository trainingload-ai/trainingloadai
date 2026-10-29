import {
  aiToolError,
  buildAiTool,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  decisionType: string;
  riskTier?: 'LOW' | 'HIGH';
  payload: Record<string, unknown>;
  rationale?: string;
  confidence?: number;
  options?: Array<{
    optionKey: string;
    title?: string;
    pros?: unknown;
    cons?: unknown;
    impact?: unknown;
    isSelected?: boolean;
  }>;
};

type Output = {
  kind: 'coach_decision_draft';
  decisionId: string;
  branchId: string;
  state: string;
  riskTier: string;
  decisionType: string;
  payload: Record<string, unknown>;
  rationale?: string | null;
  confidence?: number | null;
  options?: Array<{
    optionKey: string;
    title?: string | null;
    pros?: unknown;
    cons?: unknown;
    impact?: unknown;
    isSelected: boolean;
  }>;
};

const SUPPORTED_DECISION_TYPES = new Set([
  'PLAN_LIFECYCLE',
  'PLAN_WORKOUT_UPDATE',
  'PLAN_WORKOUT_BATCH_UPDATE',
  'PLAN_WORKOUT_SCHEDULE',
  'PLAN_WORKOUT_ADD',
  'PLAN_WORKOUT_STATUS',
  'PLAN_WORKOUT_POSTPONE',
  'ACTIVITY_PLAN_LINK',
  'PLAN_ADAPTATION',
  'PLAN_SUPERSESSION',
]);

function containsMultiItemArray(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 1;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((entry) =>
    containsMultiItemArray(entry),
  );
}

export const coachDecisionDraftTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'coach_decision_draft',
  aliases: ['decision.draft', 'coach.decision_draft'],
  description:
    'Create one proposed decision for user review; never applies it. Use PLAN_WORKOUT_SCHEDULE with {planId, changes:[{workoutId,dto}], additions:[{dto}]} for one local proposal that combines existing-workout edits and additions atomically. PLAN_WORKOUT_BATCH_UPDATE uses {planId, scope:{weekFrom,weekTo}, changes:[{workoutId,dto}]} and covers every pending workout in that agreed inclusive scope (up to 200), including unchanged entries.',
  searchHint: 'branch decision draft squash proposal plan adjustment',
  cost: 'low',
  kind: 'draft',
  isReadOnly: false,
  isConcurrencySafe: false,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['decisionType', 'payload'],
    properties: {
      decisionType: {
        type: 'string',
        enum: [...SUPPORTED_DECISION_TYPES],
        description:
          'The eventual apply operation type. Must match one of the supported decision types.',
      },
      riskTier: {
        type: 'string',
        enum: ['LOW', 'HIGH'],
        description: 'Risk tier for user approval. Default HIGH.',
      },
      payload: {
        type: 'object',
        description:
          'Structured payload for apply. Example PLAN_WORKOUT_UPDATE: { planId, workoutId, dto:{ weekIndex, dayIndex, sessionIndex, sportType, text, notes, name, reason } }.',
      },
      rationale: {
        type: 'string',
        description: 'Short evidence-based rationale for the user.',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['optionKey'],
          properties: {
            optionKey: { type: 'string' },
            title: { type: 'string' },
            pros: { type: 'array', items: { type: 'string' } },
            cons: { type: 'array', items: { type: 'string' } },
            impact: { type: 'object' },
            isSelected: { type: 'boolean' },
          },
        },
      },
    },
  },
  isEnabled: async (ctx) => {
    if (ctx.athleteStateSafetyMode === 'HIGH_CONCERN') return false;
    const userId = ctx.session?.user?.id;
    const branchId = String(ctx.branchId ?? '').trim();
    if (!userId || !ctx.coachBranching) return false;
    if (!branchId) return true;
    return ctx.coachBranching.canUseDecisionTools({ userId, branchId });
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  validateInput: (_ctx, input) => {
    const decisionType = String(input?.decisionType ?? '').trim();
    if (!SUPPORTED_DECISION_TYPES.has(decisionType)) {
      return aiToolError('Unsupported decisionType', 'INVALID_INPUT');
    }
    if (!input?.payload || typeof input.payload !== 'object') {
      return aiToolError('payload is required', 'INVALID_INPUT');
    }
    if (
      decisionType !== 'PLAN_WORKOUT_BATCH_UPDATE' &&
      decisionType !== 'PLAN_WORKOUT_SCHEDULE' &&
      decisionType !== 'PLAN_ADAPTATION' &&
      decisionType !== 'PLAN_SUPERSESSION' &&
      containsMultiItemArray(input.payload)
    ) {
      return aiToolError(
        'Create one decision draft for one atomic change only; batch edits must be split or narrowed first.',
        'INVALID_INPUT',
      );
    }
    if (
      input.confidence !== undefined &&
      (typeof input.confidence !== 'number' ||
        input.confidence < 0 ||
        input.confidence > 1)
    ) {
      return aiToolError('confidence must be between 0 and 1', 'INVALID_INPUT');
    }
    return { ok: true };
  },
  execute: async (ctx, input) => {
    const userId = ctx.session?.user?.id;
    let branchId = String(ctx.branchId ?? '').trim();
    if (!userId || !ctx.coachBranching) {
      throw new Error('coach_decision_draft requires branch context');
    }
    if (!branchId) {
      const planId = String(input.payload.planId ?? '').trim();
      if (!planId)
        throw new Error('planId is required to open an adjustment branch');
      const opened = await ctx.coachBranching.openBranch({
        userId,
        planId,
        openReason: 'conversation_adjustment',
      });
      branchId = opened.branch.id;
    }

    const { decision, options } = await ctx.coachBranching.squashBranch({
      userId,
      branchId,
      mode: 'AUTO',
      riskTier: input.riskTier === 'LOW' ? 'LOW' : 'HIGH',
      decisionType: input.decisionType,
      payload: input.payload,
      rationale: input.rationale,
      confidence: input.confidence,
      options: input.options,
    });

    return {
      kind: 'coach_decision_draft',
      decisionId: decision.id,
      branchId: decision.branchId,
      state: decision.state,
      riskTier: decision.riskTier,
      decisionType: decision.decisionType,
      payload: (decision.payload ?? {}) as Record<string, unknown>,
      rationale: decision.rationale ?? null,
      confidence: decision.confidence ?? null,
      options: options.map((option) => ({
        optionKey: option.optionKey,
        title: option.title ?? null,
        pros: option.pros,
        cons: option.cons,
        impact: option.impact,
        isSelected: option.isSelected,
      })),
    };
  },
});
