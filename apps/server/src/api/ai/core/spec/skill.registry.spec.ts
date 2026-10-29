import { describe, expect, it } from '@jest/globals';
import {
  getCoachSkillByName,
  getCoachSkills,
  listCoachSkillsForPrompt,
} from '../skill.registry';

describe('coach skill catalog', () => {
  it('publishes model-readable activation guidance instead of regex routing rules', () => {
    const catalog = listCoachSkillsForPrompt();
    expect(catalog.length).toBeGreaterThan(8);
    expect(
      catalog.every(
        (skill) =>
          skill.name.length > 0 &&
          skill.description.length > 20 &&
          skill.whenToUse.length > 20,
      ),
    ).toBe(true);
    expect(getCoachSkills().every((skill) => !('matchers' in skill))).toBe(
      true,
    );
  });

  it('resolves only explicit skill names and aliases deterministically', () => {
    expect(getCoachSkillByName('plan-builder')?.name).toBe('plan-builder');
    expect(getCoachSkillByName('workout-scheduling')?.name).toBe(
      'workout-management',
    );
    expect(getCoachSkillByName('single-workout-generator')?.name).toBe(
      'workout-generator',
    );
    expect(getCoachSkillByName('not-a-skill')).toBeNull();
    expect(getCoachSkillByName('training-chart')?.name).toBe(
      'training-analytics',
    );
    expect(
      listCoachSkillsForPrompt().some(
        (skill) => skill.name === 'workout-generator',
      ),
    ).toBe(false);
  });
});
