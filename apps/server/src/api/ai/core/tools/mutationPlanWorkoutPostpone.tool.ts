import { CoachActionType, type Prisma } from '@prisma/client';
import type { UpdatePlanWorkoutDto } from '@/api/plan/dto/update-plan-workout.dto';
import { aiToolError, requireSignedInUser } from '../tool.types';
import { mutationToolFactory } from '../mutation-tool.factory';
import { PLAN_REVIEW_SKILLS } from '../tool-skill-scopes';

type Input = {
  planId: string;
  workoutId: string;
  /** 目标周（1-based，与计划 UI 一致） */
  weekIndex: number;
  /** 目标周几（1-based） */
  dayIndex: number;
};

type UiPayload = {
  planId: string;
  workoutId: string;
  clonedWorkoutId: string | null;
  weekIndex: number;
  dayIndex: number;
  name: string | null;
};

/**
 * 将一节课顺延到新日期（拷贝出新 PLANNED 行，原行留在原日为 MOVED）。
 */
export const planWorkoutPostponeMutationBundle = mutationToolFactory<
  Input,
  UiPayload
>({
  name: 'mutation_plan_workout_postpone',
  aliases: ['plan.workout_postpone', 'plan.shift_session'],
  description:
    'Move one scheduled workout to another week/day by copying it: the original row stays on the source day as MOVED, and a new PLANNED row is created on the target day with movedFromWorkoutId pointing at the original. Fails if a PRIMARY activity link exists (same as manual reschedule rules).',
  searchHint: 'postpone shift workout calendar plan',
  applicableSkills: [...PLAN_REVIEW_SKILLS],
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['planId', 'workoutId', 'weekIndex', 'dayIndex'],
    properties: {
      planId: { type: 'string' },
      workoutId: { type: 'string' },
      weekIndex: { type: 'integer', minimum: 1 },
      dayIndex: { type: 'integer', minimum: 1 },
    },
  },
  cost: 'medium',
  type: CoachActionType.PLAN_SHIFT,
  riskTier: 'high',
  validateInput: async (ctx, input) => {
    const planId = String(input?.planId ?? '').trim();
    const workoutId = String(input?.workoutId ?? '').trim();
    if (!planId || !workoutId) {
      return aiToolError('planId and workoutId are required', 'INVALID_INPUT');
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

    const detail = await ctx.planService.getWorkoutDetail(
      userId,
      planId,
      workoutId,
      tx,
    );
    const w = detail.workout;

    const structureKind = w.structureKind;
    const dto: UpdatePlanWorkoutDto = {
      weekIndex: input.weekIndex,
      dayIndex: input.dayIndex,
      sessionIndex: w.sessionIndex ?? 1,
      sportType: w.sportType as UpdatePlanWorkoutDto['sportType'],
      sportDefinitionCode: w.sportDefinitionCode ?? undefined,
      text: w.text,
      notes: w.notes ?? undefined,
      name: w.name ?? undefined,
      definition:
        w.structure &&
        (structureKind === 'ENDURANCE' ||
          structureKind === 'STRENGTH' ||
          structureKind === 'FREEFORM')
          ? {
              kind: structureKind,
              version: 1,
              source: 'STRUCTURE',
              structure: w.structure,
            }
          : undefined,
      reason: 'postpone',
    };

    const { workout, afterCommit, clonedWorkoutId } =
      await ctx.planService.updateWorkout(
        userId,
        planId,
        workoutId,
        dto,
        {
          source: 'ai',
          action: 'plan_workout_postpone',
          reason: 'postpone',
          toolCallId: runtime.messageId ?? null,
        },
        { tx },
      );

    return {
      forwardData: {
        planId,
        workoutId,
        clonedWorkoutId: clonedWorkoutId ?? null,
        weekIndex: input.weekIndex,
        dayIndex: input.dayIndex,
      } as Prisma.InputJsonValue,
      reverseData: {} as Prisma.InputJsonValue,
      summary: `Postponed workout to week ${input.weekIndex} day ${input.dayIndex}.`,
      payloadForUi: {
        planId,
        workoutId,
        clonedWorkoutId: clonedWorkoutId ?? null,
        weekIndex: input.weekIndex,
        dayIndex: input.dayIndex,
        name: workout?.name ?? null,
      },
      afterCommit,
    };
  },
  undo: async () => {},
});

export const planWorkoutPostponeMutationTool =
  planWorkoutPostponeMutationBundle.tool;
