import dayjs = require('dayjs');
import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import {
  getPlanAnchorDayIndex,
  summarizePlanWorkoutRow,
  type PlanWorkoutSummary,
} from './plan-snapshot.shared';
import { PLAN_REVIEW_SKILLS } from '../tool-skill-scopes';

type Input = {
  /** 视图锚点日期 YYYY-MM-DD（默认今日） */
  date?: string;
  /** 可选：指定计划 id；缺省则使用当前 ACTIVE 计划 */
  planId?: string;
};

export type PlanDayViewToolOutput = {
  kind: 'plan_day_view';
  date: string;
  plan: null | {
    id: string;
    title: string;
    status: string;
    periodWeeks: number;
    startDate: string | null;
  };
  weekIndex: number | null;
  dayIndex: number | null;
  dayOffset: number | null;
  /** 所选日期落在计划起止范围之外 */
  outsidePlanRange: boolean;
  workouts: PlanWorkoutSummary[];
};

export const planDayViewTool: AiToolDef<Input, PlanDayViewToolOutput> =
  buildAiTool({
    name: 'plan.day_view',
    aliases: ['plan_day_view', 'plan_day', 'tomorrow_plan_day'],
    description:
      'Single-calendar-day slice of a training plan: scheduled workouts for **one** date (default today). Uses ACTIVE plan unless planId is provided. Call when the user asks “what is tomorrow / next Monday / this Friday’s sessions”.',
    cost: 'low',
    searchHint:
      'plan day tomorrow schedule workouts calendar single day active plan',
    applicableSkills: [...PLAN_REVIEW_SKILLS],
    isEnabled: async (ctx) => hasSignedInUser(ctx),
    maxResultChars: 14_000,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        date: {
          type: 'string',
          description:
            'Anchor date YYYY-MM-DD in user-local calendar sense (server parses as calendar date). Defaults to today.',
        },
        planId: {
          type: 'string',
          description:
            'Optional specific plan id. Omit to use the latest ACTIVE plan.',
        },
      },
    },
    checkPermissions: async (ctx) => requireSignedInUser(ctx),
    summarizeForModel: ({ output }) => ({
      date: output.date,
      planTitle: output.plan?.title,
      weekIndex: output.weekIndex,
      dayIndex: output.dayIndex,
      outsidePlanRange: output.outsidePlanRange,
      workouts: output.workouts,
    }),
    execute: async (ctx, input) => {
      const userId = ctx.session?.user?.id;
      const anchor = input.date
        ? dayjs(input.date).startOf('day')
        : dayjs().startOf('day');
      const safeAnchor = anchor.isValid() ? anchor : dayjs().startOf('day');
      const dateStr = safeAnchor.format('YYYY-MM-DD');
      const planIdRaw = String(input.planId ?? '').trim();

      const plan = await ctx.planQuery.findCoachPlanSnapshot({
        userId: userId!,
        ...(planIdRaw ? { planId: planIdRaw } : { status: 'ACTIVE' }),
        ...(planIdRaw ? {} : { orderBy: { activatedAt: 'desc' } }),
      });

      if (!plan) {
        return {
          kind: 'plan_day_view',
          date: dateStr,
          plan: null,
          weekIndex: null,
          dayIndex: null,
          dayOffset: null,
          outsidePlanRange: true,
          workouts: [],
        };
      }

      const idx = getPlanAnchorDayIndex(plan, safeAnchor);
      // The lightweight snapshot is enough for model reasoning, but the UI card
      // needs the canonical parsed structure. Reuse the same normalized plan
      // representation as the calendar instead of exposing internal workout DSL.
      const detail = await ctx.planService.getPlanDetail(userId!, plan.id);
      const workoutsRaw = Array.isArray(detail.plan?.workouts)
        ? detail.plan.workouts
        : Array.isArray(plan.workouts)
          ? plan.workouts
          : [];
      const summaries = workoutsRaw.map(summarizePlanWorkoutRow);
      const dayWorkouts =
        idx.dayOffset == null
          ? []
          : summaries.filter((w) => w.dayOffset === idx.dayOffset);

      return {
        kind: 'plan_day_view',
        date: dateStr,
        plan: {
          id: plan.id,
          title: plan.title,
          status: String(plan.status ?? ''),
          periodWeeks: plan.periodWeeks ?? 0,
          startDate: plan.startDate
            ? dayjs(plan.startDate).format('YYYY-MM-DD')
            : null,
        },
        weekIndex: idx.weekIndex,
        dayIndex: idx.dayIndex,
        dayOffset: idx.dayOffset,
        outsidePlanRange: idx.dayOffset == null,
        workouts: dayWorkouts,
      };
    },
  });
