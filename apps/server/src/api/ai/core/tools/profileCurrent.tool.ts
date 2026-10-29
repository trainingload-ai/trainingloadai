import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  sportType?: string;
};

type Output = {
  sportType: string;
  timezone: string | null;
  demographics: {
    age: number | null;
    gender: string | null;
  };
  body: {
    heightCm: number | null;
    weightKg: number | null;
  };
  zones: {
    heartRateModel: string | null;
    paceModel: string | null;
    powerModel: string | null;
  };
  zoneAvailability: {
    hasHeartRateZones: boolean;
    hasPaceZones: boolean;
    hasPowerZones: boolean;
  };
  zoneStatus: {
    heartRate: {
      configured: boolean;
      source: 'custom' | 'derived' | 'none';
      zoneCount: number;
    };
    pace: {
      configured: boolean;
      source: 'custom' | 'derived' | 'none';
      zoneCount: number;
    };
    power: {
      configured: boolean;
      source: 'custom' | 'derived' | 'none';
      zoneCount: number;
    };
  };
  loadSources: string[];
  altitude: {
    model: string | null;
    threshold: number | null;
  };
  runSpecific: {
    aerobicThresholdPaceSec: number | null;
    defaultVdotSource: string | null;
    vo2maxCorrectionFactor: number | null;
  } | null;
};

export const profileCurrentTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'profile.current',
  description:
    'Fetch the current signed-in athlete profile/context snapshot: timezone, load sources, zone models, and training configuration context.',
  cost: 'low',
  searchHint:
    'current athlete profile timezone zones load sources configuration',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 5_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sportType: {
        type: 'string',
        description:
          'Optional sport type for sport-specific profile values: RUN, CYCLING, SWIM.',
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => output,
  execute: async (ctx, input) => ctx.coachTools.profileCurrent(ctx, input),
});
