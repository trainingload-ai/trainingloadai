import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import {
  toAgentTrainingDataCoverageSnapshot,
  type TrainingDataCoverageSnapshot,
} from '../training-data-coverage-query.service';

type Input = { windowDays?: number };

export const trainingDataCoverageTool: AiToolDef<
  Input,
  ReturnType<typeof toAgentTrainingDataCoverageSnapshot>
> = buildAiTool({
  name: 'training.data_coverage',
  description:
    "Inspect the signed-in athlete's authoritative training-data coverage before interpreting missing or zero load. Returns recent ready activities by source, pending activity processing, local import jobs, provider connection state, sync progress, and sync errors. This tool reports facts only; it does not decide whether the athlete rested.",
  cost: 'low',
  searchHint:
    'training data coverage missing activities sync pending import freshness zero load',
  applicableSkills: [
    'readiness-check',
    'week-review',
    'plan-day-review',
    'plan-week-review',
    'plan-cycle-review',
    'period-review',
  ],
  isEnabled: async (ctx) =>
    hasSignedInUser(ctx) && Boolean(ctx.trainingDataCoverage),
  maxResultChars: 16_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      windowDays: {
        type: 'integer',
        minimum: 7,
        maximum: 90,
        description: 'Coverage window in days. Defaults to 35.',
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => output,
  execute: async (ctx, input) => {
    const snapshot: TrainingDataCoverageSnapshot =
      await ctx.trainingDataCoverage!.snapshot({
        userId: ctx.session.user.id,
        windowDays: input.windowDays,
        now: ctx.currentTurnStartedAt,
      });
    return toAgentTrainingDataCoverageSnapshot(snapshot);
  },
});
