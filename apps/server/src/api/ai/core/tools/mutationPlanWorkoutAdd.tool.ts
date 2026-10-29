import { CoachActionType, type Prisma } from '@prisma/client';
import type { UpdatePlanDto } from '@/api/plan/dto/update-plan.dto';
import { PLAN_SPORT_TYPES } from '@/api/plan/plan.constants';
import { aiToolError, requireSignedInUser } from '../tool.types';
import { mutationToolFactory } from '../mutation-tool.factory';
import { PLAN_REVIEW_SKILLS } from '../tool-skill-scopes';

type Input = {
  planId: string;
  weekIndex: number;
  dayIndex: number;
  sessionIndex?: number;
  sportType: string;
  text: string;
  notes?: string | null;
  name?: string | null;
};

type UiPayload = {
  planId: string;
  weekIndex: number;
  dayIndex: number;
};

function isPlanSport(s: string): s is (typeof PLAN_SPORT_TYPES)[number] {
  return (PLAN_SPORT_TYPES as readonly string[]).includes(s);
}

/**
 * 向 **DRAFT 或 PAUSED** 计划追加一节课（走 updatePlan 创建无 id 的 workout）。
 * ACTIVE 计划不可整表编辑；需先 pause 或使用其他流程。
 */
export const planWorkoutAddMutationBundle = mutationToolFactory<Input, UiPayload>(
  {
    name: 'mutation_plan_workout_add',
    aliases: ['plan.workout_add'],
    description:
      'Append one new workout session to a DRAFT or PAUSED plan (same as plan editor adding a day without an id). Does not work on ACTIVE plans (server rejects). Requires valid workout DSL in text.',
    searchHint: 'add workout session plan draft',
    applicableSkills: [...PLAN_REVIEW_SKILLS],
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['planId', 'weekIndex', 'dayIndex', 'sportType', 'text'],
      properties: {
        planId: { type: 'string' },
        weekIndex: { type: 'integer', minimum: 1 },
        dayIndex: { type: 'integer', minimum: 1 },
        sessionIndex: { type: 'integer', minimum: 1 },
        sportType: { type: 'string', enum: [...PLAN_SPORT_TYPES] },
        text: { type: 'string' },
        notes: { type: 'string' },
        name: { type: 'string' },
      },
    },
    cost: 'high',
    type: CoachActionType.PLAN_WORKOUT_ADD,
    riskTier: 'high',
    validateInput: async (ctx, input) => {
      const planId = String(input?.planId ?? '').trim();
      if (!planId) {
        return aiToolError('planId is required', 'INVALID_INPUT');
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

      const dto: UpdatePlanDto = {
        workouts: [
          {
            weekIndex: input.weekIndex,
            dayIndex: input.dayIndex,
            ...(input.sessionIndex !== undefined
              ? { sessionIndex: input.sessionIndex }
              : {}),
            sportType: input.sportType as (typeof PLAN_SPORT_TYPES)[number],
            text: input.text,
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
          },
        ],
      };

      const { plan, afterCommit } = await ctx.planService.updatePlan(
        userId,
        planId,
        dto,
        {
          source: 'ai',
          action: 'plan_workout_add',
          toolCallId: runtime.messageId ?? null,
        },
        { tx },
      );

      return {
        forwardData: {
          planId,
          weekIndex: input.weekIndex,
          dayIndex: input.dayIndex,
        } as Prisma.InputJsonValue,
        reverseData: {} as Prisma.InputJsonValue,
        summary: `Added workout at week ${input.weekIndex} day ${input.dayIndex}.`,
        payloadForUi: {
          planId,
          weekIndex: input.weekIndex,
          dayIndex: input.dayIndex,
        },
        afterCommit,
      };
    },
    undo: async () => {},
  },
);

export const planWorkoutAddMutationTool = planWorkoutAddMutationBundle.tool;
