import { randomUUID } from 'node:crypto';
import { planDailyMinuteLimit, planQualityContractSchema, planWeekTargetsSchema, validPlanPhaseTargets, validPlanWeekTargets, type PlanQualityContract, type PlanPhaseTarget, type PlanWeekTarget } from '@shared/plan-quality';
import type { PlanQuestionReview, PlanQuestionReviewDecision } from '../coach-plan-question-review';
import { planPhaseProgress } from './plan-draft-phase-progress';
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
  questionReview?: PlanQuestionReviewDecision[];
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
    maxMinutesByIsoWeekday?: PlanQualityContract['maxMinutesByIsoWeekday'];
    fixedTrainingWeekdays?: number[] | null;
    requiredSports: Sport[];
    strengthPreference: 'AUTO' | 'INCLUDE' | 'EXCLUDE';
    raceDiscipline?: 'RUN' | 'TRIATHLON' | 'CYCLING' | 'SWIM';
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
    exactWeeklyMinutesEvidenceIndex?: number;
    weekTargets?: PlanWeekTarget[];
    phases: PlanPhaseTarget[];
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

function validateReady(input: Input, newPlan: boolean) {
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
    blueprint.weeklyTrainingDays.max > Math.min(
      input.constraints.maxTrainingDaysPerWeek,
      input.constraints.fixedTrainingWeekdays?.length ?? 7,
    )
  ) {
    return aiToolError(
      'The blueprint training-day range exceeds the agreed weekly availability.',
      'PLAN_SUITABILITY_CONSTRAINT_CONFLICT',
    );
  }
  const availableDays = input.constraints.fixedTrainingWeekdays ?? [1, 2, 3, 4, 5, 6, 7];
  const dailyLimits = availableDays.map((day) => planDailyMinuteLimit(input.constraints, day) ?? input.constraints.maxDailyMinutes)
    .sort((a, b) => b - a);
  if (blueprint.longestPlannedSessionMinutes > dailyLimits[0]) {
    return aiToolError(
      `The blueprint needs a ${blueprint.longestPlannedSessionMinutes}-minute key session but the largest available day allows ${dailyLimits[0]} minutes. Return NEEDS_ADJUSTMENT with coherent alternatives instead of drafting through the conflict.`,
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
  if (!validPlanPhaseTargets(phases, input.constraints.periodWeeks)) {
    return aiToolError(
      'Blueprint phases must cover the requested cycle exactly once without gaps or overlaps. Check each phase range.',
      'PLAN_SUITABILITY_CONSTRAINT_CONFLICT',
    );
  }
  if (input.constraints.periodWeeks > 1 || blueprint.weekTargets !== undefined) {
    if (!validPlanWeekTargets(blueprint.weekTargets, input.constraints.periodWeeks)) {
      return aiToolError(
        'Set the goal of every week before scheduling workouts. List weekTargets in order, once per week, with phase, focus, training-day and total-minute ranges.',
        'PLAN_SUITABILITY_WEEK_TARGETS_INVALID',
      );
    }
    const capacity = (days: number) => dailyLimits.slice(0, days).reduce((sum, minutes) => sum + minutes, 0);
    const conflicts = blueprint.weekTargets.filter(({ trainingDays, durationMinutes, loadTarget }) =>
      trainingDays.max > blueprint.weeklyTrainingDays.max ||
      durationMinutes.max > capacity(trainingDays.max) ||
      (loadTarget && !sports.has(loadTarget.sport as Sport)),
    );
    if (conflicts.length) {
      return aiToolError(
        `Week targets exceed assessed availability or use a different sport. ${conflicts.map((week) => `W${week.weekIndex} allows at most ${capacity(week.trainingDays.max)} minutes over ${week.trainingDays.max} training days`).join(', ')}. Reconcile the whole week with the brief.`,
        'PLAN_SUITABILITY_WEEK_TARGETS_INVALID',
      );
    }
    const longest = blueprint.longestPlannedSessionMinutes;
    const canScheduleLongest = blueprint.weekTargets.some(({ durationMinutes, trainingDays }) =>
      trainingDays.max > 0 && (durationMinutes.max > longest ||
        (durationMinutes.max === longest && trainingDays.min <= 1)),
    );
    if (!canScheduleLongest) {
      return aiToolError(
        `No week can fit the planned ${longest}-minute session and its other required training days. Sum all sessions for each week's durationMinutes and reconcile that total with the longest planned session.`,
        'PLAN_SUITABILITY_WEEK_TARGETS_INVALID',
      );
    }
    if (newPlan && blueprint.weekTargets.length > 1) {
      const trainingWeeks = blueprint.weekTargets.filter((week) => week.trainingDays.max > 0);
      const allExact = trainingWeeks.length >= 2 && trainingWeeks.every(
        ({ durationMinutes }) => durationMinutes.min === durationMinutes.max,
      );
      const index = blueprint.exactWeeklyMinutesEvidenceIndex;
      const evidence = index !== undefined && Number.isInteger(index) ? input.evidence[index] : undefined;
      if ((allExact || index !== undefined) && (evidence?.source !== 'PLAN_BRIEF' || !evidence.summary.trim())) {
        return aiToolError(
          'A daily time cap limits each day; it does not prescribe exact weekly totals. Set realistic weekly duration ranges within the athlete’s limits and resubmit the assessment. To prescribe exact totals for every training week, set blueprint.exactWeeklyMinutesEvidenceIndex to the zero-based PLAN_BRIEF evidence entry quoting the athlete’s fixed weekly totals or fixed session protocol. Calculated or rounded draft totals are not athlete evidence.',
          'PLAN_SUITABILITY_WEEK_TARGETS_INVALID',
        );
      }
    }
    for (const phase of phases) {
      if (!phase.durationMinutes) continue;
      const phaseWeeks = blueprint.weekTargets.slice(phase.startWeek - 1, phase.endWeek);
      const min = phaseWeeks.reduce((total, week) => total + week.durationMinutes.min, 0);
      const max = phaseWeeks.reduce((total, week) => total + week.durationMinutes.max, 0);
      if (min > phase.durationMinutes.max || max < phase.durationMinutes.min)
        return aiToolError(
          `The weekly ranges in weeks ${phase.startWeek}–${phase.endWeek} sum to ${min}–${max} minutes. The phase total ${phase.durationMinutes.min}–${phase.durationMinutes.max} must overlap that interval. If you supplied a typical week's range, correct it to the phase total or omit the optional phase duration.`,
          'PLAN_SUITABILITY_WEEK_TARGETS_INVALID',
        );
    }
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
  applicableSkills: ['plan-builder', 'plan-cycle-review'],
  requiresActiveSkill: true,
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
          'fixedTrainingWeekdays',
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
          maxDailyMinutes: planQualityContractSchema.properties.maxDailyMinutes,
          maxMinutesByIsoWeekday: planQualityContractSchema.properties.maxMinutesByIsoWeekday,
          fixedTrainingWeekdays: {
            anyOf: [
              { type: 'null' },
              {
                type: 'array',
                minItems: 1,
                uniqueItems: true,
                items: { type: 'integer', minimum: 1, maximum: 7 },
              },
            ],
            description: 'Explicit recurring training weekdays throughout the plan, ISO Monday=1 through Sunday=7. Use [1,3,6] for Mon/Wed/Sat. Use null for a weekly count alone or a date-limited window.',
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
            enum: ['RUN', 'TRIATHLON', 'CYCLING', 'SWIM'],
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
              'Duration of the longest ordinary session you plan in this blueprint, including warm-up, recovery and cool-down. Exclude the actual goal event.',
          },
          weekTargets: {
            ...planWeekTargetsSchema,
            description: 'Required for multi-week READY. Set one target per week in phase order. Describe executable key sessions and recovery in focus. An undated distance goal may end without a test. If the final effort is timed, state its time in focus and phase purpose; leave the distance as the broader goal. Use RACE for a scheduled goal test and TAPER for a taper. A rest week may have zero days and minutes.',
          },
          exactWeeklyMinutesEvidenceIndex: {
            type: 'integer',
            minimum: 0,
            description: 'For new plans where every training week has an exact minute total, cite the zero-based evidence[] index of a PLAN_BRIEF entry quoting the athlete’s specified weekly totals or fixed session protocol. A daily maximum or the coach’s own design does not qualify. Otherwise omit.',
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
                durationMinutes: {
                  ...planWeekTargetsSchema.items.properties.durationMinutes,
                  description: 'Optional sum of all training minutes across the entire phase. Do not enter a typical week. If supplied, make it consistent with the sum of the weekly target ranges.',
                },
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
  validateInput: async (ctx, input) => {
    if (ctx.planQuestionReview) {
      const decisions = input.questionReview ?? [];
      const original = ctx.planQuestionReview.questions;
      if (
        decisions.length !== original.length ||
        original.some((question) => !decisions.some((item) => item.id === question.id)) ||
        decisions.some((item) => !item.reason.trim())
      ) {
        return aiToolError(
          `Provide one questionReview entry with an outcome and reason for each exact ID: ${original.map(({id}) => id).join(', ')}.`,
          'PLAN_QUESTION_REVIEW_REQUIRED',
        );
      }
      if (
        input.status !== 'NEEDS_INPUT' &&
        decisions.some((item) => item.outcome === 'KEEP' || item.outcome === 'REPLACE')
      ) {
        return aiToolError(
          'Return NEEDS_INPUT while a retained or replaced question still needs an answer.',
          'PLAN_QUESTION_REVIEW_REQUIRED',
        );
      }
    }
    if (ctx.rollingPlanDraft && input.constraints.periodWeeks !== 1) {
      return aiToolError(
        'For a continuous plan, assess the full goal but use periodWeeks=1 for the starter-week blueprint. The continuous plan has no fixed duration.',
        'PLAN_SUITABILITY_CONSTRAINT_CONFLICT',
      );
    }
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
    if (input.status === 'READY') return validateReady(input, ctx.activeSkillName === 'plan-builder' && !ctx.planQuestionReview);
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
  summarizeForModel: ({ ctx, output }) => {
    const progress = planPhaseProgress(ctx);
    if (!progress || output.assessmentId !== progress.assessmentId) return output;
    return {
      kind: output.kind, status: output.status, assessmentId: output.assessmentId,
      goalSummary: output.goalSummary, constraints: output.constraints,
      designSummary: output.blueprint?.designSummary, phases: output.blueprint?.phases,
      next: progress.next,
    };
  },
  execute: async (ctx, input) => {
    const assessmentId = randomUUID();
    if (ctx.planQuestionReview) ctx.planQuestionReview.decisions = input.questionReview;
    if (ctx.planSuitability) {
      delete ctx.planSuitability.stagedPhases;
      delete ctx.planSuitability.rejectedPhase;
      delete ctx.planSuitability.rejectedDraft;
      delete ctx.planSuitability.rejectedRecoveryPrescriptions;
      ctx.planSuitability.latest = {
        assessmentId,
        skillName: ctx.activeSkillName,
        goalSummary: input.goalSummary,
        status: input.status,
        weekTargets: input.status === 'READY' ? input.blueprint?.weekTargets : undefined,
        phases: input.status === 'READY' ? [...input.blueprint!.phases].sort((a, b) => a.startWeek - b.startWeek) : undefined,
        constraints: {
          periodWeeks: input.constraints.periodWeeks,
          maxTrainingDaysPerWeek: input.constraints.maxTrainingDaysPerWeek,
          maxDailyMinutes: input.constraints.maxDailyMinutes,
          ...(input.constraints.maxMinutesByIsoWeekday ? { maxMinutesByIsoWeekday: { ...input.constraints.maxMinutesByIsoWeekday } } : {}),
          fixedTrainingWeekdays: input.constraints.fixedTrainingWeekdays ?? undefined,
          ...(input.constraints.raceDiscipline ? { raceDiscipline: input.constraints.raceDiscipline } : {}),
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

/** Advertise the review as a required input only for the refresh attempt. */
export function planSuitabilityQuestionReviewTool(review: PlanQuestionReview): AiToolDef {
  const tool = planSuitabilityAssessTool;
  const ids = review.questions.map((question) => question.id);
  return {
    ...tool,
    // This server-owned review only revalidates an existing question card.
    requiresActiveSkill: false,
    description: `Recheck the previous questions and assess plan suitability. Required questionReview IDs: ${ids.join(', ')}. Include one entry per ID.`,
    parameters: {
      ...tool.parameters,
      required: [...(tool.parameters.required ?? []), 'questionReview'],
      properties: {
        ...tool.parameters.properties,
        questionReview: {
          type: 'array',
          minItems: ids.length,
          maxItems: ids.length,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'outcome', 'reason'],
            properties: {
              id: { type: 'string', enum: ids },
              outcome: { type: 'string', enum: ['KEEP', 'ANSWERED', 'IRRELEVANT', 'REPLACE'] },
              reason: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
  } as AiToolDef;
}
