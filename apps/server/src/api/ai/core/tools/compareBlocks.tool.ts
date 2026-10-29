import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Period = { from: string; to: string };
type Input = { periodA: Period; periodB: Period };

type ZoneSummary = {
  zoneType: 'HEART_RATE' | 'POWER';
  totals: Array<{ name: string; duration_s: number; percent: number }>;
};

type Output = {
  periodA: {
    from: string;
    to: string;
    days: number;
    totalLoad: number;
    activeDays: number;
  };
  periodB: {
    from: string;
    to: string;
    days: number;
    totalLoad: number;
    activeDays: number;
  };
  delta: {
    totalLoad: number;
    activeDays: number;
    avgDailyLoad: number;
  };
  zones?: {
    periodA: ZoneSummary[];
    periodB: ZoneSummary[];
  };
};

export const compareBlocksTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'compare.blocks',
  description:
    'Compare two time blocks (A vs B) for training load and intensity distribution (HR/Power zones). Uses already processed activity and PMC data.',
  cost: 'medium',
  searchHint: 'compare training blocks',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['periodA', 'periodB'],
    properties: {
      periodA: {
        type: 'object',
        required: ['from', 'to'],
        additionalProperties: false,
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD' },
        },
      },
      periodB: {
        type: 'object',
        required: ['from', 'to'],
        additionalProperties: false,
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD' },
        },
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => ({
    ...output,
    evidenceScope: {
      kind: 'observational_load_comparison',
      equalWindowDays: output.periodA.days === output.periodB.days,
      zoneBasisComparability: 'not_verified',
      fitnessChangeEstablished: false,
      limits: [
        'Load deltas are not fitness or recovery changes.',
        'Zone totals do not include matched historical thresholds, boundaries and denominators; do not assume like-for-like percentages.',
      ],
    },
  }),
  execute: async (ctx, input) => ctx.coachTools.compareBlocks(ctx, input),
});
