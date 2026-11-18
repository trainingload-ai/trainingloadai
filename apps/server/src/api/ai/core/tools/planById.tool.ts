import dayjs = require('dayjs');
import { isCalendarDate } from '@shared/plan-calendar';
import {
  buildAiTool,
  hasSignedInUser,
  requireSignedInUser,
  type AiToolDef,
} from '../tool.types';
import {
  buildPlanSnapshotFromRow,
  emptyPlanSnapshotOutput,
  type PlanSnapshotToolOutput,
} from './plan-snapshot.shared';

type Input = {
  planId: string;
  asOf?: string;
  includeAllWorkouts?: boolean;
  workoutOffset?: number;
  workoutLimit?: number;
  calendarFrom?: string;
  calendarTo?: string;
  calendarOffset?: number;
  calendarLimit?: number;
};

export const planByIdTool: AiToolDef<Input, PlanSnapshotToolOutput> =
  buildAiTool({
    name: 'plan.by_id',
    aliases: ['plan_by_id', 'get_plan_by_id', 'saved_plan'],
    description:
      'Load a specific training plan by id for the signed-in user (any status: DRAFT, ACTIVE, PAUSED, etc.). Same snapshot shape as plan.active. Use when the user opened a plan detail or plan-followup seed provides planId — do not use plan.active for arbitrary plan ids.',
    cost: 'low',
    searchHint: 'plan by id draft saved plan user',
    isEnabled: async (ctx) => hasSignedInUser(ctx),
    maxResultChars: 16_000,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['planId'],
      properties: {
        planId: {
          type: 'string',
          description: 'The plan id (cuid) for this user.',
        },
        calendarFrom: {
          type: 'string',
          description:
            'Read related standalone and other-plan courses from this inclusive calendar date YYYY-MM-DD; use with calendarTo for SCHEDULE coordination.',
        },
        calendarTo: {
          type: 'string',
          description: 'Inclusive calendar range end YYYY-MM-DD.',
        },
        calendarOffset: {
          type: 'integer',
          minimum: 0,
          description:
            'Related calendar offset; follow relatedCalendar.nextOffset until hasMore=false.',
        },
        calendarLimit: { type: 'integer', minimum: 1, maximum: 40 },
        asOf: {
          type: 'string',
          description:
            'Optional anchor date in YYYY-MM-DD. Defaults to athlete-local today.',
        },
        workoutOffset: {
          type: 'integer',
          minimum: 0,
          description:
            'Zero-based source inventory offset. Read successive pages when editing a long plan; do not claim unseen workouts were assessed.',
        },
        workoutLimit: {
          type: 'integer',
          minimum: 1,
          maximum: 40,
          description:
            'Source inventory page size, default 40. Each source includes identity and revision.',
        },
        includeAllWorkouts: {
          type: 'boolean',
          description:
            'Include every workout in this plan. Use for full plan/cycle review only.',
        },
      },
    },
    checkPermissions: async (ctx) => requireSignedInUser(ctx),
    summarizeForModel: ({ output }) => ({
      asOf: output.asOf,
      plan: output.plan,
      today: output.today,
      tomorrow: output.tomorrow,
      currentWeek: output.currentWeek,
      allWorkouts: output.allWorkouts,
      workoutInventory: output.workoutInventory,
      relatedCalendar: output.relatedCalendar,
      candidateCapacity: 10000,
    }),
    execute: async (ctx, input) => {
      const userId = ctx.session?.user?.id;
      const planId = String(input.planId ?? '').trim();
      const today = dayjs(ctx.currentTurnCalendar?.date);
      const asOf = input.asOf ? dayjs(input.asOf) : today;
      const anchor = asOf.isValid()
        ? asOf.startOf('day')
        : today.startOf('day');
      const tomorrow = anchor.add(1, 'day');

      if (!planId) {
        return emptyPlanSnapshotOutput(anchor, tomorrow);
      }

      const plan = await ctx.planQuery.findCoachPlanSnapshot({
        userId: userId!,
        planId,
        includeCoachSummary: true,
      });

      if (!plan) {
        return emptyPlanSnapshotOutput(anchor, tomorrow);
      }

      const output = buildPlanSnapshotFromRow(plan, input, anchor, tomorrow);
      if (output.allWorkouts) {
        const offset = Math.max(0, Math.floor(input.workoutOffset ?? 0));
        const limit = Math.max(
          1,
          Math.min(40, Math.floor(input.workoutLimit ?? 40)),
        );
        const total = output.allWorkouts.length;
        output.allWorkouts = output.allWorkouts.slice(offset, offset + limit);
        const nextOffset = offset + output.allWorkouts.length;
        output.workoutInventory = {
          total,
          offset,
          returned: output.allWorkouts.length,
          hasMore: nextOffset < total,
          nextOffset: nextOffset < total ? nextOffset : null,
        };
      }
      if (input.calendarFrom || input.calendarTo) {
        if (
          !isCalendarDate(input.calendarFrom) ||
          !isCalendarDate(input.calendarTo) ||
          input.calendarTo! < input.calendarFrom!
        )
          throw new Error(
            'A valid complete related calendar range is required',
          );
        output.relatedCalendar = await ctx.planQuery.findRelatedCalendarPage({
          userId: userId!,
          planId,
          from: input.calendarFrom!,
          to: input.calendarTo!,
          offset: Math.max(0, Math.floor(input.calendarOffset ?? 0)),
          limit: Math.max(
            1,
            Math.min(40, Math.floor(input.calendarLimit ?? 40)),
          ),
        });
      }
      return output;
    },
  });
