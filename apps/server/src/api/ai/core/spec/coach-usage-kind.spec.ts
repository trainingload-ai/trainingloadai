import { describe, expect, it } from '@jest/globals';

import { resolveCoachUsageKind } from '../coach-usage-kind';

function tool(name: string) {
  return {
    type: 'assistant' as const,
    message: { content: [{ type: 'tool_use', name }] },
  };
}

describe('resolveCoachUsageKind', () => {
  it('classifies a delivered plan draft as plan generation', () => {
    expect(resolveCoachUsageKind([tool('present_coach_plan_draft')])).toBe(
      'PLAN_GENERATION',
    );
  });

  it.each([
    'present_plan_workout_adjustment_draft',
    'mutation_plan_workout_update',
    'coach_decision_apply',
  ])('classifies %s as plan adjustment', (name) => {
    expect(resolveCoachUsageKind([tool(name)])).toBe('PLAN_ADJUSTMENT');
  });

  it('keeps ordinary read-tool conversations as coach chat', () => {
    expect(resolveCoachUsageKind([tool('profile_current')])).toBe('COACH_CHAT');
  });
});
