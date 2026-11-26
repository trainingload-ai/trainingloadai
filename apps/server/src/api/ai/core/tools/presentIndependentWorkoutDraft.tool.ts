import { isCalendarDate } from '@shared/plan-calendar';
import { PLAN_SPORT_TYPES } from '@/api/plan/plan.constants';
import type { CreateScheduledWorkoutDto } from '@/api/plan/dto/create-scheduled-workout.dto';
import { aiToolError, buildAiTool, requireSignedInUser } from '../tool.types';

type Input = Pick<CreateScheduledWorkoutDto, 'scheduledDate' | 'sportType' | 'name' | 'notes'> & { text: string };

export const presentIndependentWorkoutDraftTool = buildAiTool<Input, { draftId: string }>({
  name: 'present_independent_workout_draft',
  description: 'Save one proposed standalone workout for the athlete to edit or confirm. Use only when the athlete requests a workout outside a training plan. Provide the athlete-local date and executable workout DSL (for example "work 30m"). This creates a draft only.',
  searchHint: 'single independent standalone workout outside a training plan',
  cost: 'low',
  kind: 'draft',
  isReadOnly: false,
  isConcurrencySafe: false,
  isEnabled: (ctx) => Boolean(ctx.sid && ctx.currentUserMessageId &&
    !ctx.calendarScheduleOnly && !ctx.backgroundTask && ctx.athleteStateSafetyMode !== 'HIGH_CONCERN'),
  checkPermissions: async (ctx) => requireSignedInUser(ctx),
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['scheduledDate', 'sportType', 'text'],
    properties: {
      scheduledDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      sportType: { type: 'string', enum: [...PLAN_SPORT_TYPES] },
      text: { type: 'string', minLength: 1, maxLength: 6000 },
      name: { type: 'string', maxLength: 160 },
      notes: { type: 'string', maxLength: 2000 },
    },
  },
  validateInput: (_ctx, input) => isCalendarDate(input.scheduledDate) && input.text.trim()
    ? { ok: true }
    : aiToolError('Provide a valid calendar date and workout DSL', 'INVALID_INPUT'),
  async execute(ctx, input) {
    const userId = ctx.session?.user?.id;
    if (!userId || !ctx.sid || !ctx.currentUserMessageId ||
        ctx.calendarScheduleOnly || ctx.backgroundTask || ctx.athleteStateSafetyMode === 'HIGH_CONCERN')
      throw new Error('An eligible athlete conversation is required');
    const draft = await ctx.planService.createIndependentWorkoutDraft(userId, ctx.sid, ctx.currentUserMessageId, input);
    return { draftId: draft.id };
  },
});
