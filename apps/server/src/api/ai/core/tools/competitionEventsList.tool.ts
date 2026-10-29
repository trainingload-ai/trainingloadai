import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';

type Input = {
  startDate: string;
  endDate: string;
  status?: 'PLANNED' | 'COMPLETED' | 'CANCELLED';
};

export const competitionEventsListTool: AiToolDef<Input, unknown> = buildAiTool({
  name: 'competition.events.list',
  aliases: ['competition_events', 'race_events', 'events_list'],
  description:
    'List the athlete’s authoritative competition events over a calendar range. Events are independent of plans. Use this instead of inferring race dates or importance from plan goal text.',
  cost: 'low',
  searchHint: 'competition race event calendar importance target date',
  isEnabled: async (ctx) => hasSignedInUser(ctx),
  maxResultChars: 12_000,
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['startDate', 'endDate'],
    properties: {
      startDate: { type: 'string', description: 'YYYY-MM-DD calendar date.' },
      endDate: { type: 'string', description: 'YYYY-MM-DD calendar date.' },
      status: {
        type: 'string',
        enum: ['PLANNED', 'COMPLETED', 'CANCELLED'],
      },
    },
  },
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  summarizeForModel: ({ output }) => output,
  execute: (ctx, input) => ctx.coachTools.competitionEventsList(ctx, input),
});
