import { CoachActionType, type Prisma } from '@prisma/client';
import { aiToolError, requireSignedInUser } from '../tool.types';
import { mutationToolFactory } from '../mutation-tool.factory';
import { ACTIVITY_REVIEW_SKILLS } from '../tool-skill-scopes';
import { readyActivityWhere } from '@/utils/activity-ready-where';

const DESCRIPTION_MAX_LEN = 8000;

type Input = {
  hashId: string;
  /** 新的备注文案；传空字符串表示清空备注 */
  description: string;
};

type UiPayload = {
  hashId: string;
  activityId: number;
  description: string | null;
};

/**
 * 将单次室外/跑步机等活动的人类可读备注写入 Activity.description（LOW / 30s 内可撤销）。
 */
export const activityDescriptionMutationBundle = mutationToolFactory<
  Input,
  UiPayload
>({
  name: 'mutation_activity_description',
  aliases: ['activity.description_update'],
  description:
    "Update the user-visible notes/description text on one of the athlete's own activities (by hashId). Does not change metrics or sync data. Use when the user asks to add or edit notes on a specific workout.",
  searchHint: 'activity notes description memo',
  applicableSkills: [...ACTIVITY_REVIEW_SKILLS],
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['hashId', 'description'],
    properties: {
      hashId: {
        type: 'string',
        description: 'Activity hash id from earlier activity.* tool results',
      },
      description: {
        type: 'string',
        description: 'New notes text; use empty string to clear notes',
      },
    },
  },
  cost: 'low',
  type: CoachActionType.ACTIVITY_META_UPDATE,
  riskTier: 'low',
  validateInput: async (ctx, input) => {
    const hashId = String(input?.hashId ?? '').trim();
    if (!hashId) {
      return aiToolError(
        ctx.i18n.t('common.error.missing_activity_id') ||
          'Missing activity hash id',
        'INVALID_INPUT',
      );
    }
    if (typeof input.description !== 'string') {
      return aiToolError('description must be a string', 'INVALID_INPUT');
    }
    if (input.description.length > DESCRIPTION_MAX_LEN) {
      return aiToolError(
        `description exceeds ${DESCRIPTION_MAX_LEN} characters`,
        'INVALID_INPUT',
      );
    }
    return { ok: true };
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  async exec(ctx, input, _runtime, tx) {
    const userId = ctx.session!.user!.id;
    const hashId = String(input.hashId).trim();
    const newDescription =
      input.description.trim() === '' ? null : input.description.trim();

    const activity = await tx.activity.findFirst({
      where: readyActivityWhere({ hashId, userId }),
      select: {
        id: true,
        description: true,
        activityName: true,
      },
    });
    if (!activity) {
      throw new Error(
        ctx.i18n.t('common.error.activity_not_found_or_no_permission') ||
          'Activity not found',
      );
    }

    const previousDescription = activity.description ?? null;

    await tx.activity.update({
      where: { id: activity.id },
      data: { description: newDescription },
    });

    const title =
      String(activity.activityName ?? '').trim() || hashId.slice(0, 8);

    return {
      forwardData: {
        hashId,
        previousDescription,
        newDescription,
      } as Prisma.InputJsonValue,
      reverseData: {
        activityId: activity.id,
        previousDescription,
      } as Prisma.InputJsonValue,
      summary:
        previousDescription === newDescription
          ? `Notes unchanged for "${title}".`
          : newDescription === null
            ? `Cleared notes on "${title}".`
            : `Updated notes on "${title}".`,
      payloadForUi: {
        hashId,
        activityId: activity.id,
        description: newDescription,
      },
    };
  },
  async undo({ prisma, userId, reverseData }) {
    const d = reverseData as {
      activityId: number;
      previousDescription: string | null;
    };
    const row = await prisma.activity.findFirst({
      where: { id: d.activityId, userId },
      select: { id: true },
    });
    if (!row) return;
    await prisma.activity.update({
      where: { id: d.activityId },
      data: { description: d.previousDescription },
    });
  },
});

export const activityDescriptionMutationTool =
  activityDescriptionMutationBundle.tool;
