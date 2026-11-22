import {
  aiToolError,
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import type { UnifiedActivityAnalysisInput } from '../../dto/ai.type';
import { COACH_ACTIVITY_SECTIONS, readCoachActivityFocus, type CoachActivityFocus, type CoachActivitySection } from '@shared/ai-coach-schema';

type Input = { hashId: string; section?: CoachActivitySection; focus?: CoachActivityFocus };

export const activityByHashIdTool: AiToolDef<
  Input,
  UnifiedActivityAnalysisInput
> = buildAiTool({
  name: 'activity.byHashId',
  description:
    'Fetch an already-processed activity summary (metrics, zones, load) by activityHashId for the signed-in user.',
  cost: 'low',
  searchHint: 'specific workout details',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['hashId'],
    properties: {
      hashId: { type: 'string', description: 'Activity hash id' },
      section: {
        type: 'string', enum: [...COACH_ACTIVITY_SECTIONS],
        description: 'Attach a clickable detail card when opening a known activity.',
      },
      focus: {
        type: 'object', additionalProperties: false,
        description: 'An explicitly requested lap number or length from the finish. Use with timeline. Supply exactly one; the client resolves it using recorded laps or distance.',
        properties: { lap: { type: 'integer', minimum: 1 }, lastMeters: { type: 'number', exclusiveMinimum: 0 } },
      },
    },
  },
  validateInput: async (ctx, input) => {
    if (!String(input?.hashId ?? '').trim()) return aiToolError(
      ctx.i18n.t('common.error.missing_activity_id') || 'Missing activity id', 'INVALID_INPUT',
    );
    if (input.focus && (input.section !== 'timeline' || !readCoachActivityFocus(input.focus))) {
      return aiToolError('Use either a lap or a positive lastMeters range with the timeline', 'INVALID_INPUT');
    }
    return { ok: true };
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => ({
    evidenceScope: {
      kind: 'single_activity_summary',
      segmentSpecific: false,
      matchedComparisonEstablished: false,
      limits: [
        'Whole-activity aggregates do not establish segment technique or a causal explanation.',
        'Use pace.average_sec_per_km for average pace; zone boundaries are not average pace. Missing heart rate means unmeasured, never low heart rate or Z1. Explain load using activity_fatigue.source; PACE is pace-based (GOVSS for running), not TRIMP. Never attribute load differences to heart rate without measured heart rate.',
        'Fitness change requires comparable repeated evidence, not just a faster outdoor session.',
      ],
    },
    sportType: output.sportType,
    start_time: output.start_time,
    duration_min: output.duration_min,
    distance_km: output.distance_km,
    ascent_m: output.ascent_m,
    descent_m: output.descent_m,
    calories: output.calories,
    hr: {
      available: output.hr?.available,
      avg: output.hr?.avg,
      max: output.hr?.max,
      zone_type: output.hr?.zone_type,
      primary_zone: output.hr?.primary_zone,
      pwHr: output.hr?.pwHr,
      paHr: output.hr?.paHr,
    },
    power: {
      avg: output.power?.avg,
      max: output.power?.max,
      zone_type: output.power?.zone_type,
      primary_zone: output.power?.primary_zone,
      coggan: output.power?.coggan,
      skiba: output.power?.skiba,
    },
    pace: output.pace,
    cadence: output.cadence,
    estimate: output.estimate,
    activity_fatigue: output.activity_fatigue,
    historical_load: output.historical_load,
    user_baseline: output.user_baseline,
  }),
  execute: async (ctx, input) =>
    await ctx.coachTools.activityByHashId(ctx, input),
});
