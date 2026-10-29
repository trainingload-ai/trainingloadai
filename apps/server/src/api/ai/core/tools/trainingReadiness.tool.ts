import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  asOf?: string;
  sportType?: string;
};

type WindowSummary = {
  totalLoad: number;
  avgDailyLoad: number;
  activeDays: number;
};

type RecentActivity = {
  hashId: string;
  sportType: string;
  startTime?: string;
  durationMin?: number;
  distanceKm?: number;
  avgHr?: number;
  avgPower?: number;
  load?: number;
};

type Output = {
  asOf: string;
  sportType?: string;
  loadField: 'dailyValue' | 'runningValue' | 'cyclingValue' | 'swimmingValue';
  latestAvailableDate?: string;
  current: {
    ATL?: number;
    CTL?: number;
    TSB?: number;
    AC_ratio?: number;
  };
  windows: {
    last7: WindowSummary;
    last14: WindowSummary;
    last28: WindowSummary;
  };
  deltas: {
    load7VsPrev7: number;
    load14VsPrev14: number;
    load28VsPrev28: number;
  };
  week: {
    currentLoad: number;
    previousLoad: number;
    delta: number;
    deltaPct?: number;
  };
  recentActivities: RecentActivity[];
};

export const trainingReadinessTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'training.readiness',
  description:
    'Fetch a compact readiness snapshot for the signed-in athlete: latest ATL/CTL/TSB, rolling 7/14/28 day load, week-over-week load, and recent sessions.',
  cost: 'low',
  searchHint: 'fatigue readiness snapshot',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      asOf: {
        type: 'string',
        description: 'Optional anchor date in YYYY-MM-DD. Defaults to today.',
      },
      sportType: {
        type: 'string',
        description:
          'Optional sport filter: RUN, CYCLING, SWIM, run, cycle, swim.',
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  execute: async (ctx, input) => ctx.coachTools.trainingReadiness(ctx, input),
});
