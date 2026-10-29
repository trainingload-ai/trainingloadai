import { CoachActionType, type Prisma } from '@prisma/client';
import { aiToolError, requireSignedInUser } from '../tool.types';
import { mutationToolFactory } from '../mutation-tool.factory';
import { PLAN_REVIEW_SKILLS } from '../tool-skill-scopes';

const LIFECYCLE_ACTIONS = [
  'activate',
  'pause',
  'complete',
  'cancel',
] as const;

type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

type Input = {
  planId: string;
  action: string;
  /** activate：可选 ISO 日期字符串 */
  startDate?: string;
  /** complete：可选完成时间 */
  completedAt?: string;
  reason?: string;
};

type UiPayload = {
  planId: string;
  action: string;
  title: string | null;
};

function isLifecycleAction(s: string): s is LifecycleAction {
  return (LIFECYCLE_ACTIONS as readonly string[]).includes(s);
}

export const planLifecycleMutationBundle = mutationToolFactory<Input, UiPayload>(
  {
    name: 'mutation_plan_lifecycle',
    aliases: ['plan.lifecycle'],
    description:
      'Change plan lifecycle: activate (DRAFT/PAUSED→ACTIVE), pause (ACTIVE→PAUSED), complete (ACTIVE/PAUSED→COMPLETED), or cancel (→CANCELLED). activate rejects if another plan is already ACTIVE. Requires explicit user intent. Replacing or abandoning an unfinished plan is NOT completing a cycle: use plan.proposal_preview in SUPERSEDE mode for a replacement, or obtain consent to pause/cancel the old plan before activating an existing new plan. Use complete only when the user explicitly intends to mark the training cycle completed; it triggers a cycle review.',
    searchHint: 'activate plan pause cancel complete training cycle',
    applicableSkills: [...PLAN_REVIEW_SKILLS],
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['planId', 'action'],
      properties: {
        planId: { type: 'string' },
        action: {
          type: 'string',
          enum: [...LIFECYCLE_ACTIONS],
        },
        startDate: {
          type: 'string',
          description: 'Optional start date for activate (YYYY-MM-DD)',
        },
        completedAt: {
          type: 'string',
          description: 'Optional completion instant for complete',
        },
        reason: { type: 'string', description: 'Optional note' },
      },
    },
    cost: 'medium',
    type: CoachActionType.PLAN_LIFECYCLE,
    riskTier: 'high',
    validateInput: async (ctx, input) => {
      const planId = String(input?.planId ?? '').trim();
      const action = String(input?.action ?? '').trim().toLowerCase();
      if (!planId) {
        return aiToolError('planId is required', 'INVALID_INPUT');
      }
      if (!action || !isLifecycleAction(action)) {
        return aiToolError(
          `action must be one of: ${LIFECYCLE_ACTIONS.join(', ')}`,
          'INVALID_INPUT',
        );
      }
      return { ok: true };
    },
    checkPermissions: async (ctx) => requireSignedInUser(ctx),
    async exec(ctx, input, runtime, tx) {
      const userId = ctx.session!.user!.id;
      const planId = String(input.planId).trim();
      const action = String(input.action).trim().toLowerCase() as LifecycleAction;

      let title: string | null = null;
      let afterCommit: (() => Promise<void>) | undefined;

      switch (action) {
        case 'activate': {
          const r = await ctx.planService.activatePlan(
            userId,
            planId,
            input.startDate?.trim() || undefined,
            {
              source: 'ai',
              action: 'plan_lifecycle_activate',
              reason: input.reason?.trim() || null,
              toolCallId: runtime.messageId ?? null,
            },
            { tx },
          );
          title = r.plan?.title ?? null;
          break;
        }
        case 'pause': {
          const r = await ctx.planService.pausePlan(
            userId,
            planId,
            input.reason?.trim(),
            {
              source: 'ai',
              action: 'plan_lifecycle_pause',
              reason: input.reason?.trim() || null,
              toolCallId: runtime.messageId ?? null,
            },
            { tx },
          );
          title = r.plan?.title ?? null;
          break;
        }
        case 'complete': {
          const r = await ctx.planService.completePlan(
            userId,
            planId,
            input.completedAt?.trim(),
            input.reason?.trim(),
            {
              source: 'ai',
              action: 'plan_lifecycle_complete',
              reason: input.reason?.trim() || null,
              toolCallId: runtime.messageId ?? null,
            },
            { tx },
          );
          title = r.plan?.title ?? null;
          afterCommit = r.afterCommit;
          break;
        }
        case 'cancel': {
          const r = await ctx.planService.cancelPlan(
            userId,
            planId,
            input.reason?.trim(),
            {
              source: 'ai',
              action: 'plan_lifecycle_cancel',
              reason: input.reason?.trim() || null,
              toolCallId: runtime.messageId ?? null,
            },
            { tx },
          );
          title = r.plan?.title ?? null;
          afterCommit = r.afterCommit;
          break;
        }
        default:
          throw new Error('Unsupported lifecycle action');
      }

      return {
        forwardData: { planId, action } as Prisma.InputJsonValue,
        reverseData: {} as Prisma.InputJsonValue,
        summary: `Plan ${action}${title ? `: ${title}` : ''}.`,
        payloadForUi: {
          planId,
          action,
          title,
        },
        afterCommit,
      };
    },
    undo: async () => {},
  },
);

export const planLifecycleMutationTool = planLifecycleMutationBundle.tool;
