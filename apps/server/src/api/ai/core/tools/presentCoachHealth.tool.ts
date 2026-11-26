import {
  COACH_HEALTH_METRICS,
  COACH_HEALTH_MODES,
  type CoachHealthScope,
  type CoachHealthVisualization,
} from '@shared/ai-coach-schema';
import { HEALTH_HRV_TYPES } from '@shared/health-overview';
import { addCalendarDays } from '@shared/plan-calendar';
import {
  aiToolError,
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
} from '../tool.types';
import { coachHealthWindowDays, readCoachHealthVisualization } from '../coach-health-visualization';

type Input = Omit<CoachHealthScope, 'from' | 'to' | 'mode'> & {
  from?: string;
  to?: string;
  days?: number;
  mode?: CoachHealthScope['mode'];
  presentation?: 'SUMMARY' | 'CHART';
};

export const presentCoachHealthTool = buildAiTool<Input, CoachHealthVisualization>({
  name: 'present_coach_health',
  description: 'Show a personal sleep, HRV, resting HR or sleeping HR value or chart. Explicit absolute ranges use inclusive from and to. For today or a specific day set from and to to the same date. LATEST for a value, BASELINE for comparison to usual, CHART for an explicit request to plot. Does not provide all-day or workout heart rate.',
  cost: 'low',
  isEnabled: (ctx) => hasSignedInUser(ctx) && !!ctx.healthData,
  checkPermissions: requireSignedInUser,
  applicableSkills: ['training-analytics', 'metric-explainer', 'readiness-check', 'performance-review'],
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['metric'],
    properties: {
      metric: { type: 'string', enum: [...COACH_HEALTH_METRICS] },
      from: { type: 'string' },
      to: { type: 'string' },
      compareFrom: { type: 'string', description: 'Optional inclusive comparison range start.' },
      compareTo: { type: 'string', description: 'Optional inclusive comparison range end.' },
      days: { type: 'integer', minimum: 1, maximum: 90 },
      mode: { type: 'string', enum: [...COACH_HEALTH_MODES] },
      presentation: { type: 'string', enum: ['SUMMARY', 'CHART'] },
      hrvType: { type: 'string', enum: [...HEALTH_HRV_TYPES] },
      provider: { type: 'string', minLength: 1, maxLength: 64 },
      sleepValueKind: { type: 'string', enum: ['timeAsleep', 'timeInBed'] },
    },
  },
  validateInput: (_ctx, input) => {
    try {
      if ((input.from && !input.to) || (input.from && input.days != null) ||
        (input.hrvType && input.metric !== 'hrv') ||
        (input.sleepValueKind && input.metric !== 'sleep')) throw new Error('Invalid health query filters');
      if (input.to) coachHealthWindowDays(input.from ?? input.to, input.to);
      if (input.compareFrom || input.compareTo) coachHealthWindowDays(input.compareFrom ?? '', input.compareTo ?? '');
      return { ok: true };
    } catch (error) {
      return aiToolError((error as Error).message, 'INVALID_INPUT');
    }
  },
  summarizeForModel: ({ output }) => {
    const { chart, fingerprint, ...summary } = output;
    return summary;
  },
  execute: async (ctx, input) => {
    const mode = input.mode ?? (input.presentation === 'CHART' ? 'TREND' : 'LATEST');
    const today = ctx.currentTurnCalendar?.date ??
      (await ctx.coachTools.currentTime(ctx)).athleteLocalToday;
    const to = input.to ?? today;
    const defaultDays = mode === 'TREND' ? (input.metric === 'sleepHeartRate' ? 7 : 30)
      : mode === 'BASELINE' || (mode === 'LATEST' && ['sleep', 'sleepHeartRate'].includes(input.metric)) ? 1 : 7;
    const from = input.from ?? addCalendarDays(to, 1 - (input.days ?? defaultDays));
    if (to > today || (input.compareTo && input.compareTo > today)) {
      throw new Error('Health data is only available through the athlete-local current date');
    }
    return readCoachHealthVisualization(ctx.healthData!, ctx.session!.user.id, {
      metric: input.metric, from, to, mode,
      ...(input.hrvType ? { hrvType: input.hrvType } : {}),
      ...(input.provider ? { provider: input.provider.trim().toUpperCase() } : {}),
      ...(input.sleepValueKind ? { sleepValueKind: input.sleepValueKind } : {}),
      ...(input.compareFrom && input.compareTo ? { compareFrom: input.compareFrom, compareTo: input.compareTo } : {}),
    }, {
      chart: input.presentation === 'CHART',
      recent: to === today,
      observedAt: (ctx.currentTurnStartedAt ?? new Date()).toISOString(),
    });
  },
});
