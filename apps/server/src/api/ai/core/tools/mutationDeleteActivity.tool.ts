import { CoachActionType, type Prisma } from '@prisma/client';
import { aiToolError, requireSignedInUser } from '../tool.types';
import { mutationToolFactory } from '../mutation-tool.factory';
import { ACTIVITY_REVIEW_SKILLS } from '../tool-skill-scopes';

type Input = { hashId: string };

type UiPayload = { hashId: string };

/**
 * 硬删除单个活动（与 App/API 删除一致，含 PMC 重算）。
 * HIGH：不可恢复。
 */
export const activityDeleteMutationBundle = mutationToolFactory<Input, UiPayload>(
  {
    name: 'mutation_activity_delete',
    aliases: ['activity.delete_hard'],
    description:
      'Permanently delete one activity by hashId for the signed-in user. This cannot be undone. Only call after explicit user confirmation to remove the workout record.',
    searchHint: 'delete activity remove workout record',
    applicableSkills: [...ACTIVITY_REVIEW_SKILLS],
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['hashId'],
      properties: {
        hashId: { type: 'string', description: 'Activity hash id' },
      },
    },
    cost: 'medium',
    type: CoachActionType.ACTIVITY_DELETE,
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

      const { afterCommit } =
        await ctx.activityService.deleteActivityInTransaction(
          userId,
          hashId,
          tx,
        );

      return {
        forwardData: { hashId } as Prisma.InputJsonValue,
        reverseData: {} as Prisma.InputJsonValue,
        summary: `Deleted activity (${hashId.slice(0, 8)}…).`,
        payloadForUi: { hashId },
        afterCommit,
      };
    },
    undo: async () => {},
  },
);

export const activityDeleteMutationTool = activityDeleteMutationBundle.tool;
