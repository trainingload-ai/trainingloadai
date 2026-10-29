import { CoachActionType, type Prisma } from '@prisma/client';
import { aiToolError, requireSignedInUser } from '../tool.types';
import { mutationToolFactory } from '../mutation-tool.factory';
import { PLAN_REVIEW_SKILLS } from '../tool-skill-scopes';

type Input = { hashId: string };

type UiPayload = { hashId: string };

/**
 * 解除活动与计划课表的全部 PRIMARY 关联（与 App「解除关联」同路径）。
 * HIGH：不走教练侧 30s 撤销。
 */
export const activityPlanUnlinkMutationBundle = mutationToolFactory<
  Input,
  UiPayload
>({
  name: 'mutation_activity_plan_unlink',
  aliases: ['activity.unlink_plan'],
  description:
    'Remove all active plan-workout links for this activity (hashId). Use when the user explicitly wants to detach the workout from the calendar plan.',
  searchHint: 'unlink activity plan detach scheduled',
  applicableSkills: [...PLAN_REVIEW_SKILLS],
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['hashId'],
    properties: {
      hashId: { type: 'string', description: 'Activity hash id' },
    },
  },
  cost: 'medium',
  type: CoachActionType.ACTIVITY_UNLINK,
  riskTier: 'high',
  validateInput: async (ctx, input) => {
    const hashId = String(input?.hashId ?? '').trim();
    if (!hashId) {
      return aiToolError(
        ctx.i18n.t('common.error.missing_activity_id') ||
          'Missing activity hash id',
        'INVALID_INPUT',
      );
    }
    return { ok: true };
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  async exec(ctx, input, _runtime, tx) {
    const userId = ctx.session!.user!.id;
    const hashId = String(input.hashId).trim();

    await ctx.planService.removeActivityPlanLinkByHash(userId, hashId, { tx });

    return {
      forwardData: { hashId } as Prisma.InputJsonValue,
      reverseData: {} as Prisma.InputJsonValue,
      summary: 'Removed plan links from this activity.',
      payloadForUi: { hashId },
    };
  },
  undo: async () => {},
});

export const activityPlanUnlinkMutationTool =
  activityPlanUnlinkMutationBundle.tool;
