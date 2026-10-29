import { CoachActionType, type PlanWorkoutStatus, type Prisma } from '@prisma/client';
import { aiToolError, requireSignedInUser } from '../tool.types';
import { mutationToolFactory } from '../mutation-tool.factory';
import { PLAN_WORKOUT_STATUSES } from '@/api/plan/plan.constants';
import { PLAN_REVIEW_SKILLS } from '../tool-skill-scopes';

type Input = {
  planId: string;
  workoutId: string;
  /** 与计划 API 相同：PLANNED | IN_PROGRESS | DONE | SKIPPED | MOVED */
  status: string;
};

type UiPayload = {
  planId: string;
  workoutId: string;
  status: string;
  name: string | null;
};

function isPlanWorkoutStatus(s: string): s is PlanWorkoutStatus {
  return (PLAN_WORKOUT_STATUSES as readonly string[]).includes(s);
}

/**
 * 更新单节计划课状态（与 `POST .../workouts/:id/status` 一致）。
 * HIGH：不开放教练内 30s 撤销（回滚可能涉及关联活动与负荷重算）。
 */
export const planWorkoutStatusMutationBundle = mutationToolFactory<
  Input,
  UiPayload
>({
  name: 'mutation_plan_workout_status',
  aliases: ['plan.workout_status'],
  description:
    'Set one plan workout\'s status (PLANNED, IN_PROGRESS, DONE, SKIPPED, MOVED). Requires planId and workoutId from plan.by_id or plan.day_view. Plan must not be COMPLETED/CANCELLED. SKIPPED is rejected if a PRIMARY activity link still exists. Use when the user clearly wants to mark a session done/skipped/in progress.',
  searchHint: 'plan workout done skipped status',
  applicableSkills: [...PLAN_REVIEW_SKILLS],
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['planId', 'workoutId', 'status'],
    properties: {
      planId: { type: 'string', description: 'Plan id (cuid)' },
      workoutId: { type: 'string', description: 'PlanWorkout id' },
      status: {
        type: 'string',
        enum: [...PLAN_WORKOUT_STATUSES],
        description: 'Target workout status',
      },
    },
  },
  cost: 'medium',
  type: CoachActionType.PLAN_WORKOUT_STATUS,
  riskTier: 'high',
  validateInput: async (ctx, input) => {
    const planId = String(input?.planId ?? '').trim();
    const workoutId = String(input?.workoutId ?? '').trim();
    const statusRaw = String(input?.status ?? '').trim();
    if (!planId || !workoutId) {
      return aiToolError('planId and workoutId are required', 'INVALID_INPUT');
    }
    if (!statusRaw || !isPlanWorkoutStatus(statusRaw)) {
      return aiToolError(
        `status must be one of: ${PLAN_WORKOUT_STATUSES.join(', ')}`,
        'INVALID_INPUT',
      );
    }
    return { ok: true };
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  async exec(ctx, input, runtime, tx) {
    const userId = ctx.session!.user!.id;
    const planId = String(input.planId).trim();
    const workoutId = String(input.workoutId).trim();
    const status = String(input.status).trim() as PlanWorkoutStatus;

    const { workout } = await ctx.planService.updateWorkoutStatus(
      userId,
      planId,
      workoutId,
      status,
      {
        source: 'ai',
        action: 'plan_workout_status_update',
        toolCallId: runtime.messageId ?? null,
      },
      { tx },
    );

    const name = String(workout?.name ?? '').trim() || null;
    const label = name ?? workoutId.slice(0, 8);

    return {
      forwardData: { planId, workoutId, status } as Prisma.InputJsonValue,
      reverseData: {} as Prisma.InputJsonValue,
      summary: `Workout "${label}" → ${status}.`,
      payloadForUi: {
        planId,
        workoutId,
        status,
        name,
      },
    };
  },
  undo: async () => {},
});

export const planWorkoutStatusMutationTool = planWorkoutStatusMutationBundle.tool;
