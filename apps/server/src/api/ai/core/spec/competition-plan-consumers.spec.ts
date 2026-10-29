import { describe, expect, it } from '@jest/globals';
import { planCycleReviewSkill } from '../skills/planCycleReview.skill';
import { planDayReviewSkill } from '../skills/planDayReview.skill';

describe('competition assessment plan consumers', () => {
  it.each([
    ['cycle review', planCycleReviewSkill],
    ['day review', planDayReviewSkill],
  ])('%s uses the dedicated impact source', (_label, skill) => {
    expect(skill.suggestedTools).toContain('competition.impact.resolve');
    expect(skill.prompt).toMatch(/validated competition impact/i);
    expect(skill.prompt).toMatch(/importance/i);
    expect(skill.prompt).toMatch(/impact/i);
  });
});
