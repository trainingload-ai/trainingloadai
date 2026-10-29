import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  /** 日历日 YYYY-MM-DD */
  date: string;
  sportType?: string;
};

export type ActivityDayViewToolOutput = {
  kind: 'activity_day_view';
  date: string;
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

export const activityDayViewTool: AiToolDef<Input, ActivityDayViewToolOutput> =
  buildAiTool({
    name: 'activity.day_view',
    aliases: ['activity_day_view', 'activities_on_day'],
    description:
      'Completed **logged activities** on one calendar day (YYYY-MM-DD). Use for “what did I do last Tuesday” or “sessions on May 10”. Not plan prescriptions — use plan.day_view for scheduled workouts.',
    cost: 'low',
    searchHint: 'activities on date day summary completed workouts',
    isEnabled: async (ctx) => hasSignedInUser(ctx),
    maxResultChars: 12_000,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['date'],
      properties: {
        date: {
          type: 'string',
          description: 'Calendar date YYYY-MM-DD.',
        },
        sportType: {
          type: 'string',
          description: 'Optional sport filter (e.g. RUN, CYCLING).',
        },
      },
    },
    checkPermissions: async (ctx) => requireSignedInUser(ctx),
    summarizeForModel: ({ output }) => ({
      date: output.date,
      count: output.items.length,
      items: output.items.slice(0, 15),
    }),
    execute: async (ctx, input) =>
      ctx.coachTools.activitiesDayView(ctx, {
        date: input.date,
        sportType: input.sportType,
      }),
  });
