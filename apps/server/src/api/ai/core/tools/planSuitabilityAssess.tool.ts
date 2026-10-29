import { randomUUID } from 'node:crypto';
import {
  aiToolError,
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Status = 'READY' | 'NEEDS_INPUT' | 'NEEDS_ADJUSTMENT';
type Sport = 'RUN' | 'CYCLING' | 'SWIM' | 'STRENGTH';

type Input = {
  status: Status;
  goalSummary: string;
  constraints: {
    intent:
      | 'HEALTH_FAT_LOSS'
      | 'FITNESS_BUILD'
      | 'RACE_PREP'
      | 'SKILL_FOCUS'
      | 'RETURN_TO_TRAINING';
    periodWeeks: number;
    maxTrainingDaysPerWeek: number;
    maxDailyMinutes: number;
    requiredSports: Sport[];
    strengthPreference: 'AUTO' | 'INCLUDE' | 'EXCLUDE';
    raceDiscipline?: 'RUN' | 'TRIATHLON' | 'CYCLING';
    raceDistance?: string;
  };
  evidence: Array<{
    source:
      | 'PLAN_BRIEF'
      | 'TRAINING_BASELINE'
      | 'USER_REPORTED_BASELINE'
      | 'READINESS'
      | 'CAPABILITY'
      | 'COMPETITION';
    summary: string;
  }>;
  blueprint?: {
    designSummary: string;
    sports: Sport[];
    weeklyTrainingDays: { min: number; max: number };
    longestPlannedSessionMinutes: number;
    phases: Array<{
      name: string;
      startWeek: number;
      endWeek: number;
      purpose: string;
    }>;
  };
  missingFacts?: Array<{ key: string; reason: string }>;
  scenarios?: Array<{
    id: string;
    title: string;
    recommended: boolean;
    preserves: string[];
    changes: string[];
    whySuitable: string;
    tradeoffs: string[];
  }>;
};

type Output = Input & {
  kind: 'plan_suitability_assessment';
  assessmentId: string;
};

const evidenceItemSchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['source', 'summary'],
  properties: {
    source: {
      type: 'string' as const,
      enum: [
        'PLAN_BRIEF',
        'TRAINING_BASELINE',
        'USER_REPORTED_BASELINE',
        'READINESS',
        'CAPABILITY',
        'COMPETITION',
      ],
    },
    summary: { type: 'string' as const, minLength: 1 },
  },
};

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function validateReady(input: Input) {
  const blueprint = input.blueprint;
  if (!blueprint) {
    return aiToolError(
      'READY requires a compact plan blueprint before full draft generation.',
      'PLAN_SUITABILITY_INVALID',
    );
  }
  if (
    input.constraints.intent === 'RACE_PREP' &&
    !input.evidence.some((item) =>
      ['TRAINING_BASELINE', 'USER_REPORTED_BASELINE'].includes(item.source),
    )
  ) {
    return aiToolError(
      'Race preparation cannot be READY without a recent or user-reported training baseline.',
      'PLAN_SUITABILITY_BASELINE_REQUIRED',
    );
  }
  if (
    blueprint.weeklyTrainingDays.min < 1 ||
    blueprint.weeklyTrainingDays.min > blueprint.weeklyTrainingDays.max ||
    blueprint.weeklyTrainingDays.max > input.constraints.maxTrainingDaysPerWeek
  ) {
    return aiToolError(
      'The blueprint training-day range exceeds the agreed weekly availability.',
      'PLAN_SUITABILITY_CONSTRAINT_CONFLICT',
    );
  }
  if (
    blueprint.longestPlannedSessionMinutes > input.constraints.maxDailyMinutes
  ) {
    return aiToolError(
      `The blueprint needs a ${blueprint.longestPlannedSessionMinutes}-minute key session but the agreed daily limit is ${input.constraints.maxDailyMinutes} minutes. Return NEEDS_ADJUSTMENT with coherent alternatives instead of drafting through the conflict.`,
      'PLAN_SUITABILITY_CONSTRAINT_CONFLICT',
    );
  }
  const sports = new Set(blueprint.sports);
  const missingSports = input.constraints.requiredSports.filter(
    (sport) => !sports.has(sport),
  );
  if (missingSports.length) {
    return aiToolError(
      `The blueprint omits required sports: ${missingSports.join(', ')}.`,
      'PLAN_SUITABILITY_CONSTRAINT_CONFLICT',
    );
  }

  const phases = [...blueprint.phases].sort(
    (a, b) => a.startWeek - b.startWeek || a.endWeek - b.endWeek,
  );
  if (!phases.length) {
    return aiToolError(
      'READY requires at least one plan phase.',
      'PLAN_SUITABILITY_INVALID',
    );
  }
  let expectedStart = 1;
  for (const phase of phases) {
    if (
      phase.startWeek !== expectedStart ||
      phase.endWeek < phase.startWeek ||
      phase.endWeek > input.constraints.periodWeeks
    ) {
      return aiToolError(
        'Blueprint phases must cover the requested cycle exactly once without gaps or overlaps.',
        'PLAN_SUITABILITY_CONSTRAINT_CONFLICT',
      );
    }
    expectedStart = phase.endWeek + 1;
  }
  if (expectedStart !== input.constraints.periodWeeks + 1) {
    return aiToolError(
      'Blueprint phases must cover every requested week.',
      'PLAN_SUITABILITY_CONSTRAINT_CONFLICT',
    );
  }
  return { ok: true as const };
}

