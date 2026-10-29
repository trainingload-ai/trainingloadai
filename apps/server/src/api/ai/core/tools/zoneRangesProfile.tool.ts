import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import type { CoachZoneBasis } from '../coach-zone-basis';

type FocusMetric = 'pace' | 'heartRate' | 'power';

type Input = {
  sportType?: string;
  /** Optional: which intensity tab the UI should open first when multiple metrics exist. */
  focusMetric?: FocusMetric;
};

type ZoneItem = {
  order: number;
  name?: string;
  min?: number;
  max?: number;
  color?: string;
};

type Output = {
  kind: 'profile_zone_ranges';
  sportType: string;
  focusMetric?: FocusMetric;
  pace: {
    basis?: CoachZoneBasis;
    configured: boolean;
    benchmark?: string | null;
    zones: ZoneItem[];
  };
  heartRate: {
    basis?: CoachZoneBasis;
    configured: boolean;
    benchmark?: string | null;
    zones: ZoneItem[];
  };
  power: {
    basis?: CoachZoneBasis;
    configured: boolean;
    benchmark?: string | null;
    zones: ZoneItem[];
  };
  /** Sport-aware preferred metric order before availability filtering. */
  priority: FocusMetric[];
  /** Preferred metric order filtered to metrics with configured/resolved zones. */
  availablePriority: FocusMetric[];
  /** First usable metric for DSL zone targets, or null when no zones exist. */
  recommendedMetric?: FocusMetric | null;
  unitHints: {
    pace: 'sec_per_meter';
    heartRate: 'bpm';
    power: 'watt';
  };
};

function normalizeFocusMetric(raw: unknown): FocusMetric | undefined {
  if (raw === 'pace' || raw === 'heartRate' || raw === 'power') return raw;
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (s === 'pace') return 'pace';
  if (s === 'power') return 'power';
  if (s === 'heartrate' || s === 'heart_rate' || s === 'hr') {
    return 'heartRate';
  }
  return undefined;
}

export const zoneRangesProfileTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'profile.zone_ranges',
  aliases: ['profile.zones.ranges', 'zone_ranges'],
  description:
    'Fetch resolved pace/heart-rate/power boundaries and their authoritative basis: explicit model, benchmark value/unit/source, current mode and auto-update setting. Saved/custom zone counts do not identify a named model.',
  cost: 'low',
  searchHint: 'resolved pace heart-rate power zone ranges',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 8_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sportType: {
        type: 'string',
        description:
          'Optional sport type for zone resolving: RUN, CYCLING, SWIM. Defaults to RUN.',
      },
      focusMetric: {
        type: 'string',
        enum: ['pace', 'heartRate', 'power'],
        description:
          'Optional: when the UI shows multiple zone types, open this tab first (e.g. match plan intensity).',
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => output,
  execute: async (ctx, input) => {
    const data = await ctx.coachTools.zoneRangesProfile(ctx, input);
    const focusMetric = normalizeFocusMetric(input.focusMetric);
    return {
      kind: 'profile_zone_ranges' as const,
      ...data,
      ...(focusMetric ? { focusMetric } : {}),
    };
  },
});
