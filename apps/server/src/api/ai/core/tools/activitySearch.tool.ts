import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  text?: string;
  sportType?: string;
  from?: string;
  to?: string;
  limit?: number;
  sortBy?: 'startTime' | 'distance' | 'duration' | 'load';
  order?: 'asc' | 'desc';
};

type Output = {
  items: Array<{
    hashId: string;
    activityName?: string;
    description?: string;
    sportType?: string;
    startTime?: string;
    durationMin?: number;
    distanceKm?: number;
    avgHr?: number;
    avgPower?: number;
    load?: number;
  }>;
};

export const activitySearchTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'activity.search',
  description:
    'Search and rank the signed-in user’s activities by date range, sport type, text, and sort order. Use this to find a workout before calling activity.byHashId.',
  cost: 'low',
  searchHint: 'find workout by date',
  maxResultChars: 2_500,
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: {
        type: 'string',
        description: 'Optional text search over activity name or description',
      },
      sportType: { type: 'string', description: 'Optional sport type filter' },
      from: { type: 'string', description: 'Optional start date YYYY-MM-DD' },
      to: { type: 'string', description: 'Optional end date YYYY-MM-DD' },
      limit: { type: 'number', description: 'Max results, default 8, max 20' },
      sortBy: {
        type: 'string',
        description: 'Sort by startTime, distance, duration, or load',
      },
      order: { type: 'string', description: 'asc or desc' },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => ({
    itemCount: output.items.length,
    items: output.items.slice(0, 6).map((item) => ({
      hashId: item.hashId,
      activityName: item.activityName,
      sportType: item.sportType,
      startTime: item.startTime,
      durationMin: item.durationMin,
      distanceKm: item.distanceKm,
      load: item.load,
    })),
  }),
  execute: async (ctx, input) => ctx.coachTools.activitySearch(ctx, input),
});