function validateAdjustment(input: Input) {
  const scenarios = input.scenarios ?? [];
  if (scenarios.length < 2 || scenarios.length > 3) {
    return aiToolError(
      'NEEDS_ADJUSTMENT requires two or three coherent scenario packages.',
      'PLAN_SUITABILITY_INVALID',
    );
  }
  if (scenarios.filter((scenario) => scenario.recommended).length !== 1) {
    return aiToolError(
      'Exactly one adjustment scenario must be recommended.',
      'PLAN_SUITABILITY_INVALID',
    );
  }
  if (
    scenarios.some(
      (scenario) =>
        !scenario.changes.length ||
        !scenario.preserves.length ||
        !scenario.tradeoffs.length,
    )
  ) {
    return aiToolError(
      'Every adjustment scenario must state what it preserves, changes, and trades off.',
      'PLAN_SUITABILITY_INVALID',
    );
  }
  return { ok: true as const };
}

export const planSuitabilityAssessTool: AiToolDef<Input, Output> = buildAiTool({
  name: 'plan.suitability_assess',
  aliases: ['plan_feasibility_assess', 'plan_preflight'],
  description:
    'Assess the whole plan brief against athlete evidence before generating the large workout calendar. Submit one auditable READY, NEEDS_INPUT, or NEEDS_ADJUSTMENT judgment. READY requires a compact blueprint that fits every binding constraint. NEEDS_ADJUSTMENT must offer coherent multi-condition scenarios rather than changing one field merely to make generation pass.',
  searchHint:
    'plan suitability feasibility preflight blueprint constraints alternatives',
  applicableSkills: ['plan-builder'],
  cost: 'low',
  isReadOnly: true,
  isConcurrencySafe: false,
  maxResultChars: 8_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'goalSummary', 'constraints', 'evidence'],
    properties: {
      status: {
        type: 'string',
        enum: ['READY', 'NEEDS_INPUT', 'NEEDS_ADJUSTMENT'],
      },
      goalSummary: { type: 'string', minLength: 1 },
      constraints: {
        type: 'object',
        additionalProperties: false,
        required: [
          'intent',
          'periodWeeks',
          'maxTrainingDaysPerWeek',
          'maxDailyMinutes',
          'requiredSports',
          'strengthPreference',
        ],
        properties: {
          intent: {
            type: 'string',
            enum: [
              'HEALTH_FAT_LOSS',
              'FITNESS_BUILD',
              'RACE_PREP',
              'SKILL_FOCUS',
              'RETURN_TO_TRAINING',
            ],
          },
          periodWeeks: { type: 'integer', minimum: 1, maximum: 520 },
          maxTrainingDaysPerWeek: {
            type: 'integer',
            minimum: 1,
            maximum: 7,
          },
          maxDailyMinutes: {
            type: 'number',
            exclusiveMinimum: 0,
            maximum: 1440,
            description:
              'Maximum ordinary training-session time available to the athlete. It does not shorten the goal event and does not by itself make a race brief suitable.',
          },
          requiredSports: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: ['RUN', 'CYCLING', 'SWIM', 'STRENGTH'],
            },
          },
          strengthPreference: {
            type: 'string',
            enum: ['AUTO', 'INCLUDE', 'EXCLUDE'],
          },
          raceDiscipline: {
            type: 'string',
            enum: ['RUN', 'TRIATHLON', 'CYCLING'],
          },
          raceDistance: { type: 'string' },
        },
      },
      evidence: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: evidenceItemSchema,
      },
      blueprint: {
        type: 'object',
        additionalProperties: false,
        required: [
          'designSummary',
          'sports',
          'weeklyTrainingDays',
          'longestPlannedSessionMinutes',
          'phases',
        ],
        properties: {
          designSummary: { type: 'string', minLength: 1 },
          sports: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: ['RUN', 'CYCLING', 'SWIM', 'STRENGTH'],
            },
          },
          weeklyTrainingDays: {
            type: 'object',
            additionalProperties: false,
            required: ['min', 'max'],
            properties: {
              min: { type: 'integer', minimum: 1, maximum: 7 },
              max: { type: 'integer', minimum: 1, maximum: 7 },
            },
          },
          longestPlannedSessionMinutes: {
            type: 'number',
            exclusiveMinimum: 0,
            maximum: 1440,
            description:
              'Longest ordinary training session in the proposed blueprint. Exclude the actual goal event; assess goal feasibility from baseline and training opportunity separately.',
          },
          phases: {
            type: 'array',
            minItems: 1,
            maxItems: 24,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'startWeek', 'endWeek', 'purpose'],
              properties: {
                name: { type: 'string', minLength: 1 },
                startWeek: { type: 'integer', minimum: 1 },
                endWeek: { type: 'integer', minimum: 1 },
                purpose: { type: 'string', minLength: 1 },
              },
            },
          },
        },
      },
      missingFacts: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'reason'],
          properties: {
            key: { type: 'string', minLength: 1 },
            reason: { type: 'string', minLength: 1 },
          },
        },
      },
      scenarios: {
        type: 'array',
        minItems: 2,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'title',
            'recommended',
            'preserves',
            'changes',
            'whySuitable',
            'tradeoffs',
          ],
          properties: {
            id: { type: 'string', minLength: 1 },
            title: { type: 'string', minLength: 1 },
            recommended: { type: 'boolean' },
            preserves: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 1 },
            },
            changes: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 1 },
            },
            whySuitable: { type: 'string', minLength: 1 },
            tradeoffs: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
  },
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  validateInput: async (_ctx, input) => {
    const requiredSports = unique(input.constraints.requiredSports);
    if (requiredSports.length !== input.constraints.requiredSports.length) {
      return aiToolError(
        'requiredSports must not contain duplicates.',
        'PLAN_SUITABILITY_INVALID',
      );
    }
    if (
      input.constraints.strengthPreference === 'INCLUDE' &&
      !requiredSports.includes('STRENGTH')
    ) {
      return aiToolError(
        'INCLUDE strength preference requires STRENGTH in requiredSports.',
        'PLAN_SUITABILITY_CONSTRAINT_CONFLICT',
      );
    }
    if (
      input.constraints.strengthPreference === 'EXCLUDE' &&
      requiredSports.includes('STRENGTH')
    ) {
      return aiToolError(
        'EXCLUDE strength preference conflicts with STRENGTH in requiredSports.',
        'PLAN_SUITABILITY_CONSTRAINT_CONFLICT',
      );
    }
    if (input.status === 'READY') return validateReady(input);
    if (input.status === 'NEEDS_INPUT') {
      return input.missingFacts?.length
        ? { ok: true }
        : aiToolError(
            'NEEDS_INPUT requires the decision-critical missing facts.',
            'PLAN_SUITABILITY_INVALID',
          );
    }
    return validateAdjustment(input);
  },
  summarizeForModel: ({ output }) => output,
  execute: async (ctx, input) => {
    const assessmentId = randomUUID();
    if (ctx.planSuitability) {
      ctx.planSuitability.latest = {
        assessmentId,
        status: input.status,
        constraints: {
          periodWeeks: input.constraints.periodWeeks,
          maxTrainingDaysPerWeek: input.constraints.maxTrainingDaysPerWeek,
          maxDailyMinutes: input.constraints.maxDailyMinutes,
          requiredSports: [...input.constraints.requiredSports],
          strengthPreference: input.constraints.strengthPreference,
        },
      };
    }
    return {
      kind: 'plan_suitability_assessment',
      assessmentId,
      ...input,
    };
  },
});
