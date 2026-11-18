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
    'Create a server-validated, immutable preview for starting the same saved draft, adapting an existing plan or replacing it from a future effective date. This does not modify the plan. Use the returned decisionType and decisionPayload with coach_decision_draft, then wait for explicit user confirmation before coach_decision_apply.',
  cost: 'high',
  searchHint:
    'adapt replace supersede plan workout prescription zone preview confirmation',
  applicableSkills: [
    'plan-builder',
    'plan-followup',
    'plan-start',
    'plan-cycle-review',
    'plan-day-review',
    'plan-week-review',
    'workout-management',
  ],
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 20_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['mode'],
    properties: {
      mode: {
        type: 'string',
        enum: ['ADAPT', 'SUPERSEDE', 'START', 'SCHEDULE'],
      },
      planId: {
        type: 'string',
        description: 'Source plan id for ADAPT, START or SCHEDULE.',
      },
      range: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: {
            type: 'string',
            description: 'SCHEDULE inclusive effective date YYYY-MM-DD',
          },
          to: {
            type: 'string',
            description: 'SCHEDULE inclusive last date YYYY-MM-DD',
          },
        },
        required: ['from', 'to'],
      },
      startDate: {
        type: 'string',
        description:
          'START date, strict YYYY-MM-DD; must match the selected date of this bound start conversation.',
      },
      preserveUnmentioned: {
        type: 'boolean',
        description:
          'START/SCHEDULE: true explicitly preserves every source workout not listed in changes/deletions. Server expands all identities/revisions and shows full scope; never infer deletion from omission.',
      },
      changes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['sourceWorkoutId', 'expectedRevision', 'workout'],
          properties: {
            sourceWorkoutId: { type: 'string' },
            expectedRevision: { type: 'integer' },
            workout: {
              type: 'object',
              description:
                'Complete workout draft: weekIndex, dayIndex, sessionIndex, sportType, name, notes, text or definition (ENDURANCE/STRENGTH/FREEFORM), and optional plannedSessionRpe (1–10). Preserve original definition when only moving.',
              properties: {
                plannedSessionRpe: { type: 'number', minimum: 1, maximum: 10 },
              },
            },
          },
        },
      },
      additions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['candidateKey', 'workout'],
          properties: {
            candidateKey: { type: 'string' },
            workout: {
              type: 'object',
              properties: {
                plannedSessionRpe: { type: 'number', minimum: 1, maximum: 10 },
              },
            },
          },
        },
      },
      deletions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['sourceWorkoutId', 'expectedRevision'],
          properties: {
            sourceWorkoutId: { type: 'string' },
            expectedRevision: { type: 'integer' },
          },
        },
      },
      preserved: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['sourceWorkoutId', 'expectedRevision'],
          properties: {
            sourceWorkoutId: { type: 'string' },
            expectedRevision: { type: 'integer' },
          },
        },
      },
      scheduleConstraints: {
        type: 'object',
        description:
          'Versioned schedule constraints: version=1, revision, calendarTimeZone, fixedRestWeekdays (ISO 1..7), unavailableDates, availableDateOverrides, effectiveFrom/effectiveUntil, confirmation:{source:USER,reference}. Reference is audit only; actual authorization comes from card confirmation.',
      },
      qualityContractTransition: {
        type: 'object',
        additionalProperties: false,
        required: ['mode'],
        properties: {
          mode: { type: 'string', enum: ['INHERIT', 'REPLACE_ALLOWED_DAYS'] },
          allowedDays: {
            type: ['array', 'null'],
            items: { type: 'integer', minimum: 1, maximum: 7 },
          },
          maxDailyMinutes: {
            type: 'number',
            exclusiveMinimum: 0,
            maximum: 1440,
          },
          maxTrainingDaysPerWeek: { type: 'integer', minimum: 1, maximum: 7 },
        },
        description:
          'Inherit existing limits by default. Use REPLACE_ALLOWED_DAYS only for an explicitly settled relative-day rule. Optional maxDailyMinutes/maxTrainingDaysPerWeek replace only availability budgets explicitly requested by the athlete, alongside a new scheduleConstraints revision and the actual card confirmation. Other sport/phase requirements cannot be replaced.',
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
    if (
      input?.mode !== 'ADAPT' &&
      input?.mode !== 'SUPERSEDE' &&
      input?.mode !== 'START' &&
      input?.mode !== 'SCHEDULE'
    ) {
      return aiToolError(
        'mode must be ADAPT, SUPERSEDE, START or SCHEDULE',
        'INVALID_INPUT',
      );
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
    if (
      (input.mode === 'START' || input.mode === 'SCHEDULE') &&
      (!ctx.sid ||
        (input.mode === 'START' && !ctx.branchId) ||
        !ctx.currentUserMessageId ||
        !input.planId ||
        (input.mode === 'START'
          ? !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)
          : !input.range?.from || !input.range?.to) ||
        !input.rationale?.trim() ||
        !Array.isArray(input.evidenceRefs) ||
        input.evidenceRefs.length === 0)
    )
      return aiToolError(
        'START/SCHEDULE requires a current durable conversation, planId, selected startDate or explicit range, rationale and evidenceRefs',
        'INVALID_INPUT',
      );
    if (input.mode === 'START' || input.mode === 'SCHEDULE') {
      const affected = [
        ...(Array.isArray(input.changes) ? input.changes : []),
        ...(Array.isArray(input.additions) ? input.additions : []),
      ];
      if (
        affected.some((item) => {
          const rpe = item?.workout?.plannedSessionRpe;
          return (
            rpe !== undefined &&
            (typeof rpe !== 'number' ||
              !Number.isFinite(rpe) ||
              rpe < 1 ||
              rpe > 10)
          );
        })
      )
        return aiToolError(
          'Candidate plannedSessionRpe must be a number from 1 to 10 when supplied',
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
    decisionPayload:
      output.mode === 'START' || output.mode === 'SCHEDULE'
        ? { planId: output.decisionPayload.planId, previewId: output.previewId }
        : output.decisionPayload,
    ...(output.mode === 'START' || output.mode === 'SCHEDULE'
      ? {
          completeCandidateRenderedByServer: true,
          counts: output.presentation.counts,
          scheduleRulePeriods: output.presentation.scheduleRulePeriods?.slice(
            0,
            40,
          ),
          scheduleRuleCoverage: {
            total: output.presentation.scheduleRulePeriods?.length ?? 0,
            returned: Math.min(
              40,
              output.presentation.scheduleRulePeriods?.length ?? 0,
            ),
            hasMore:
              (output.presentation.scheduleRulePeriods?.length ?? 0) > 40,
          },
          relatedCalendarConflicts:
            output.presentation.relatedCalendarConflicts,
          warnings: output.presentation.warnings,
        }
      : {}),
  }),
  execute: async (ctx, input) => {
    const userId = ctx.session?.user?.id;
    if (
      (input.mode === 'START' || input.mode === 'SCHEDULE') &&
      !ctx.currentUserMessageId
    )
      throw new Error(
        'Calendar proposals require the current durable user turn',
      );
    if (!userId || !ctx.coachBranching) {
      throw new Error('plan.proposal_preview requires a signed-in user');
    }
    return ctx.coachBranching.createPlanProposalPreview({
      userId,
      request: input,
      binding:
        ctx.sid && (ctx.branchId || input.mode === 'SCHEDULE')
          ? {
              sid: ctx.sid,
              branchId: ctx.branchId ?? '',
              userMessageId: ctx.currentUserMessageId,
            }
          : undefined,
    });
  },
});
