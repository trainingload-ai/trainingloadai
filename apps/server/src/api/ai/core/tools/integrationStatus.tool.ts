import type { ThirdPartyProviderId } from '@shared/third-party-integration';
import { THIRD_PARTY_PROVIDER_IDS } from '@deployment/provider-catalog';
import type { ExternalProviderStatusSnapshot } from '@/integrations/external-provider/external-provider-status-query.service';
import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  provider?: ThirdPartyProviderId;
};

type Output = {
  kind: 'integration_status';
  asOf: string;
  directionSemantics: {
    import: 'third_party_to_trainingload';
    export: 'trainingload_to_third_party';
  };
  statuses: ExternalProviderStatusSnapshot[];
};

export const integrationStatusTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'integration.status',
  description:
    "Fetch the authoritative signed-in user's third-party integration state: product support, effective capabilities after environment/OAuth permissions, the user's own sync settings, connection state, operation readiness, and public sync error state. Call this before answering whether activities or planned workouts can sync, import, export, or reach a device.",
  cost: 'low',
  searchHint:
    'third party integration connection sync import export planned workouts device',
  applicableSkills: [
    'integration-support',
    'readiness-check',
    'week-review',
    'plan-day-review',
    'plan-week-review',
    'period-review',
    'plan-builder',
    'plan-followup',
    'plan-cycle-review',
    'workout-management',
  ],
  isEnabled: async (ctx) =>
    hasSignedInUser(ctx) && Boolean(ctx.integrationStatus),
  maxResultChars: 12_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      provider: {
        type: 'string',
        enum: [...THIRD_PARTY_PROVIDER_IDS],
        description:
          'Optional canonical provider id. Omit to inspect all supported providers.',
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => output,
  execute: async (ctx, input) => {
    const userId = ctx.session.user.id;
    const statuses = await ctx.integrationStatus!.listForUser(
      userId,
      input.provider,
    );
    return {
      kind: 'integration_status',
      asOf: new Date().toISOString(),
      directionSemantics: {
        import: 'third_party_to_trainingload',
        export: 'trainingload_to_third_party',
      },
      statuses,
    };
  },
});
