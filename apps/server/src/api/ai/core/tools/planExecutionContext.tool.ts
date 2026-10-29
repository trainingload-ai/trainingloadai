/**
 * AI Coach 只读工具：把 PlanExecutionContext 压成日/周复盘技能能读的事实切片。
 * 不改计划。对话里问「今天练没练、明天是什么、TSB 多少」应走这个，不要靠聊天记录拼。
 */
import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import { PLAN_REVIEW_SKILLS } from '../tool-skill-scopes';

type Input = {
  date?: string;
  planId?: string;
};

type WorkoutSlice = {
  id: string;
  name: string | null;
  status: string;
  sportType: string;
  weekIndex: number | null;
  dayIndex: number | null;
  expectedLoad: number | null;
};

type Output = {
  kind: 'plan_execution_context';
  factHash: string;
  contextId: string | null;
  contextHeadEventSeq: number | null;
  plan: {
    id: string;
    title: string | null;
    goal: string | null;
    status: string;
  } | null;
  day: {
    date: string;
    completionState: string;
    plannedWorkouts: WorkoutSlice[];
  };
  tomorrow: {
    date: string;
    plannedWorkouts: WorkoutSlice[];
  };
  nextWorkouts: WorkoutSlice[];
  recentLoad: {
    tsb: number | null;
    ctl: number | null;
    atl: number | null;
  };
};

export const planExecutionContextTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'plan.execution_context',
  aliases: ['plan_execution_context', 'plan.execution_facts'],
  description:
    'Read the current plan-execution fact snapshot for today and the next sessions: completion state, planned workouts, next workouts, and recent CTL/ATL/TSB. Use this instead of reconstructing execution facts from chat. This does not change the plan.',
  searchHint:
    'plan execution facts today tomorrow next workout tsb ctl atl completion',
  cost: 'low',
  applicableSkills: [...PLAN_REVIEW_SKILLS, 'readiness-check'],
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 12_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      date: {
        type: 'string',
        description: 'Anchor date YYYY-MM-DD. Defaults to the user-local today.',
      },
      planId: {
        type: 'string',
        description: 'Optional plan id. Omit to use the ACTIVE plan.',
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  execute: async (ctx, input) => {
    const userId = ctx.session.user.id;
    const context = await ctx.planExecutionContext.buildContext({
      userId,
      surface: 'COACH_CHAT',
      planId: input.planId?.trim() || undefined,
      anchorDate: input.date?.trim() || undefined,
    });
    return {
      kind: 'plan_execution_context',
      factHash: context.factHash,
      contextId: context.contextId,
      contextHeadEventSeq: context.contextHeadEventSeq,
      plan: context.plan
        ? {
            id: context.plan.id,
            title: context.plan.title,
            goal: context.plan.goal,
            status: context.plan.status,
          }
        : null,
      day: {
        date: context.day.date,
        completionState: context.day.completionState,
        plannedWorkouts: context.day.plannedWorkouts.map(compactWorkout),
      },
      tomorrow: {
        date: context.tomorrow.date,
        plannedWorkouts: context.tomorrow.plannedWorkouts.map(compactWorkout),
      },
      nextWorkouts: context.nextWorkouts.map(compactWorkout),
      recentLoad: {
        tsb: context.recentLoad.tsb,
        ctl: context.recentLoad.ctl,
        atl: context.recentLoad.atl,
      },
    };
  },
});

function compactWorkout(workout: {
  id: string;
  name: string | null;
  notes: string | null;
  text: string;
  status: string;
  sportType: string;
  weekIndex: number | null;
  dayIndex: number | null;
  expectedLoad: number | null;
}): WorkoutSlice {
  return {
    id: workout.id,
    name: workout.name || workout.notes || workout.text,
    status: workout.status,
    sportType: workout.sportType,
    weekIndex: workout.weekIndex,
    dayIndex: workout.dayIndex,
    expectedLoad: workout.expectedLoad,
  };
}
