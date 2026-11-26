import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  sportType?: string;
  metrics?: string[];
};

type Output = {
  sportType: string;
  timezone: string | null;
  asOf: string;
  selectionPolicy: {
    effectiveSources: Array<'MANUAL' | 'AUTO'>;
    precedence: 'NEWEST_RECORDED_AT';
    tieBreaker: 'MANUAL';
    estimatedBehavior: string;
  };
  items: Array<{
    metric: string;
    compareKey?: string;
    source?: 'body';
    unit?: string;
    value?: number | null;
    manual?: number | null;
    estimated?: number | null;
    automatic?: number | null;
    effectiveCurrent?: number | null;
    displayPace?: string;
    dataIssue?: 'SPEED_OUT_OF_RANGE';
    effectiveSource?: 'MANUAL' | 'AUTO' | 'ESTIMATED' | null;
    effectiveRecordedAt?: string | null;
    autoUpdateSupported?: boolean;
    autoUpdateEnabled?: boolean | null;
    estimatedOnly?: boolean;
  }>;
};

export const metricCurrentTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'metric.current',
  description:
    'Fetch the authoritative current metric snapshot, including manual, estimated, AUTO-applied, effective value/source/date, auto-update state, and selection policy. Use the stated sport, effectiveCurrent, unit and displayPace for explanations. SPEED_OUT_OF_RANGE means the speed is unavailable for prescriptions.',
  cost: 'low',
  searchHint: 'current metrics snapshot ftp eftp vo2max weight',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 6_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sportType: {
        type: 'string',
        description:
          'Optional sport type for sport-specific metrics: RUN, CYCLING, SWIM.',
      },
      metrics: {
        type: 'array',
        description:
          'Optional metric list, for example ["ftp", "eftp", "vo2Max", "weight"]. Defaults to a useful snapshot set.',
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => ({
    sportType: output.sportType,
    timezone: output.timezone,
    asOf: output.asOf,
    selectionPolicy: output.selectionPolicy,
    items: output.items,
  }),
  execute: async (ctx, input) => ctx.coachTools.metricCurrent(ctx, input),
});
