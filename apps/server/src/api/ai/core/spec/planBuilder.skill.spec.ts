import { describe, expect, it } from '@jest/globals';
import { buildCoachSystemPrompt } from '../coach.prompt';
import { planBuilderSkill } from '../skills/planBuilder.skill';
import { compactCoachPlanDraftToolParametersSchema } from '../tools/presentCoachPlanDraft.tool';

const activePlanBuilderSkill = {
  ...planBuilderSkill,
  suggestedTools: planBuilderSkill.suggestedTools ?? [],
  activatedBy: 'test',
};

describe('plan-builder prompt architecture', () => {
  it('keeps saved-plan replacement and unrelated card presentation guidance outside the new-plan workflow', () => {
    const active = buildCoachSystemPrompt('zh', activePlanBuilderSkill);
    expect(active).not.toContain('# Prescription replacement contract');
    expect(active).not.toContain('currentVo2Max:true');
    expect(buildCoachSystemPrompt('zh')).toContain('currentVo2Max:true');
  });

  it('gives the active coach the schedule, recovery and repair contracts', () => {
    const active = buildCoachSystemPrompt('zh', activePlanBuilderSkill);
    for (const term of [
      'isoWeekday',
      'durationMinutes',
      'plannedSessionRpe',
      'RECOVERY',
      'TAPER',
      'RACE',
      'repairWeeks',
      'assessmentId',
      'templateId',
    ]) expect(active).toContain(term);
    expect(active).toMatch(/weekly total/i);
    expect(active).toMatch(/timed benchmark/i);
  });

  it('publishes the endurance and strength grammar once for templates and inline workouts', () => {
    const schema = JSON.stringify(compactCoachPlanDraftToolParametersSchema);
    for (const example of ['work 25m hr <150bpm', 'repeat until <condition>']) {
      expect(schema.split(example)).toHaveLength(2);
    }
    expect(schema).toContain('3x8+');
    expect(schema).toContain('"sessionTemplates"');
    expect(schema).toContain('"workouts"');
  });

  it('makes assessment, clarification and both planning modes available', () => {
    expect(planBuilderSkill.suggestedTools).toEqual(expect.arrayContaining([
      'ask_user_question',
      'training.plan_context',
      'workout.intensity_strategy',
      'plan.suitability_assess',
      'present_coach_plan_draft',
    ]));
    const active = buildCoachSystemPrompt('zh', activePlanBuilderSkill);
    for (const status of ['NEEDS_INPUT', 'NEEDS_ADJUSTMENT', 'READY']) {
      expect(active).toContain(status);
    }
    expect(active).toMatch(/continuous plan.*one starter week/i);
    expect(active).toMatch(/fixed plan.*phases.*every week/i);
  });

  it('injects the heavy plan contract only for plan-builder and only once', () => {
    const generic = buildCoachSystemPrompt('zh');
    const active = buildCoachSystemPrompt('zh', activePlanBuilderSkill);
    expect(generic).not.toContain('# Plan draft payload contract');
    expect(generic).not.toContain('work 25m hr <150bpm');
    expect(active.match(/# Plan draft payload contract/g)).toHaveLength(1);
    expect(active).not.toContain('work 25m hr <150bpm');
    expect(active).toContain('present_coach_plan_draft');
  });

  it('keeps prompt size bounded after skill activation', () => {
    const generic = buildCoachSystemPrompt('zh');
    const active = buildCoachSystemPrompt('zh', activePlanBuilderSkill, null, {
      publicReasoningSummary: true,
    });
    expect(generic.length).toBeLessThan(15_000);
    expect(active.length).toBeLessThan(20_000);
  });
});
