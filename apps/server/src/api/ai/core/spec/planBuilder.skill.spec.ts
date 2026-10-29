import { describe, expect, it } from '@jest/globals';
import { buildCoachSystemPrompt } from '../coach.prompt';
import { PLAN_DRAFT_PROMPT_CONTRACT_LINES } from '../prompt-contracts/plan-draft.contract';
import {
  WORKOUT_DSL_CONTRACT_LINES,
  WORKOUT_INTENSITY_ANCHOR_CONTRACT_LINES,
} from '../prompt-contracts/workout-generation.contract';
import { planBuilderSkill } from '../skills/planBuilder.skill';
import { compactCoachPlanDraftToolParametersSchema } from '../tools/presentCoachPlanDraft.tool';

const activePlanBuilderSkill = {
  ...planBuilderSkill,
  suggestedTools: planBuilderSkill.suggestedTools ?? [],
  activatedBy: 'test',
};

describe('plan-builder prompt architecture', () => {
  it('keeps deterministic payload syntax in the scoped plan contract', () => {
    const contract = PLAN_DRAFT_PROMPT_CONTRACT_LINES.join('\n');
    expect(contract).toContain('specific athlete-facing title');
    expect(contract).toContain('2-5 concise sentences');
    expect(contract).toContain('RPE range and talk-test cue');
    expect(contract).toContain(
      'each RECOVERY or TAPER week must be strictly shorter than the previous week',
    );
    expect(contract).toContain(
      'week containing the goal race or final performance test is RACE rather than TAPER',
    );
    expect(contract).toContain(
      'Never turn a marathon, triathlon, or other goal event into a fabricated time-limited workout',
    );
    expect(contract).toContain('must match the complete DSL duration');
    expect(contract).toContain('active plan-draft tool schema');
    expect(contract).toContain(
      "notes` in the user's language that lets a non-technical athlete understand and execute the whole session",
    );
    expect(contract).toContain('Never say the plan has been saved');
    expect(WORKOUT_DSL_CONTRACT_LINES.join('\n')).toContain(
      'work 25m hr <150bpm',
    );
    expect(WORKOUT_DSL_CONTRACT_LINES.join('\n')).toContain(
      'Each step may contain at most one target',
    );
    expect(WORKOUT_DSL_CONTRACT_LINES.join('\n')).toContain(
      'repeat until <condition>',
    );
    expect(WORKOUT_INTENSITY_ANCHOR_CONTRACT_LINES.join('\n')).toContain(
      'zone vs fixed vs duration-only',
    );
  });

  it('keeps workout grammar with the tool payload instead of the global prompt', () => {
    const description =
      compactCoachPlanDraftToolParametersSchema.properties.workouts.items
        .properties.text.description;
    expect(description).toContain('work 25m hr <150bpm');
    expect(description).toContain('repeat until <condition>');
    expect(description).toContain('3x8+');
  });

  it('keeps the skill focused on coaching judgment instead of duplicating payload rules', () => {
    expect(planBuilderSkill.prompt).toContain(
      'facts or evidence that could change the schedule',
    );
    expect(planBuilderSkill.prompt).toContain(
      'generic templates need less evidence than race plans',
    );
    expect(planBuilderSkill.prompt).toContain(
      'not generator acceptance or one universal metric',
    );
    expect(planBuilderSkill.prompt).toContain(
      'Choose workout mix, progression, recovery placement',
    );
    expect(planBuilderSkill.prompt).toContain(
      'Never fake a race duration to fit the budget',
    );
    expect(planBuilderSkill.prompt).not.toContain('work 25m hr <150bpm');
    expect(planBuilderSkill.prompt).not.toContain('repeat until <condition>');
  });

  it('exposes relevant capabilities without prescribing a universal tool sequence', () => {
    expect(planBuilderSkill.suggestedTools).toContain('training.plan_context');
    expect(planBuilderSkill.suggestedTools).toContain(
      'workout.intensity_strategy',
    );
    expect(planBuilderSkill.suggestedTools).toContain(
      'plan.suitability_assess',
    );
    expect(planBuilderSkill.suggestedTools).toContain(
      'present_coach_plan_draft',
    );
    expect(planBuilderSkill.prompt).toContain(
      'Prefer training.plan_context for personalized plans',
    );
    expect(planBuilderSkill.prompt).not.toContain('mandatory tool pass');
    expect(planBuilderSkill.prompt).toContain(
      'Do not call present_coach_plan_draft until it returns READY',
    );
    expect(planBuilderSkill.prompt).toContain(
      'not generator acceptance or one universal metric',
    );
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
    const active = buildCoachSystemPrompt('zh', activePlanBuilderSkill);
    expect(generic.length).toBeLessThan(15_000);
    expect(active.length).toBeLessThan(20_000);
  });
});
