import {
  COACH_SKILL_LABELS,
  COACH_TOOL_LABELS,
} from '@shared/ai-coach-activity-catalog';
import { getCoachSkills } from '../skill.registry';
import { COACH_TOOL_DEFINITIONS } from '../tool.registry';

describe('Coach public activity catalog', () => {
  it('names every registered skill and tool without executing them', () => {
    expect(
      getCoachSkills()
        .map((skill) => skill.name)
        .sort(),
    ).toEqual(Object.keys(COACH_SKILL_LABELS).sort());
    // Retired activity.recent events still exist in persisted histories.
    expect(
      [
        ...COACH_TOOL_DEFINITIONS.map((tool) => tool.name),
        'activity.recent',
      ].sort(),
    ).toEqual(Object.keys(COACH_TOOL_LABELS).sort());
  });
});
import { describe, expect, it } from '@jest/globals';
