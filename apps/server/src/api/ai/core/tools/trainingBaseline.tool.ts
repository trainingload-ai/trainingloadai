import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  asOf?: string;
  sportType?: string;
  weeks?: number;
  excludeCurrentWeek?: boolean;
};

type WeekBaseline = {
  from: string;
  to: string;
  isoWeek: number;
  isoWeekYear: number;
  totalLoad: number;
  activeDays: number;
  activityCount: number;
  totalDurationMin: number;
  totalDistanceKm: number;
  longestSessionMin: number;
  longestDistanceKm: number;
};

type Output = {
  sportType?: string;
  loadField: 'dailyValue' | 'runningValue' | 'cyclingValue' | 'swimmingValue';
  anchorDate: string;
  range: {
    from: string;
    to: string;
    weeks: number;
    excludedCurrentWeek: boolean;
  };
  coverage: {
    pmcDays: number;
    activityCount: number;
    weeksWithLoad: number;
    weeksWithActivities: number;
  };
  /** Machine-readable signal for plan-builder gating: none = cold start, sparse = weak history, adequate = usable baseline. */
  personalizationReadiness: 'none' | 'sparse' | 'adequate';
  averageWeek: {
    totalLoad: number;
    activeDays: number;
    activityCount: number;
    totalDurationMin: number;
    totalDistanceKm: number;
  };
  activeWeekAverage: {
    totalLoad: number;
    activeDays: number;
    activityCount: number;
    totalDurationMin: number;
    totalDistanceKm: number;
  } | null;
  peakWeek: WeekBaseline | null;
  longestSession: {
    durationMin: number;
    distanceKm: number;
    date?: string;
    activityName?: string;
  } | null;
  trend: {
    firstHalfAvgLoad: number;
    secondHalfAvgLoad: number;
    loadDelta: number;
    loadDeltaPct?: number;
  } | null;
  weeks: WeekBaseline[];
};

export const trainingBaselineTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'training.baseline',
  description:
    'Summarize the signed-in user’s recent completed training weeks as a planning baseline: average weekly load, active days, session count, duration, distance (km), longest session, peak week, and load trend. Call this before drafting plans — weekly volume, frequency, and longest run should be read from here, not asked again from the user when data exists.',
  cost: 'medium',
  searchHint:
    'recent training baseline weekly volume sessions longest run plan',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 4_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      asOf: {
        type: 'string',
        description:
          'Optional anchor date in YYYY-MM-DD. Defaults to server today.',
      },
      sportType: {
        type: 'string',
        description: 'Optional sport filter: RUN, CYCLING, SWIM.',
      },
      weeks: {
        type: 'number',
        description:
          'Number of recent weeks to summarize. Defaults to 4, minimum 2, maximum 8.',
      },
      excludeCurrentWeek: {
        type: 'boolean',
        description:
          'Whether to exclude the current possibly incomplete ISO week. Defaults to true.',
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => ({
    sportType: output.sportType,
    loadField: output.loadField,
    anchorDate: output.anchorDate,
    range: output.range,
    coverage: output.coverage,
    personalizationReadiness: output.personalizationReadiness,
    averageWeek: output.averageWeek,
    activeWeekAverage: output.activeWeekAverage,
    peakWeek: output.peakWeek,
    longestSession: output.longestSession,
    trend: output.trend,
    // 仅保留最近关键周视图，避免把完整周序列塞回上下文窗口。
    recentWeeks: output.weeks.slice(-2),
  }),
  execute: async (ctx, input) => ctx.coachTools.trainingBaseline(ctx, input),
});
