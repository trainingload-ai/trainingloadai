import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import { COACH_ACTIVITY_SECTIONS, type CoachActivitySection } from '@shared/ai-coach-schema';

type Input = {
  /** 日历日 YYYY-MM-DD */
  date: string;
  sportType?: string;
  section?: CoachActivitySection;
};

export type ActivityDayViewToolOutput = {
  kind: 'activity_day_view';
  date: string;
  section?: CoachActivitySection;
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
      'Completed logged activities on one athlete-local calendar date. Use to show or open an activity on a named date. Each matching activity is clickable. Specify section to open a requested analysis section. If multiple activities match, let the athlete choose.',
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
        section: { type: 'string', enum: [...COACH_ACTIVITY_SECTIONS] },
      },
    },
    checkPermissions: async (ctx) => requireSignedInUser(ctx),
    summarizeForModel: ({ output }) => ({
      date: output.date,
      count: output.items.length,
      items: output.items.slice(0, 15),
    }),
    execute: async (ctx, { date, sportType, section }) => ({
      ...(await ctx.coachTools.activitiesDayView(ctx, { date, sportType })),
      ...(section ? { section } : {}),
    }),
  });
