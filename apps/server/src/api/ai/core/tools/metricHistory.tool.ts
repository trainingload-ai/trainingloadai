import {
  aiToolError,
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  metric: string;
  source?: 'auto' | 'manual';
  sportType?: string;
  from?: string;
  to?: string;
  limit?: number;
};

type HistoryPoint = {
  id: string;
  date: string;
  value: number;
};

type Output = {
  metric: string;
  category: 'body' | 'fitness';
  resolvedMetricType: string;
  source: 'body' | 'auto' | 'manual';
  sportType?: string;
  unit?: string;
  range: {
    from?: string;
    to?: string;
  };
  truncated: boolean;
  summary: {
    count: number;
    start?: { date: string; value: number };
    latest?: { date: string; value: number };
    previous?: { date: string; value: number };
    deltaFromStart?: number;
    deltaFromStartPct?: number;
    deltaFromPrevious?: number;
    deltaFromPreviousPct?: number;
    min?: number;
    max?: number;
    avg?: number;
  };
  points: HistoryPoint[];
};

export const metricHistoryTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'metric.history',
  description:
    'Fetch signed-in user metric history for body or fitness metrics. Use this for weight, VO2max, FTP, eFTP, CP, eCP, LTHR, max HR, and similar trend questions.',
  cost: 'low',
  searchHint: 'metric trend history changes over time',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 8_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['metric'],
    properties: {
      metric: {
        type: 'string',
        description:
          'Metric to query: weight, vo2Max, ftp, eftp, cp, ecp, lthr, maxHr, restingHr, pMax, tp, or cs.',
      },
      source: {
        type: 'string',
        description:
          'Optional only for sport profile metrics such as ftp/cp: auto or manual. Ignored when the metric itself already implies the source, such as eftp or vo2Max.',
      },
      sportType: {
        type: 'string',
        description:
          'Optional sport type for sport-specific metrics: RUN, CYCLING, SWIM, run, cycle, swim.',
      },
      from: { type: 'string', description: 'Optional start date YYYY-MM-DD' },
      to: { type: 'string', description: 'Optional end date YYYY-MM-DD' },
      limit: {
        type: 'number',
        description: 'Max points returned, default 24, max 120',
      },
    },
  },
  validateInput: async (_ctx, input) =>
    String(input?.metric ?? '').trim()
      ? { ok: true }
      : aiToolError('Missing metric name', 'INVALID_INPUT'),
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => ({
    metric: output.metric,
    category: output.category,
    resolvedMetricType: output.resolvedMetricType,
    source: output.source,
    sportType: output.sportType,
    unit: output.unit,
    range: output.range,
    truncated: output.truncated,
    summary: output.summary,
    recentPoints: output.points.slice(-24),
  }),
  execute: async (ctx, input) => ctx.coachTools.metricHistory(ctx, input),
});
