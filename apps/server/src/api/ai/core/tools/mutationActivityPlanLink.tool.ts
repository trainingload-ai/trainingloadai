import { CoachActionType, type Prisma } from '@prisma/client';
import { aiToolError, requireSignedInUser } from '../tool.types';
import { mutationToolFactory } from '../mutation-tool.factory';
import { PLAN_REVIEW_SKILLS } from '../tool-skill-scopes';

type Input = {
  hashId: string;
  /** PlanWorkout.id（cuid） */
  workoutId: string;
};

type UiPayload = {
  hashId: string;
  workoutId: string;
  planId: string;
  linkedPlanWorkout: {
    planId: string;
    workoutId: string;
    name: string | null;
    sportType: string | null;
    source: string;
  };
};

/**
 * 将活动 PRIMARY 关联到指定计划课表（与 App「关联训练」同路径）。
 * HIGH 风险：结构化变更，不走 30s 撤销（可在计划中再调整）。
 */
export const activityPlanLinkMutationBundle = mutationToolFactory<
  Input,
  UiPayload
>({
  name: 'mutation_activity_plan_link',
  aliases: ['activity.link_plan_workout'],
  description:
    'Link the athlete\'s activity (hashId) to one plan workout as the PRIMARY match. Replaces any prior link from that activity and any existing PRIMARY link on the target workout. Requires an ACTIVE plan owned by the user; COMPLETED/CANCELLED plans are rejected. Call only after the user clearly asks to attach this activity to a planned session; prefer plan.day_view / plan.by_id to resolve workoutId.',
  searchHint: 'link activity plan workout attach scheduled session',
  applicableSkills: [...PLAN_REVIEW_SKILLS],
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['hashId', 'workoutId'],
    properties: {
      hashId: {
        type: 'string',
        description: 'Activity hash id',
      },
      workoutId: {
        type: 'string',
        description: 'Target PlanWorkout id (from plan tools)',
      },
    },
  },
  cost: 'medium',
  type: CoachActionType.ACTIVITY_LINK,
  riskTier: 'high',
  validateInput: async (ctx, input) => {
    const hashId = String(input?.hashId ?? '').trim();
    const workoutId = String(input?.workoutId ?? '').trim();
    if (!hashId) {
      return aiToolError(
        ctx.i18n.t('common.error.missing_activity_id') ||
          'Missing activity hash id',
        'INVALID_INPUT',
      );
    }
    if (!workoutId) {
      return aiToolError('workoutId is required', 'INVALID_INPUT');
    }
    return { ok: true };
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  async exec(ctx, input, runtime, tx) {
    const userId = ctx.session!.user!.id;
    const hashId = String(input.hashId).trim();
    const workoutId = String(input.workoutId).trim();

    const result = await ctx.planService.replaceActivityPlanLinkByHash(
      userId,
      hashId,
      { workoutId },
      {
        source: 'ai',
        action: 'activity_plan_link',
        toolCallId: runtime.messageId ?? null,
      },
      undefined,
      { tx },
    );

    const lp = result.linkedPlanWorkout;
    const title = String(lp.name ?? '').trim() || workoutId.slice(0, 8);

    return {
      forwardData: {
        hashId,
        workoutId,
        planId: lp.planId,
      } as Prisma.InputJsonValue,
      reverseData: {} as Prisma.InputJsonValue,
      summary: `Linked activity to plan workout "${title}".`,
      payloadForUi: {
        hashId,
        workoutId,
        planId: lp.planId,
        linkedPlanWorkout: lp,
      },
    };
  },
  undo: async () => {
    /* HIGH：coach 侧不可撤销；reverseData 为空 */
  },
});

export const activityPlanLinkMutationTool = activityPlanLinkMutationBundle.tool;
