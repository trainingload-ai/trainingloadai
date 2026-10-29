import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = { limit?: number; sportType?: string };

type Output = {
  kind: 'activity_recent';
  items: Array<{
    hashId: string;
    sportType: string;
    mapThumbnailUrl?: string;
    startTime?: string;
    durationMin?: number;
    distanceKm?: number;
    avgHr?: number;
    avgPower?: number;
    load?: number;
    loadSource?: string;
    tss?: number;
    trimp?: number;
    vo2max?: number;
  }>;
};

export const recentActivitiesTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'activity.recent',
  description: 'Fetch recent activities summaries for the signed-in user.',
  cost: 'low',
  searchHint: 'recent workouts summary',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'number', description: 'Max items (default 10, max 20)' },
      sportType: { type: 'string', description: 'Optional sport type filter' },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  execute: async (ctx, input) => {
    const base = await ctx.coachTools.recentActivities(ctx, input);
    return { kind: 'activity_recent' as const, ...base };
  },
});
