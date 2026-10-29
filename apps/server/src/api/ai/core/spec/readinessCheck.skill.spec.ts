import { describe, expect, it } from '@jest/globals';
import { readinessCheckSkill } from '../skills/readinessCheck.skill';

describe('readinessCheckSkill', () => {
  it('exposes progressive plan and training evidence without encoding a scenario conclusion', () => {
    expect(readinessCheckSkill.suggestedTools).toEqual(
      expect.arrayContaining([
        'training.readiness',
        'plan.execution_context',
        'plan.recent',
        'training.data_coverage',
      ]),
    );
    expect(readinessCheckSkill.prompt).toContain(
      'Examples describe possible evidence relationships, not special-case branches.',
    );
    expect(readinessCheckSkill.prompt).toContain(
      'These tools are progressive disclosure, not a checklist',
    );
  });
});
