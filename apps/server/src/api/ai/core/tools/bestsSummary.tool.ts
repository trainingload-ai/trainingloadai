import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  sportType?: string;
  from?: string;
  to?: string;
  mode?: 'distance' | 'time';
  targets?: number[];
  limitPerTarget?: number;
};

type BestEntry = {
  key: string;
  paceSec: number;
  timeSec: number;
  paceBaseM: number;
  activityId?: string;
  activityTime?: string;
  topResults: Array<{
    paceSec: number;
    timeSec: number;
    paceBaseM: number;
    activityId?: string;
    activityTime?: string;
  }>;
};

type Output = {
  sportType: string;
  mode: 'distance' | 'time';
  range: {
    from?: string;
    to?: string;
  };
  itemCount: number;
  items: BestEntry[];
};

export const bestsSummaryTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'bests.summary',
  description:
    'Fetch best distance or fixed-time performance summaries for the signed-in user. Use this for best 5k, 10k, marathon, or best distance in 60 minutes style questions.',
  cost: 'medium',
  searchHint: 'personal best pr best distance best 5k 10k pace',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 3_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sportType: {
        type: 'string',
        description:
          'Optional sport type: RUN, CYCLING, SWIM. Defaults to RUN.',
      },
      from: { type: 'string', description: 'Optional start date YYYY-MM-DD.' },
      to: { type: 'string', description: 'Optional end date YYYY-MM-DD.' },
      mode: {
        type: 'string',
        description:
          'distance for best times over standard distances, time for best distances over fixed durations.',
      },
      targets: {
        type: 'array',
        description:
          'Optional custom targets. In distance mode use meters; in time mode use seconds.',
      },
      limitPerTarget: {
        type: 'number',
        description:
          'How many top results to keep per target, default 1, max 5.',
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => ({
    sportType: output.sportType,
    mode: output.mode,
    range: output.range,
    itemCount: output.itemCount,
    items: output.items.slice(0, 6).map((item) => ({
      key: item.key,
      paceSec: item.paceSec,
      timeSec: item.timeSec,
      activityId: item.activityId,
      activityTime: item.activityTime,
      topResult: item.topResults[0]
        ? {
            paceSec: item.topResults[0].paceSec,
            timeSec: item.topResults[0].timeSec,
            activityId: item.topResults[0].activityId,
            activityTime: item.topResults[0].activityTime,
          }
        : null,
    })),
  }),
  execute: async (ctx, input) => ctx.coachTools.bestsSummary(ctx, input),
});
