import { describe, expect, it } from '@jest/globals';
import { scopeToolsByActiveSkill } from '../tool.registry';
import type { ActiveCoachSkill } from '../skill.types';
import type { AiToolDef } from '../tool.types';

function tool(name: string, extra: Partial<AiToolDef> = {}): AiToolDef {
  return {
    name,
    description: name,
    parameters: { type: 'object', additionalProperties: false },
    cost: 'low',
    execute: async () => ({}),
    ...extra,
  };
}

function activeSkill(
  name: string,
  suggestedTools: string[] = [],
): ActiveCoachSkill {
  return {
    name,
    description: name,
    whenToUse: name,
    prompt: name,
    suggestedTools,
    activatedBy: 'test',
  };
}

describe('coach tool scoping', () => {
  const tools = [
    tool('skill.activate'),
    tool('ask_user_question'),
    tool('memory.search'),
    tool('web.search'),
    tool('web.fetch'),
    tool('coach_decision_draft'),
    tool('training.baseline'),
    tool('training.plan_context', {
      applicableSkills: ['plan-builder'],
    }),
    tool('metric.history'),
    tool('integration.status', {
      applicableSkills: ['integration-support', 'plan-builder'],
    }),
    tool('present_coach_plan_draft', {
      applicableSkills: ['plan-builder', 'plan-cycle-review'],
    }),
    tool('mutation_plan_workout_update', {
      applicableSkills: ['plan-followup', 'plan-day-review'],
    }),
  ];

  it('keeps all tools when no skill is active', () => {
    expect(
      scopeToolsByActiveSkill(tools, null).map((item) => item.name),
    ).toEqual(tools.map((item) => item.name));
  });

  it('uses suggested tools plus matching applicable tools for an active skill', () => {
    const scoped = scopeToolsByActiveSkill(
      tools,
      activeSkill('plan-builder', ['training.baseline']),
    ).map((item) => item.name);

    expect(scoped).toEqual([
      'skill.activate',
      'ask_user_question',
      'memory.search',
      'web.search',
      'web.fetch',
      'coach_decision_draft',
      'training.baseline',
      'training.plan_context',
      'integration.status',
      'present_coach_plan_draft',
    ]);
    expect(scoped).not.toContain('metric.history');
    expect(scoped).not.toContain('mutation_plan_workout_update');
  });

  it('keeps matching applicable mutation tools even when they are not suggested', () => {
    const scoped = scopeToolsByActiveSkill(
      tools,
      activeSkill('plan-followup', ['training.baseline']),
    ).map((item) => item.name);

    expect(scoped).toContain('mutation_plan_workout_update');
    expect(scoped).toContain('memory.search');
    expect(scoped).toContain('web.search');
    expect(scoped).toContain('web.fetch');
    expect(scoped).not.toContain('present_coach_plan_draft');
  });

  it('exposes the integration truth tool to every explicitly supported skill', () => {
    const scoped = scopeToolsByActiveSkill(
      tools,
      activeSkill('integration-support', ['integration.status']),
    ).map((item) => item.name);

    expect(scoped).toContain('integration.status');
    expect(scoped).not.toContain('training.plan_context');
    expect(scoped).not.toContain('mutation_plan_workout_update');
  });
});
