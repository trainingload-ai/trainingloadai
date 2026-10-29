import { CoachActionType, type Prisma, type SportType } from '@prisma/client';
import { asRecord } from '../ai-common.util';
import {
  aiToolError,
  requireSignedInUser,
  type JsonSchemaObject,
} from '../tool.types';
import { mutationToolFactory } from '../mutation-tool.factory';

type Input = {
  action: 'CREATE' | 'UPDATE' | 'CANCEL' | 'RESTORE' | 'DELETE';
  userConfirmed: boolean;
  eventId?: string;
  expectedVersion?: number;
  title?: string;
  sportType?: 'RUN' | 'CYCLING' | 'SWIM' | 'STRETCHING' | 'UNKNOWN';
  sportDefinitionCode?: string | null;
  distanceMeters?: number | null;
  startDate?: string;
  endDate?: string | null;
  startTimeMinute?: number | null;
  timezone?: string | null;
  importance?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  goalType?: 'FINISH' | 'TARGET_TIME' | 'PERFORMANCE' | 'EXPERIENCE';
  targetTimeSeconds?: number | null;
  location?: string | null;
  notes?: string | null;
};

type UiPayload = {
  action: Input['action'];
  event: unknown;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const competitionEventMutationBundle = mutationToolFactory<Input, UiPayload>({
  name: 'mutation_competition_event',
  aliases: ['competition.event_mutate', 'race_event_mutate'],
  description:
    'Create, update, cancel, restore, or soft-delete an independent competition event only after the user explicitly confirmed the exact event facts in the current conversation. CANCEL is reversible; DELETE removes the event from ordinary views and cannot be restored through the normal Coach flow. Importance is the athlete’s stated priority; never infer or silently change it. Read existing events before UPDATE/CANCEL/RESTORE/DELETE.',
  searchHint: 'create edit cancel restore delete race competition event after confirmation',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'userConfirmed'],
    properties: {
      action: { type: 'string', enum: ['CREATE', 'UPDATE', 'CANCEL', 'RESTORE', 'DELETE'] },
      userConfirmed: { type: 'boolean', description: 'True only when the user explicitly confirmed this exact mutation.' },
      eventId: { type: 'string' },
      expectedVersion: { type: 'integer', minimum: 1 },
      title: { type: 'string' },
      sportType: { type: 'string', enum: ['RUN', 'CYCLING', 'SWIM', 'STRETCHING', 'UNKNOWN'] },
      sportDefinitionCode: { type: ['string', 'null'] },
      distanceMeters: { type: ['number', 'null'], minimum: 0 },
      startDate: { type: 'string', description: 'YYYY-MM-DD' },
      endDate: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
      startTimeMinute: { type: ['integer', 'null'], minimum: 0, maximum: 1439 },
      timezone: { type: ['string', 'null'], description: 'IANA timezone; required with startTimeMinute.' },
      importance: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
      goalType: { type: 'string', enum: ['FINISH', 'TARGET_TIME', 'PERFORMANCE', 'EXPERIENCE'] },
      targetTimeSeconds: { type: ['integer', 'null'], minimum: 1 },
      location: { type: ['string', 'null'] },
      notes: { type: ['string', 'null'] },
    },
  } satisfies JsonSchemaObject,
  cost: 'medium',
  type: CoachActionType.COMPETITION_EVENT_MUTATION,
  riskTier: 'high',
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  validateInput: async (_ctx, input) => {
    if (input.userConfirmed !== true) {
      return aiToolError('Explicit user confirmation is required before changing a competition event.', 'CONFIRMATION_REQUIRED');
    }
    if (input.action === 'CREATE') {
      if (!input.title?.trim() || !input.sportType || !input.importance || !input.goalType || !input.startDate || !YMD.test(input.startDate)) {
        return aiToolError('CREATE requires title, sportType, startDate, importance, and goalType.', 'INVALID_INPUT');
      }
    } else if (!input.eventId || !Number.isInteger(input.expectedVersion) || input.expectedVersion! < 1) {
      return aiToolError('UPDATE/CANCEL/RESTORE/DELETE require eventId and expectedVersion from competition.events.list.', 'INVALID_INPUT');
    }
    if (input.endDate != null && !YMD.test(input.endDate)) {
      return aiToolError('endDate must be YYYY-MM-DD or null.', 'INVALID_INPUT');
    }
    return { ok: true };
  },
  async exec(ctx, input, _runtime, tx) {
    const event = await ctx.coachTools.competitionEventMutate(ctx, {
      ...input,
      sportType: input.sportType as SportType | undefined,
    }, tx);
    const eventRec = asRecord(event);
    return {
      forwardData: { action: input.action, event } as Prisma.InputJsonValue,
      reverseData: {} as Prisma.InputJsonValue,
      summary: `${input.action.toLowerCase()} competition event ${String(eventRec?.title ?? eventRec?.id ?? '')}`.trim(),
      payloadForUi: { action: input.action, event },
    };
  },
  undo: async () => {},
});

export const competitionEventMutationTool = competitionEventMutationBundle.tool;
