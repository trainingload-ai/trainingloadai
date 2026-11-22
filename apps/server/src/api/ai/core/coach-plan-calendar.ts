import { readCoachPlanCalendar } from '@shared/ai-coach-schema';
import { isCalendarDate } from '@shared/plan-calendar';

export const COACH_PLAN_CALENDAR_TOOL = 'PlanCalendarView';

export function coachPlanCalendarBlock(
  callId: string,
  input: Record<string, unknown>,
  output: unknown,
) {
  if (!output || typeof output !== 'object') return null;
  const snapshot = output as { asOf?: unknown; plan?: { id?: unknown; title?: unknown } };
  const calendar = readCoachPlanCalendar({
    planId: snapshot.plan?.id,
    title: snapshot.plan?.title,
    initialDate: isCalendarDate(input.calendarFrom) ? input.calendarFrom : snapshot.asOf,
  });
  return calendar
    ? {
        type: 'tool_use' as const,
        id: `${callId}:calendar`,
        name: COACH_PLAN_CALENDAR_TOOL,
        input: calendar,
      }
    : null;
}
