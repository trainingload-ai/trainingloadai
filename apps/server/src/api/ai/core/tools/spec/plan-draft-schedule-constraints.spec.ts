import { expect, it } from '@jest/globals';
import {
  compactCoachPlanDraftToolParametersSchema,
  expandCoachPlanDraftInput,
} from '../presentCoachPlanDraft.tool';
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
