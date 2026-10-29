import dayjs = require('dayjs');
import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import {
  buildPlanSnapshotFromRow,
  emptyPlanSnapshotOutput,
  type PlanSnapshotToolOutput,
} from './plan-snapshot.shared';

type Input = {
  asOf?: string;
  includeAllWorkouts?: boolean;
};

/**
 * Load the plan that best represents the athlete's latest execution evidence.
 * An active cycle is always preferred; otherwise the newest completed cycle is
 * used. Draft, paused, and cancelled plans must not silently replace execution
 * history.
 */
export const planRecentTool: AiToolDef<Input, PlanSnapshotToolOutput> =
  buildAiTool({
    name: 'plan.recent',
    aliases: ['recent_plan', 'latest_executed_plan', 'previous_plan'],
    description:
      'Load the most relevant executed training plan for the signed-in user: the current ACTIVE plan when one exists, otherwise the latest COMPLETED plan, including its frozen cycle review. Use when the user says current/previous/recent plan without providing a plan id. Do not use for a named plan id; use plan.by_id.',
    cost: 'low',
    searchHint:
      'current previous recent completed plan training cycle execution review',
    isEnabled: async (ctx) => hasSignedInUser(ctx),
    maxResultChars: 16_000,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        asOf: {
          type: 'string',
          description:
            'Optional anchor date in YYYY-MM-DD. Defaults to server today.',
        },
        includeAllWorkouts: {
          type: 'boolean',
          description:
            'Include every workout in the selected plan. Use for full plan/cycle review.',
        },
      },
    },
    checkPermissions: async (ctx) => requireSignedInUser(ctx),
    summarizeForModel: ({ output }) => ({
      asOf: output.asOf,
      plan: output.plan,
      today: output.today,
      tomorrow: output.tomorrow,
      currentWeek: output.currentWeek,
      allWorkouts: output.allWorkouts?.slice(0, 80),
    }),
    execute: async (ctx, input) => {
      const userId = ctx.session?.user?.id;
      const asOf = input.asOf ? dayjs(input.asOf) : dayjs();
      const anchor = asOf.isValid()
        ? asOf.startOf('day')
        : dayjs().startOf('day');
      const tomorrow = anchor.add(1, 'day');

      const activePlan = await ctx.planQuery.findCoachPlanSnapshot({
        userId: userId!,
        status: 'ACTIVE',
        orderBy: [{ activatedAt: 'desc' }, { updatedAt: 'desc' }],
        includeCoachSummary: true,
      });
      const plan =
        activePlan ??
        (await ctx.planQuery.findCoachPlanSnapshot({
          userId: userId!,
          status: 'COMPLETED',
          orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
          includeCoachSummary: true,
        }));

      if (!plan) return emptyPlanSnapshotOutput(anchor, tomorrow);
      return buildPlanSnapshotFromRow(plan, input, anchor, tomorrow);
    },
  });
