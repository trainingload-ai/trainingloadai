import {
  aiToolError,
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  metric: string;
  sportType?: string;
};

type Output = {
  metric: string;
  compareKey: string;
  unit?: string;
  sportType: string | null;
  estimatedOnly: boolean;
  manualCurrent: {
    value: number;
    recordedAt: string | null;
  } | null;
  estimatedCurrent: {
    value: number;
    recordedAt: string | null;
  } | null;
  automaticCurrent: {
    value: number;
    recordedAt: string | null;
  } | null;
  delta: number | null;
  deltaPct: number | null;
  effectiveCurrent: number | null;
  effectiveSource: 'MANUAL' | 'AUTO' | 'ESTIMATED' | null;
  effectiveRecordedAt: string | null;
  autoUpdate: {
    supported: boolean;
    enabled: boolean | null;
    behavior: string;
  };
};

export const metricCompareTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'metric.compare',
  description:
    'Compare manual, estimated, and AUTO-applied values for one metric family and return the authoritative effective value/source/date plus auto-update state. Manual is not necessarily effective when a newer AUTO record exists.',
  cost: 'low',
  searchHint: 'compare ftp vs eftp cp vs ecp manual vs estimated',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 4_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['metric'],
    properties: {
      metric: {
        type: 'string',
        description:
          'Metric family to compare, for example ftp, eftp, cp, ecp, vo2Max, lthr, maxHr, restingHr, pMax, tp, or cs.',
      },
      sportType: {
        type: 'string',
        description:
          'Optional sport type for sport-specific metrics: RUN, CYCLING, SWIM.',
      },
    },
  },
  validateInput: async (_ctx, input) =>
    String(input?.metric ?? '').trim()
      ? { ok: true }
      : aiToolError('Missing metric name', 'INVALID_INPUT'),
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  execute: async (ctx, input) => ctx.coachTools.metricCompare(ctx, input),
});
