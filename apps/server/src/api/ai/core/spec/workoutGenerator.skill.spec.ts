import { getCoachSkillByName } from '../skill.registry';

describe('workout-generator skill', () => {
  it('owns one Workout artifact without schedule or persistence capabilities', () => {
    const skill = getCoachSkillByName('workout-generator');
    expect(skill).not.toBeNull();
    expect(skill?.suggestedTools).toEqual([
      'workout.intensity_strategy',
      'coach_task_submit_result',
    ]);
    expect(skill?.prompt).toContain('Generate one Workout only');
    expect(skill?.prompt).toContain('Do not reassess the surrounding day');
    expect(skill?.prompt).toContain('Do not call mutation');
  });
});
