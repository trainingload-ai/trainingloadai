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

export const planActiveTool: AiToolDef<Input, PlanSnapshotToolOutput> = buildAiTool(
  {
    name: 'plan.active',
    aliases: ['active_plan', 'current_plan'],
    description:
      'Current **ACTIVE** plan only (latest activated). Today/tomorrow/current-week snapshot. **Do not use when the user or seed names a specific plan id** — use plan.by_id instead.',
    cost: 'low',
    searchHint: 'active plan today tomorrow week workouts',
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
            'Include every workout in the active plan. Use for full plan/cycle review only.',
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

      const plan = await ctx.planQuery.findCoachPlanSnapshot({
        userId: userId!,
        status: 'ACTIVE',
        orderBy: { activatedAt: 'desc' },
      });

      if (!plan) {
        return emptyPlanSnapshotOutput(anchor, tomorrow);
      }

      return buildPlanSnapshotFromRow(plan, input, anchor, tomorrow);
    },
  },
);
