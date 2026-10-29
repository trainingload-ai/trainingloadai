import { describe, expect, it } from '@jest/globals';
import {
  projectCoachCompetitionEvents,
  parseCoachCompetitionEvents,
} from '@shared/coach-competition-events';
import {
  coachStepBudgetReached,
  needsCoachDeliverySummary,
} from '../coach-delivery';
import {
  buildCoachUiCardToolUseBlocks,
  stopAfterUiSurfaceTool,
} from '../tool-loop-agent.runtime';

describe('evidence projection and final delivery', () => {
  const range = { startDate: '2026-10-01', endDate: '2026-12-31' };
  it('distinguishes an empty query from missing or failed output', () => {
    expect(projectCoachCompetitionEvents(range, { events: [] })).toEqual({
      kind: 'competition_events',
      ...range,
      events: [],
      total: 0,
    });
    for (const output of [
      undefined,
      { error: 'failed' },
      {},
      { events: [null] },
    ])
      expect(projectCoachCompetitionEvents(range, output)).toBeNull();
  });
  it('exposes only the safe competition projection and validates historical cards', () => {
    const data = projectCoachCompetitionEvents(range, {
      events: [
        {
          title: '秋季半马',
          startDate: '2026-11-01',
          id: 'private',
          userId: 'private',
          notes: 'private',
        },
      ],
    });
    expect(data?.events).toEqual([
      { title: '秋季半马', startDate: '2026-11-01', endDate: null },
    ]);
    expect(parseCoachCompetitionEvents(data)).toEqual(data);
    expect(parseCoachCompetitionEvents({ ...data, total: -1 })).toBeNull();
  });
  it('preserves tool call IDs even when parallel evidence payloads are equal', () => {
    const calls = ['one', 'two'].map((id) => ({
      id,
      name: 'competition.events.list',
      input: range,
    }));
    const result = buildCoachUiCardToolUseBlocks({
      tools: [],
      calls,
      results: calls.map((call) => ({
        ...call,
        ok: true,
        output: { events: [] },
      })),
    });
    expect(result).toEqual(
      calls.map((call) => ({
        type: 'tool_use',
        id: call.id,
        name: 'CompetitionEvents',
        input: { kind: 'competition_events', ...range, events: [], total: 0 },
      })),
    );
  });
  it.each([
    ['present_coach_plan_draft', 'coach_plan_draft'],
    ['present_plan_workout_adjustment_draft', 'plan_workout_adjustment_draft'],
    ['coach_decision_draft', 'coach_decision_draft'],
  ])(
    'reserves exactly one tool-free delivery step after %s',
    (toolName, kind) => {
      const steps = [{ toolResults: [{ toolName, output: { kind } }] }];
      expect(needsCoachDeliverySummary(steps)).toBe(true);
      expect(stopAfterUiSurfaceTool({ steps })).toBe(false);
      expect(coachStepBudgetReached(steps, 1)).toBe(false);
      expect(coachStepBudgetReached([...steps, {}], 1)).toBe(true);
      expect(needsCoachDeliverySummary([...steps, {}])).toBe(false);
    },
  );
  it('pauses at questions, and never grants repair steps beyond the normal budget', () => {
    const steps = [
      {
        toolResults: [
          {
            toolName: 'ask_user_question',
            output: { kind: 'ask_user_question' },
          },
        ],
      },
    ];
    expect(stopAfterUiSurfaceTool({ steps })).toBe(true);
    expect(needsCoachDeliverySummary(steps)).toBe(false);
    const invalid = [
      {
        toolResults: [
          {
            toolName: 'present_coach_plan_draft',
            output: { error: 'invalid' },
          },
        ],
      },
    ];
    expect(coachStepBudgetReached(invalid, 1)).toBe(true);
  });
});
