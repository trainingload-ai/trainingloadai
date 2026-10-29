import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  asOf?: string;
  sportType?: string;
  weekOffset?: number;
};

type ActivitySummary = {
  hashId: string;
  activityName?: string;
  sportType: string;
  startTime?: string;
  durationMin?: number;
  distanceKm?: number;
  avgHr?: number;
  avgPower?: number;
  load?: number;
};

type Output = {
  sportType?: string;
  loadField: 'dailyValue' | 'runningValue' | 'cyclingValue' | 'swimmingValue';
  anchorDate: string;
  week: {
    from: string;
    to: string;
    isoWeek: number;
    isoWeekYear: number;
  };
  summary: {
    totalLoad: number;
    avgDailyLoad: number;
    activeDays: number;
    restDays: number;
    ATL?: number;
    CTL?: number;
    TSB?: number;
    AC_ratio?: number;
    activityCount: number;
    totalDurationMin: number;
    totalDistanceKm: number;
    avgSessionDurationMin: number;
    longestSessionMin: number;
    longestDistanceKm: number;
    loadPerActiveDay: number;
  };
  comparison: {
    previousWeek: {
      from: string;
      to: string;
      totalLoad: number;
      activityCount: number;
      totalDurationMin: number;
      totalDistanceKm: number;
    };
    loadDelta: number;
    loadDeltaPct?: number;
    activityDelta: number;
    durationDeltaMin: number;
    distanceDeltaKm: number;
  };
  activities: ActivitySummary[];
};

export const trainingWeekSummaryTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'training.weekSummary',
  description:
    'Summarize one training week for the signed-in user, including load, ATL/CTL/TSB snapshot, session count, duration, distance, and comparison with the previous week.',
  cost: 'low',
  searchHint: 'weekly training summary this week last week load volume',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 6_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      asOf: {
        type: 'string',
        description:
          'Optional anchor date in YYYY-MM-DD. The returned week will contain this date unless weekOffset is set.',
      },
      sportType: {
        type: 'string',
        description: 'Optional sport filter: RUN, CYCLING, SWIM.',
      },
      weekOffset: {
        type: 'number',
        description:
          'Optional number of weeks back from the anchor week. 0 means current week.',
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => ({
    sportType: output.sportType,
    week: output.week,
    summary: output.summary,
    comparison: output.comparison,
    activities: output.activities.slice(0, 8),
  }),
  execute: async (ctx, input) => ctx.coachTools.trainingWeekSummary(ctx, input),
});
