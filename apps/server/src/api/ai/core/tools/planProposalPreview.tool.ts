import type {
  PlanProposalPreviewRequest,
  PlanProposalPreviewResult,
} from '@shared/plan-proposal';
import {
  aiToolError,
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

export const planProposalPreviewTool: AiToolDef<
  PlanProposalPreviewRequest,
  PlanProposalPreviewResult
> = buildAiTool({
  name: 'plan.proposal_preview',
  aliases: ['plan_proposal_preview', 'plan.adapt_preview'],
  description:
    'Create a server-validated, immutable preview for adapting an existing plan or replacing it from a future effective date. This does not modify the plan. Use the returned decisionType and decisionPayload with coach_decision_draft, then wait for explicit user confirmation before coach_decision_apply.',
  cost: 'high',
  searchHint:
    'adapt replace supersede plan workout prescription zone preview confirmation',
  applicableSkills: [
    'plan-builder',
    'plan-followup',
    'plan-cycle-review',
    'workout-management',
  ],
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 20_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['mode'],
    properties: {
      mode: { type: 'string', enum: ['ADAPT', 'SUPERSEDE'] },
      planId: {
        type: 'string',
        description: 'Source plan id for ADAPT.',
      },
      scope: {
        type: 'string',
        enum: ['WORKOUT', 'PLAN_REMAINING'],
      },
      assessmentGroups: {
        type: 'array',
        description:
          'Coach assessments grouped by equivalent workout intent. PLAN_REMAINING must cover every mutable remaining workout exactly once.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'workoutIds',
            'disposition',
            'intent',
            'targetDimension',
            'rationale',
            'evidenceRefs',
          ],
          properties: {
            workoutIds: { type: 'array', items: { type: 'string' } },
            disposition: { type: 'string', enum: ['APPLY', 'PRESERVE'] },
            intent: {
              type: 'object',
              additionalProperties: false,
              required: ['family'],
              properties: {
                family: {
                  type: 'string',
                  enum: [
                    'RECOVERY',
                    'EASY',
                    'ENDURANCE',
                    'STEADY',
                    'TEMPO',
                    'THRESHOLD',
                    'VO2MAX',
                    'ANAEROBIC',
                    'SPRINT',
                    'RACE_PACE',
                    'TECHNIQUE',
                    'OTHER',
                  ],
                },
                purpose: { type: 'string' },
                source: {
                  type: 'string',
                  enum: ['PLAN_BUILDER', 'AI_COACH', 'TEMPLATE', 'USER'],
                },
              },
            },
            targetDimension: {
              type: 'string',
              enum: ['PACE', 'HEART_RATE', 'POWER'],
            },
            zoneIndex: { type: 'number' },
            fixedTarget: {
              type: 'object',
              additionalProperties: false,
              required: ['low', 'unit', 'source', 'protocolSpecific'],
              properties: {
                low: { type: 'number' },
                high: { type: 'number' },
                unit: {
                  type: 'string',
                  enum: ['SECONDS', 'KMH', 'BPM', 'WATTS'],
                },
                source: { type: 'string' },
                protocolSpecific: { type: 'boolean' },
              },
            },
            auxiliaryRpe: {
              type: 'object',
              additionalProperties: false,
              required: ['low'],
              properties: {
                low: { type: 'number' },
                high: { type: 'number' },
              },
            },
            rationale: { type: 'string' },
            evidenceRefs: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'label'],
                properties: {
                  type: { type: 'string' },
                  label: { type: 'string' },
                  value: {},
                },
              },
            },
          },
        },
      },
      sourcePlanId: {
        type: 'string',
        description: 'Source plan id for SUPERSEDE.',
      },
      effectiveFrom: { type: 'string', description: 'YYYY-MM-DD.' },
      rationale: { type: 'string' },
      evidenceRefs: {
        type: 'array',
        description:
          'Athlete-facing facts used for the coaching judgment. Describe missing data explicitly instead of leaving this empty.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'label'],
          properties: {
            type: { type: 'string' },
            label: { type: 'string' },
            value: {},
          },
        },
      },
      plan: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'periodWeeks', 'workouts'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          goal: { type: 'string' },
          periodWeeks: { type: 'number' },
          workouts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['weekIndex', 'dayIndex', 'sportType', 'text'],
              properties: {
                weekIndex: { type: 'number' },
                dayIndex: { type: 'number' },
                sessionIndex: { type: 'number' },
                sportType: {
                  type: 'string',
                  enum: ['RUN', 'CYCLING', 'SWIM'],
                },
                sportDefinitionCode: { type: 'string' },
                name: { type: 'string' },
                notes: { type: 'string' },
                text: { type: 'string' },
                plannedSessionRpe: { type: 'number' },
              },
            },
          },
        },
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  validateInput: (ctx, input) => {
    if (!ctx.coachBranching) {
      return aiToolError('Plan proposal previews are unavailable', 'FORBIDDEN');
    }
    if (input?.mode !== 'ADAPT' && input?.mode !== 'SUPERSEDE') {
      return aiToolError('mode must be ADAPT or SUPERSEDE', 'INVALID_INPUT');
    }
    if (
      input.mode === 'ADAPT' &&
      (!input.planId ||
        !['WORKOUT', 'PLAN_REMAINING'].includes(input.scope) ||
        !Array.isArray(input.assessmentGroups) ||
        !input.assessmentGroups.length)
    ) {
      return aiToolError(
        'ADAPT requires planId, scope, and assessmentGroups',
        'INVALID_INPUT',
      );
    }
    if (
      input.mode === 'SUPERSEDE' &&
      (!input.sourcePlanId ||
        !input.effectiveFrom ||
        !input.rationale?.trim() ||
        !Array.isArray(input.evidenceRefs) ||
        !input.evidenceRefs.length ||
        !input.plan)
    ) {
      return aiToolError(
        'SUPERSEDE requires sourcePlanId, effectiveFrom, rationale, evidenceRefs, and plan',
        'INVALID_INPUT',
      );
    }
    return { ok: true };
  },
  summarizeForModel: ({ output }) => ({
    kind: output.kind,
    previewId: output.previewId,
    mode: output.mode,
    expiresAt: output.expiresAt,
    decisionType: output.decisionType,
    decisionPayload: output.decisionPayload,
  }),
  execute: async (ctx, input) => {
    const userId = ctx.session?.user?.id;
    if (!userId || !ctx.coachBranching) {
      throw new Error('plan.proposal_preview requires a signed-in user');
    }
    return ctx.coachBranching.createPlanProposalPreview({
      userId,
      request: input,
    });
  },
});
