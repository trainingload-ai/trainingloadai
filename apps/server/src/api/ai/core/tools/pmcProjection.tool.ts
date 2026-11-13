import type {
  PmcProjectionResult,
  PmcProjectionSelection,
} from '@shared/pmc-projection';
import {
  PMC_PROJECTION_SCENARIOS,
  PMC_PROJECTION_SCOPES,
} from '@shared/pmc-projection';
import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

export const pmcProjectionTool: AiToolDef<
  PmcProjectionSelection,
  PmcProjectionResult & { contextChanged: boolean }
> = buildAiTool({
  name: 'pmc.projection',
  description:
    'Read the signed-in athlete’s actual PMC baseline and conditional next-28-day CTL/ATL/TSB outlook from the same service as /pmc. AUTO uses scheduled loads and eligible habits for unscheduled days; HABIT ignores plans; REST assumes no additional training. Respect the requested sport and scenario. Missing load is not rest. A contextChanged result means the page result changed; explain the refreshed evidence. These are load scenarios, not predictions of race performance, physiology or guaranteed plan completion.',
  searchHint:
    'PMC future next month four weeks fitness fatigue form CTL ATL TSB projection 未来 四周 体能 疲劳 状态 推演',
  cost: 'low',
  maxResultChars: 18000,
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  checkPermissions: requireSignedInUser,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['scope', 'scenario', 'historyDays'],
    properties: {
      scope: { type: 'string', enum: [...PMC_PROJECTION_SCOPES] },
      scenario: { type: 'string', enum: [...PMC_PROJECTION_SCENARIOS] },
      historyDays: { type: 'integer', enum: [60, 90] },
      expectedProjectionId: {
        type: 'string',
        pattern: '^[a-f0-9]{64}$',
        description:
          'Page result reference from validated client selection, when present.',
      },
    },
  },
  execute: async (ctx, input) => {
    const result = await ctx.pmc.getProjection(ctx.session.user.id, input);
    return {
      ...result,
      contextChanged:
        !!input.expectedProjectionId &&
        input.expectedProjectionId !== result.projectionId,
    };
  },
  summarizeForModel: ({ output }) => ({
    ...output,
    history: output.history.slice(-14),
    omittedHistoricalDays: Math.max(0, output.history.length - 14),
  }),
});
