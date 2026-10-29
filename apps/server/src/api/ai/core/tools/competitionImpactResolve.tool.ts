import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  scopeType:
    | 'PLAN_DRAFT'
    | 'PLAN_EXECUTION'
    | 'CALENDAR_RANGE'
    | 'DAY_DECISION'
    | 'WORKOUT_DECISION'
    | 'COACH_CONVERSATION';
  scopeStartDate: string;
  scopeEndDate: string;
  anchorDate: string;
};

export const competitionImpactResolveTool: AiToolDef<Input, unknown> =
  buildAiTool({
    name: 'competition.impact.resolve',
    aliases: ['competition_impact', 'race_impact'],
    description:
      'Run or reuse the dedicated competition-impact assessment for a training date range. It decides relevance, influence weeks, phases, constraints, and multi-event conflicts. Call before drafting or adjusting training when competition events may matter, including events just outside the plan dates.',
    cost: 'high',
    searchHint:
      'competition race impact weeks taper recovery plan dates outside range',
    isEnabled: async (ctx) => hasSignedInUser(ctx),
    maxResultChars: 18_000,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: [
        'scopeType',
        'scopeStartDate',
        'scopeEndDate',
        'anchorDate',
      ],
      properties: {
        scopeType: {
          type: 'string',
          enum: [
            'PLAN_DRAFT',
            'PLAN_EXECUTION',
            'CALENDAR_RANGE',
            'DAY_DECISION',
            'WORKOUT_DECISION',
            'COACH_CONVERSATION',
          ],
        },
        scopeStartDate: { type: 'string', description: 'YYYY-MM-DD.' },
        scopeEndDate: { type: 'string', description: 'YYYY-MM-DD.' },
        anchorDate: {
          type: 'string',
          description: 'Current decision date in YYYY-MM-DD.',
        },
      },
    },
    checkPermissions: async (ctx) => requireSignedInUser(ctx),
    summarizeForModel: ({ output }) => output,
    execute: (ctx, input) => ctx.coachTools.competitionImpactResolve(ctx, input),
  });
