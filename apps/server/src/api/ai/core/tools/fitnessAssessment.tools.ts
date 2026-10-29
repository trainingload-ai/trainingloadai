import { FITNESS_METRICS, FITNESS_SPORTS } from '@shared/fitness-assessment';
import {
  buildAiTool,
  requireSignedInUser,
  type AiToolContext,
} from '../tool.types';
import {
  fitnessMethods,
  normalizeFitnessMetric,
} from '@/fitness-calculation/fitness-methods';
import type { EvidenceRequest } from '@/fitness-calculation/fitness-input';
import { ConflictException } from '@nestjs/common';
import type { FitnessAssessmentResult } from '@shared/fitness-assessment';
import { fitnessConfirmationQuestion } from '../../fitness-assessment-confirmation';
export const fitnessContext = (ctx: AiToolContext) => ({
  userId: ctx.session.user.id,
  sessionId: ctx.sid ?? 'default',
  branchId: ctx.branchId ?? null,
  now: ctx.currentTurnStartedAt ?? new Date(),
});
const enabled = (ctx: AiToolContext) =>
  !!ctx.fitnessCalculations &&
  process.env.FITNESS_ASSESSMENT_ENABLED === 'true';
const common = {
  cost: 'medium' as const,
  isEnabled: enabled,
  checkPermissions: requireSignedInUser,
  isConcurrencySafe: false,
};
export const fitnessMethodsTool = buildAiTool({
  ...common,
  name: 'fitness.methods',
  // 完整目录包含各方法的原理与解释，避免默认预算截掉后面的指标说明。
  maxResultChars: 24_000,
  description:
    'Discover current fitness estimators, their rationale, interpretation and execution requirements. Includes LTHR from ordinary activities (lthr-activity-observation, no maximal test required), CP/FTP, CS/CSS, TP, VO2_MAX (VDOT), P_MAX, MAX_HR and RESTING_HR. Query the current catalog for a new assessment; historical method results may be outdated. Requirements describe calculator inputs; interpretation explains real-training estimates. Activate fitness-assessment to calculate from the requested data. Stored settings are not a new calculation.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      metric: { type: 'string' },
      sport: { type: 'string' },
      methodId: { type: 'string' },
    },
  },
  execute: async (
    _ctx,
    input: { metric?: string; sport?: string; methodId?: string },
  ) => ({
    requestedMetric: normalizeFitnessMetric(input.metric),
    supportedMetrics: [...FITNESS_METRICS],
    methods: fitnessMethods(input.metric, input.sport).filter(
      (m) => !input.methodId || m.id === input.methodId,
    ),
    testWorkout:
      input.methodId === 'lthr-30-minute'
        ? {
            protocol: 'lthr-30-minute@1',
            instructions:
              'Test workout protocol: easy warm-up, 30 minutes solo at the best sustainable effort, then easy cool-down. The first 10 minutes belong to the test; record HR throughout and mark the test start and 10-minute point. If the athlete wants this scheduled, use the generic Workout operation decision guide so related schedule changes can be proposed together. Scheduling does not prove actual protocol completion.',
          }
        : undefined,
  }),
});
export const fitnessEvidenceTool = buildAiTool({
  ...common,
  name: 'fitness.evidence',
  description:
    'Prepare frozen evidence, not a new metric value. Preserve the requested activity or date scope. For ordinary-activity LTHR use lthr-activity-observation: it selects a valid HR window automatically, without maximal effort or test confirmation. Only lthr-30-minute needs an explicit test segment and protocol confirmation. If preparationStatus=READY call fitness.calculate. When evidence needs a user fact, explain the concrete gap and use ask_user_question; never invent a protocol reply or expose calculation parameters as a form.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['methodId', 'metric', 'sport', 'scope'],
    properties: {
      methodId: { type: 'string' },
      metric: { type: 'string', enum: [...FITNESS_METRICS] },
      sport: { type: 'string', enum: [...FITNESS_SPORTS] },
      taskId: { type: 'string' },
      scope: {
        type: 'object',
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'activityHashId'],
            properties: {
              kind: { const: 'ACTIVITY' },
              activityHashId: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'localDate'],
            properties: {
              kind: { const: 'DATE' },
              localDate: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind'],
            properties: {
              kind: { const: 'RECENT' },
              days: { type: 'integer', minimum: 1, maximum: 180 },
              asOf: {
                type: 'string',
                description:
                  'ISO timestamp with explicit timezone offset; resolve dates using the user timezone. Omit for now.',
              },
            },
          },
        ],
      },
      segment: {
        type: 'object',
        additionalProperties: false,
        required: ['activityHashId', 'startSeconds'],
        properties: {
          activityHashId: { type: 'string' },
          startSeconds: { type: 'number', minimum: 0 },
        },
      },
    },
  },
  execute: async (ctx, input: EvidenceRequest) =>
    ctx.fitnessCalculations!.prepare(fitnessContext(ctx), input),
});
export const fitnessCalculateTool = buildAiTool({
  ...common,
  name: 'fitness.calculate',
  description:
    'Calculate from READY frozen evidence. A previously displayed calculation returns fitness_assessment_reference with its assessment for explanation, without another result card. For follow-up questions about accuracy or method, explain that result using its evidence and limitations; a new assessment requires fresh fitness.evidence. Never writes fitness settings.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['calculationId'],
    properties: { calculationId: { type: 'string' } },
  },
  execute: async (ctx, input: { calculationId: string }) => {
    const context = fitnessContext(ctx);
    const assessment = await ctx.fitnessCalculations!.calculate(
      context,
      input.calculationId,
    );
    const calculation = await ctx.fitnessCalculations!.calculation(
      context,
      input.calculationId,
    );
    // Reading an already delivered artifact is reasoning context, not a new
    // UI delivery. Returning a result again would render its card and stop the
    // model loop before it can answer the athlete's follow-up question.
    return calculation.presentedAt
      ? { kind: 'fitness_assessment_reference' as const, assessment }
      : assessment;
  },
});
export const fitnessApplyTool = buildAiTool({
  ...common,
  name: 'mutation_apply_fitness_calculation',
  kind: 'mutation',
  riskTier: 'high',
  isReadOnly: false,
  description:
    'Apply a specific previously displayed fitness calculation option when the user wants to adopt it. Server verifies current confirmation, evidence and settings. If confirmation is needed, this tool returns a bound confirmation question; the selected answer authorizes that exact proposal. Use this flow instead of an unbound ask_user_question or sending the user back to an old card. Never invent consent.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['calculationId', 'applyOptionId'],
    properties: {
      calculationId: { type: 'string' },
      applyOptionId: { type: 'string' },
    },
  },
  execute: async (
    ctx,
    input: { calculationId: string; applyOptionId: string },
  ) => {
    const context = fitnessContext(ctx);
    try {
      return await ctx.fitnessApply!.apply(context, input, {
        text: ctx.currentUserPrompt ?? '',
        confirmation: ctx.fitnessConfirmation,
        turnStartedAt: context.now,
      });
    } catch (error) {
      if (
        !(error instanceof ConflictException) ||
        error.message !== 'CONFIRMATION_REQUIRED'
      )
        throw error;
      const calculation = await ctx.fitnessCalculations!.calculation(
        context,
        input.calculationId,
      );
      const option = (
        calculation.result as unknown as FitnessAssessmentResult
      ).applyOptions.find((o) => o.id === input.applyOptionId);
      if (
        !option ||
        !calculation.presentedAt ||
        new Date(option.expiresAt) <= context.now
      )
        throw new ConflictException('STALE');
      return fitnessConfirmationQuestion({
        calculationId: calculation.id,
        option,
        branchId: context.branchId,
        i18n: ctx.i18n,
        lang: ctx.lang,
      });
    }
  },
});
export const fitnessTrackTool = buildAiTool({
  ...common,
  name: 'fitness.track',
  kind: 'draft',
  isReadOnly: false,
  description:
    'First OFFER tracking a specific approved test workout to show the consent card, then START/STOP only with explicit current-turn user consent. Does not create workouts or apply metrics. The task retains its original scope; user consent to tracking authorizes assessing the linked future Activity.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['taskId', 'action'],
    properties: {
      taskId: { type: 'string' },
      workoutId: { type: 'string' },
      action: { type: 'string', enum: ['OFFER', 'START', 'STOP'] },
    },
  },
  execute: async (
    ctx,
    input: {
      taskId: string;
      action: 'START' | 'STOP' | 'OFFER';
      workoutId?: string;
    },
  ) =>
    ctx.fitnessFollowup!.track(
      fitnessContext(ctx),
      input,
      ctx.currentUserPrompt ?? '',
      ctx.fitnessTrackingReply,
    ),
});
