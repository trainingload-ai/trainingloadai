import { expect, it } from '@jest/globals';
import {
  compactCoachPlanDraftToolParametersSchema,
  expandAssessedDraft,
  expandCoachPlanDraftInput,
} from '../presentCoachPlanDraft.tool';
import type { AiToolContext } from '../../tool.types';
import { toolSchemaValidator } from '../../tool-input-validation';

it('keeps explicit fixed rest weekdays through compact draft expansion', () => {
  const scheduleConstraints = {
    version: 1,
    revision: 1,
    calendarTimeZone: 'UTC',
    effectiveFrom: '2026-11-22',
    fixedRestWeekdays: [3, 5],
    unavailableDates: [],
    availableDateOverrides: [],
    confirmation: { source: 'USER', reference: 'Current athlete request' },
  };
  const input = {
    title: 'Draft',
    periodWeeks: 1,
    scheduleConstraints,
    workouts: [
      {
        weekIndex: 1,
        dayIndex: 1,
        structureKind: 'FREEFORM',
        sportType: 'RUN',
        text: 'Easy run',
        notes: 'An easy run.',
      },
    ],
  };
  expect(
    toolSchemaValidator(compactCoachPlanDraftToolParametersSchema)(input)
      .success,
  ).toBe(true);
  expect(expandCoachPlanDraftInput(input)).toMatchObject({
    ok: true,
    data: { scheduleConstraints },
  });
});

it.each([
  ['2026-11-30', '2027-05-16', true],
  ['2026-11-30', undefined, true],
  ['2026-12-01', undefined, false],
  ['2026-11-26', '2027-05-15', false],
])('checks the schedule rule from %s through %s against the actual 24-week calendar', (from, until, accepted) => {
  const ctx = {
    currentTurnCalendar: { date: '2026-11-26', timezone: 'Asia/Shanghai' },
    planSuitability: { latest: { status: 'READY', constraints: { fixedTrainingWeekdays: [1, 3, 6] } } },
  } as unknown as AiToolContext;
  const scheduleConstraints = {
    version: 1, revision: 1, calendarTimeZone: 'Asia/Shanghai', effectiveFrom: from,
    ...(until && { effectiveUntil: until }), fixedRestWeekdays: [2, 4, 5, 7],
    unavailableDates: [], availableDateOverrides: [], confirmation: { source: 'USER', reference: 'Confirmed schedule' },
  };
  const result = expandAssessedDraft(ctx, {
    title: 'Mixed training', periodWeeks: 24, qualityContract: { startDate: '2026-11-30' },
    scheduleConstraints, workouts: [{ weekIndex: 1, dayIndex: 1, sportType: 'RUN', text: 'work 30m', notes: 'An easy run.' }],
  });
  if (accepted) expect(result).toMatchObject({ ok: true, data: { scheduleConstraints } });
  else expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/2026-11-30.*2027-05-16/) });
});
