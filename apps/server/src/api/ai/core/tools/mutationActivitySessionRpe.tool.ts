import { CoachActionType, type Prisma } from '@prisma/client';
import { aiToolError, requireSignedInUser } from '../tool.types';
import { mutationToolFactory } from '../mutation-tool.factory';
import { ACTIVITY_REVIEW_SKILLS } from '../tool-skill-scopes';
import { readyActivityWhere } from '@/utils/activity-ready-where';

type Input = {
  hashId: string;
  /** 主观 Session RPE（常见为 1–10）；传 null 表示清除记录 */
  sessionRpe: number | null;
};

type UiPayload = {
  hashId: string;
  activityId: number;
  sessionRpe: number | null;
};

function normalizeSessionRpe(value: unknown): number | null | 'invalid' {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'invalid';
  const n = value;
  // 常见 CR10 / session RPE：允许半档（如 6.5）
  if (n < 1 || n > 10) return 'invalid';
  return n;
}

/**
 * 写入 Activity.sessionRpe（LOW / 30s 内可撤销）；供 PMC「SESSIONRPE」负荷轨道使用。
 */
export const activitySessionRpeMutationBundle = mutationToolFactory<
  Input,
  UiPayload
>({
  name: 'mutation_activity_session_rpe',
  aliases: ['activity.session_rpe_update'],
  description:
    "Save or clear subjective session RPE (rate of perceived exertion, typically 1–10) on one of the athlete's activities (by hashId). Does not edit workout metrics from devices. Use when the user explicitly wants to record how hard the session felt.",
  searchHint: 'session RPE perceived exertion subjective load',
  applicableSkills: [...ACTIVITY_REVIEW_SKILLS],
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['hashId', 'sessionRpe'],
    properties: {
      hashId: {
        type: 'string',
        description: 'Activity hash id from earlier activity.* tool results',
      },
      sessionRpe: {
        description:
          'Session RPE from 1 to 10 (decimals allowed, e.g. 6.5). Use JSON null to clear a saved value.',
        type: ['number', 'null'],
      },
    },
  },
  cost: 'low',
  type: CoachActionType.ACTIVITY_SESSION_RPE,
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
    const normalized = normalizeSessionRpe(input?.sessionRpe as unknown);
    if (normalized === 'invalid') {
      return aiToolError(
        'sessionRpe must be null or a number between 1 and 10',
        'INVALID_INPUT',
      );
    }
    return { ok: true };
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  async exec(ctx, input, _runtime, tx) {
    const userId = ctx.session!.user!.id;
    const hashId = String(input.hashId).trim();
    const newRpe = normalizeSessionRpe(input.sessionRpe);
    if (newRpe === 'invalid') {
      throw new Error('Invalid sessionRpe');
    }

    const activity = await tx.activity.findFirst({
      where: readyActivityWhere({ hashId, userId }),
      select: {
        id: true,
        sessionRpe: true,
        activityName: true,
      },
    });
    if (!activity) {
      throw new Error(
        ctx.i18n.t('common.error.activity_not_found_or_no_permission') ||
          'Activity not found',
      );
    }

    const previousRpe =
      activity.sessionRpe != null && Number.isFinite(activity.sessionRpe)
        ? activity.sessionRpe
        : null;

    await tx.activity.update({
      where: { id: activity.id },
      data: { sessionRpe: newRpe },
    });

    const title =
      String(activity.activityName ?? '').trim() || hashId.slice(0, 8);

    const same =
      previousRpe === newRpe ||
      (previousRpe != null &&
        newRpe != null &&
        Math.abs(previousRpe - newRpe) < 1e-9);

    return {
      forwardData: {
        hashId,
        previousRpe,
        newRpe,
      } as Prisma.InputJsonValue,
      reverseData: {
        activityId: activity.id,
        previousRpe,
      } as Prisma.InputJsonValue,
      summary: same
        ? `Session RPE unchanged for "${title}".`
        : newRpe === null
          ? `Cleared session RPE on "${title}".`
          : `Saved session RPE ${newRpe} on "${title}".`,
      payloadForUi: {
        hashId,
        activityId: activity.id,
        sessionRpe: newRpe,
      },
    };
  },
  async undo({ prisma, userId, reverseData }) {
    const d = reverseData as {
      activityId: number;
      previousRpe: number | null;
    };
    const row = await prisma.activity.findFirst({
      where: { id: d.activityId, userId },
      select: { id: true },
    });
    if (!row) return;
    await prisma.activity.update({
      where: { id: d.activityId },
      data: { sessionRpe: d.previousRpe },
    });
  },
});

export const activitySessionRpeMutationTool =
  activitySessionRpeMutationBundle.tool;
