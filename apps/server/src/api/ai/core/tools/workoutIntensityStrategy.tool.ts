import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  sportType?: string;
  workoutGoal?: string;
  asOf?: string;
  weeks?: number;
};

type FocusMetric = 'pace' | 'heartRate' | 'power';
type Expression = 'zone' | 'fixed' | 'duration_only';
type CoverageStatus = 'none' | 'sparse' | 'usable' | 'strong';

type Output = {
  kind: 'workout_intensity_strategy';
  sportType: string;
  workoutGoal: string;
  anchorDate: string;
  range: {
    from: string;
    to: string;
    weeks: number;
  };
  recentData: {
    activityCount: number;
    metrics: Record<
      FocusMetric,
      {
        activityCount: number;
        ratio: number;
        status: CoverageStatus;
        lastObservedAt?: string;
      }
    >;
  };
  thresholds: {
    pace: {
      tp?: number | null;
      cs?: number | null;
      vo2max?: number | null;
    };
    heartRate: {
      lthr?: number | null;
      maxHeartRate?: number | null;
      restingHeartRate?: number | null;
    };
    power: {
      ftp?: number | null;
      cp?: number | null;
    };
  };
  zoneHintsByGoal: {
    easy: string[];
    moderate: string[];
    hard: string[];
  };
  selectedZoneRanges: {
    metric: FocusMetric;
    benchmark?: string | null;
    unit: 'sec_per_meter' | 'bpm' | 'watt';
    zones: Array<{
      order: number;
      name?: string;
      min?: number;
      max?: number;
    }>;
  } | null;
  candidates: Array<{
    metric: FocusMetric;
    dslToken: 'pace' | 'hr' | 'power';
    sportPriorityIndex: number;
    hasZones: boolean;
    zoneCount: number;
    benchmark?: string | null;
    hasFixedAnchor: boolean;
    fixedAnchorSource?: string | null;
    recentCoverage: {
      activityCount: number;
      ratio: number;
      status: CoverageStatus;
      lastObservedAt?: string;
    };
    expressionOptions: Expression[];
    reliabilityScore: number;
    recommendationHint: 'prefer_zone' | 'prefer_fixed' | 'fallback_only';
    reasons: string[];
    cautions: string[];
    exampleZoneTargets: string[];
  }>;
  recommendation: {
    primaryMetric: FocusMetric | null;
    expression: Expression;
    fallbackOrder: FocusMetric[];
    dslExamples: string[];
    reasons: string[];
    notesGuidance: string[];
  };
  decisionRubric: string[];
};

export const workoutIntensityStrategyTool: AiToolDef<Input, Output> =
  buildAiTool({
    name: 'workout.intensity_strategy',
    aliases: ['workout_intensity_strategy', 'intensity.strategy'],
    description:
      'Evaluate which intensity prescription strategy to use for a generated workout: zone vs fixed values vs duration-only, and pace vs heart-rate vs power. It combines configured zones, profile thresholds, and recent activity metric coverage so the model can choose an executable anchor instead of relying on sport defaults.',
    cost: 'medium',
    searchHint:
      'workout intensity strategy zones fixed values pace heart-rate power recent data coverage',
    applicableSkills: [
      'plan-builder',
      'plan-followup',
      'fitness-assessment',
      'workout-management',
      'workout-generator',
    ],
    isEnabled: async (ctx) => hasSignedInUser(ctx),
    maxResultChars: 7_000,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sportType: {
          type: 'string',
          description:
            'Sport type for the workout family: RUN, CYCLING, or SWIM. Defaults to RUN.',
        },
        workoutGoal: {
          type: 'string',
          description:
            'Optional purpose of the workout family, e.g. recovery, endurance, tempo, threshold, vo2, anaerobic, race, or mixed.',
        },
        asOf: {
          type: 'string',
          description:
            'Optional anchor date in YYYY-MM-DD. Defaults to server today.',
        },
        weeks: {
          type: 'number',
          description:
            'How many recent weeks of activities to inspect for metric coverage. Defaults to 8, minimum 2, maximum 12.',
        },
      },
    },
    checkPermissions: async (ctx) => requireSignedInUser(ctx),
    summarizeForModel: ({ output }) => ({
      kind: output.kind,
      sportType: output.sportType,
      workoutGoal: output.workoutGoal,
      anchorDate: output.anchorDate,
      range: output.range,
      recentData: output.recentData,
      thresholds: output.thresholds,
      candidates: output.candidates.map((candidate) => ({
        metric: candidate.metric,
        dslToken: candidate.dslToken,
        hasZones: candidate.hasZones,
        zoneCount: candidate.zoneCount,
        benchmark: candidate.benchmark,
        hasFixedAnchor: candidate.hasFixedAnchor,
        fixedAnchorSource: candidate.fixedAnchorSource,
        recentCoverage: candidate.recentCoverage,
        expressionOptions: candidate.expressionOptions,
        reliabilityScore: candidate.reliabilityScore,
        recommendationHint: candidate.recommendationHint,
        exampleZoneTargets: candidate.exampleZoneTargets,
        cautions: candidate.cautions,
      })),
      recommendation: output.recommendation,
      zoneHintsByGoal: output.zoneHintsByGoal,
      selectedZoneRanges: output.selectedZoneRanges,
      decisionRubric: output.decisionRubric,
    }),
    execute: async (ctx, input) =>
      ctx.coachTools.workoutIntensityStrategy(ctx, input),
  });
