import {
  aiToolError,
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import { SportType } from '@prisma/client';

type Output = {
  kind: 'profile_zones';
  timezone?: string | null;
  heartRateZoneModel?: string | null;
  maxHeartRate?: number | null;
  restingHeartRate?: number | null;
  lthr?: number | null;
  ftp?: number | null;
  cp?: number | null;
  weight?: number | null;
  zoneAvailability?: {
    hasHeartRateZones: boolean;
    hasPaceZones: boolean;
    hasPowerZones: boolean;
  };
  zoneStatus?: {
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
};

export const zonesProfileTool: AiToolDef<{ sportType?: string }, Output> =
  buildAiTool({
    name: 'profile.zones',
    description:
      'Fetch sport-specific zone availability/threshold profile (defaults to RUN). For actual zone benchmark, model and automatic-update state use profile.zone_ranges; never infer a named model from zone count.',
    cost: 'low',
    searchHint: 'user zones thresholds',
    isEnabled: async (ctx) => hasSignedInUser(ctx),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sportType: { type: 'string', enum: Object.values(SportType) },
      },
    },
    validateInput: (_ctx, input) =>
      input.sportType !== undefined &&
      !Object.values(SportType).includes(input.sportType as SportType)
        ? aiToolError('Invalid sportType', 'INVALID_INPUT')
        : { ok: true },
    checkPermissions: async (ctx) => requireSignedInUser(ctx),
    execute: async (ctx, input) => {
      const data = await ctx.coachTools.zonesProfile(ctx, input);
      return { kind: 'profile_zones' as const, ...data };
    },
  });
