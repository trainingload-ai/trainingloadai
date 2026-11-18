import { describe, expect, it } from '@jest/globals';
import { buildCoachSystemPrompt } from '../coach.prompt';
import {
  getCoachSkillByName,
  getCoachSkills,
  listCoachSkillsForPrompt,
} from '../skill.registry';
import {
  COACH_TOOL_DEFINITIONS,
  getCoachTools,
  scopeToolsByActiveSkill,
} from '../tool.registry';
import { toolMatchesName } from '../tool.types';
import { skillActivateTool } from '../tools/skillActivate.tool';

// These checks exercise the production definitions, not simplified substitute tools.
describe('coach skill capability composition', () => {
  it.each(getCoachSkills().map((skill) => [skill.name]))(
    'keeps every suggested capability reachable after activating %s',
    (name) => {
      const skill = getCoachSkillByName(name)!;
      const scoped = scopeToolsByActiveSkill(
        [...COACH_TOOL_DEFINITIONS],
        skill,
      );
      for (const suggested of skill.suggestedTools) {
        expect(scoped.some((tool) => toolMatchesName(tool, suggested))).toBe(
          true,
        );
      }
    },
  );

  it.each(['metric-explainer', 'readiness-check'])(
    'can query the selected future PMC scenario from %s',
    (name) => {
      expect(
        scopeToolsByActiveSkill(
          [...COACH_TOOL_DEFINITIONS],
          getCoachSkillByName(name),
        ).map((tool) => tool.name),
      ).toContain('pmc.projection');
    },
  );

  it('keeps task-owned skills resolvable without offering them as chat entries', async () => {
    const catalog = listCoachSkillsForPrompt();
    for (const name of [
      'athlete-state',
      'workout-generator',
      'activity-review',
      'period-review',
      'plan-review-adjustment',
    ]) {
      expect(getCoachSkillByName(name)).not.toBeNull();
      expect(catalog.some((entry) => entry.name === name)).toBe(false);
      expect(
        await skillActivateTool.execute({} as never, { name }),
      ).toMatchObject({ activated: false });
    }
    expect(getCoachSkillByName('workout-review')?.name).toBe('activity-review');
    expect(
      await skillActivateTool.execute({} as never, { name: 'workout-editor' }),
    ).toMatchObject({ activated: true, skill: { name: 'workout-management' } });
  });

  it('keeps switching discoverable in chat but omits it from fixed server tasks', () => {
    const skill = getCoachSkillByName('plan-day-review');
    const chat = buildCoachSystemPrompt('en', skill);
    expect(chat).toContain('# Available skills');
    for (const entry of listCoachSkillsForPrompt()) {
      expect(chat).toContain(`- ${entry.name}:`);
    }
    const background = buildCoachSystemPrompt('en', skill, null, {
      serverOwnedTask: true,
    });
    expect(background).not.toContain('# Available skills');
    expect(background).not.toContain('# Workout operation decision guide');
  });

  it('cannot expand a fixed read-only task envelope by changing guidance', async () => {
    const tools = await getCoachTools({
      ctx: { session: { user: { id: 'athlete' } } } as never,
      scopeBySkill: false,
      candidateToolNames: ['training.readiness', 'plan.by_id'],
    });
    const switched = scopeToolsByActiveSkill(
      tools,
      getCoachSkillByName('workout-management'),
    );
    expect(switched.length).toBeGreaterThan(0);
    expect(switched.every((tool) => (tool.kind ?? 'read') === 'read')).toBe(
      true,
    );
    expect(switched.some((tool) => tool.name === 'coach_decision_apply')).toBe(
      false,
    );
  });

  it('keeps generic and active prompts within the existing size ceilings', () => {
    expect(buildCoachSystemPrompt('zh').length).toBeLessThan(15_000);
    for (const definition of getCoachSkills()) {
      const skill = getCoachSkillByName(definition.name);
      const prompt = buildCoachSystemPrompt('zh', skill, null, {
        serverOwnedTask: definition.catalogVisible === false,
        publicReasoningSummary: true,
      });
      expect(prompt.length).toBeLessThan(20_000);
    }
  });
});
