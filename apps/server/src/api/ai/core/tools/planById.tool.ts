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
  planId: string;
  asOf?: string;
  includeAllWorkouts?: boolean;
};

export const planByIdTool: AiToolDef<Input, PlanSnapshotToolOutput> = buildAiTool(
  {
    name: 'plan.by_id',
    aliases: ['plan_by_id', 'get_plan_by_id', 'saved_plan'],
    description:
      'Load a specific training plan by id for the signed-in user (any status: DRAFT, ACTIVE, PAUSED, etc.). Same snapshot shape as plan.active. Use when the user opened a plan detail or plan-followup seed provides planId — do not use plan.active for arbitrary plan ids.',
    cost: 'low',
    searchHint: 'plan by id draft saved plan user',
    isEnabled: async (ctx) => hasSignedInUser(ctx),
    maxResultChars: 16_000,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['planId'],
      properties: {
        planId: {
          type: 'string',
          description: 'The plan id (cuid) for this user.',
        },
        asOf: {
          type: 'string',
          description:
            'Optional anchor date in YYYY-MM-DD. Defaults to server today.',
        },
        includeAllWorkouts: {
          type: 'boolean',
          description:
            'Include every workout in this plan. Use for full plan/cycle review only.',
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
      const planId = String(input.planId ?? '').trim();
      const asOf = input.asOf ? dayjs(input.asOf) : dayjs();
      const anchor = asOf.isValid()
        ? asOf.startOf('day')
        : dayjs().startOf('day');
      const tomorrow = anchor.add(1, 'day');

      if (!planId) {
        return emptyPlanSnapshotOutput(anchor, tomorrow);
      }

      const plan = await ctx.planQuery.findCoachPlanSnapshot({
        userId: userId!,
        planId,
        includeCoachSummary: true,
      });

      if (!plan) {
        return emptyPlanSnapshotOutput(anchor, tomorrow);
      }

      return buildPlanSnapshotFromRow(plan, input, anchor, tomorrow);
    },
  },
);
