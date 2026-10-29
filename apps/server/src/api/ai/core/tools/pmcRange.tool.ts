import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  granularity?: 'day' | 'week';
};

type Output = {
  kind: 'pmc_range';
  from: string;
  to: string;
  granularity: 'day' | 'week';
  points: Array<{
    date: string; // start of day/week
    dailyValue?: number;
    ATL?: number;
    CTL?: number;
    TSB?: number;
  }>;
  summary: {
    activeDays: number;
    restDays: number;
    totalLoad: number;
    avgDailyLoad: number;
  };
};

export const pmcRangeTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'pmc.range',
  description:
    'Query PMC (ATL/CTL/TSB and load) for a date range. Returns daily points for short ranges, otherwise weekly aggregation.',
  cost: 'low',
  searchHint: 'date range pmc load',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['from', 'to'],
    properties: {
      from: { type: 'string', description: 'Start date YYYY-MM-DD' },
      to: { type: 'string', description: 'End date YYYY-MM-DD' },
      granularity: { type: 'string', description: 'day or week (optional)' },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  execute: async (ctx, input) => {
    const data = await ctx.coachTools.pmcRange(ctx, input);
    return { kind: 'pmc_range' as const, ...data };
  },
});
