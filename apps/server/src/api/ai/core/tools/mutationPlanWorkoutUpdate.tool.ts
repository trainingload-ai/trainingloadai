import { CoachActionType, type Prisma } from '@prisma/client';
import type { UpdatePlanWorkoutDto } from '@/api/plan/dto/update-plan-workout.dto';
import { PLAN_SPORT_TYPES } from '@/api/plan/plan.constants';
import { aiToolError, requireSignedInUser } from '../tool.types';
import { mutationToolFactory } from '../mutation-tool.factory';
import { PLAN_REVIEW_SKILLS } from '../tool-skill-scopes';

type Input = {
  planId: string;
  workoutId: string;
  weekIndex: number;
  dayIndex: number;
  sessionIndex?: number;
  sportType: string;
  text: string;
  notes?: string | null;
  name?: string | null;
  /** 顺延填 postpone / POSTPONE（与 App 一致） */
  reason?: string;
};

type UiPayload = {
  planId: string;
  workoutId: string;
  name: string | null;
  status: string;
};

function isPlanSport(s: string): s is (typeof PLAN_SPORT_TYPES)[number] {
  return (PLAN_SPORT_TYPES as readonly string[]).includes(s);
}

export const planWorkoutUpdateMutationBundle = mutationToolFactory<
  Input,
  UiPayload
>({
  name: 'mutation_plan_workout_update',
  aliases: ['plan.workout_update'],
  description:
    'Replace one plan workout\'s schedule + DSL text (same as PUT .../workouts/:id). If you only move it on the calendar on an ACTIVE/PAUSED plan, set reason to "postpone" so status becomes MOVED when appropriate. Cannot edit plans that are COMPLETED/CANCELLED.',
  searchHint: 'edit plan workout DSL reschedule training session',
  applicableSkills: [...PLAN_REVIEW_SKILLS],
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['planId', 'workoutId', 'weekIndex', 'dayIndex', 'sportType', 'text'],
    properties: {
      planId: { type: 'string' },
      workoutId: { type: 'string' },
      weekIndex: { type: 'integer', minimum: 1 },
      dayIndex: { type: 'integer', minimum: 1 },
      sessionIndex: { type: 'integer', minimum: 1 },
      sportType: { type: 'string', enum: [...PLAN_SPORT_TYPES] },
      text: { type: 'string', description: 'Workout DSL' },
      notes: { type: 'string' },
      name: { type: 'string' },
      reason: { type: 'string' },
    },
  },
  cost: 'high',
  type: CoachActionType.PLAN_WORKOUT_UPDATE,
  riskTier: 'high',
  validateInput: async (ctx, input) => {
    const planId = String(input?.planId ?? '').trim();
    const workoutId = String(input?.workoutId ?? '').trim();
    if (!planId || !workoutId) {
      return aiToolError('planId and workoutId are required', 'INVALID_INPUT');
    }
    const st = String(input?.sportType ?? '').trim();
    if (!st || !isPlanSport(st)) {
      return aiToolError('invalid sportType', 'INVALID_INPUT');
    }
    if (typeof input?.text !== 'string' || !input.text.trim()) {
      return aiToolError('text (DSL) is required', 'INVALID_INPUT');
    }
    const wi = input?.weekIndex;
    const di = input?.dayIndex;
    if (
      typeof wi !== 'number' ||
      !Number.isInteger(wi) ||
      wi < 1 ||
      typeof di !== 'number' ||
      !Number.isInteger(di) ||
      di < 1
    ) {
      return aiToolError('weekIndex and dayIndex must be positive integers', 'INVALID_INPUT');
    }
    return { ok: true };
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  async exec(ctx, input, runtime, tx) {
    const userId = ctx.session!.user!.id;
    const planId = String(input.planId).trim();
    const workoutId = String(input.workoutId).trim();

    const dto: UpdatePlanWorkoutDto = {
      weekIndex: input.weekIndex,
      dayIndex: input.dayIndex,
      ...(input.sessionIndex !== undefined
        ? { sessionIndex: input.sessionIndex }
        : {}),
      sportType: input.sportType as UpdatePlanWorkoutDto['sportType'],
      text: input.text,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    };

    const { workout, afterCommit } = await ctx.planService.updateWorkout(
      userId,
      planId,
      workoutId,
      dto,
      {
        source: 'ai',
        action: 'plan_workout_update',
        reason: input.reason?.trim() || null,
        toolCallId: runtime.messageId ?? null,
      },
      { tx },
    );

    return {
      forwardData: { planId, workoutId } as Prisma.InputJsonValue,
      reverseData: {} as Prisma.InputJsonValue,
      summary: `Updated workout "${String(workout?.name ?? '').trim() || workoutId.slice(0, 8)}".`,
      payloadForUi: {
        planId,
        workoutId,
        name: workout?.name ?? null,
        status: String(workout?.status ?? ''),
      },
      afterCommit,
    };
  },
  undo: async () => {},
});

export const planWorkoutUpdateMutationTool = planWorkoutUpdateMutationBundle.tool;
