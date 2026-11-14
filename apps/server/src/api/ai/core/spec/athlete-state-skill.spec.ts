import { restoreReferencedQuestion } from '../coach-question-reference';
import { buildHistoryMessages } from '../coach-history-messages';
import { athleteStateAnswerTool } from '../tools/athleteStateAnswer.tool';
import { healthSummaryTool } from '../tools/healthSummary.tool';
import {
  getCoachTools,
  scopeToolsByActiveSkill,
  COACH_TOOL_DEFINITIONS,
} from '../tool.registry';
import {
  ATHLETE_STATE_TOOLS,
  athleteStateSkill,
} from '../skills/athleteState.skill';

describe('Athlete State in the shared Coach runtime', () => {
  it('keeps the original question in context even after it leaves the recent window', () => {
    const rows = [];
    const question = {
      questions: [
        {
          id: 'recovery',
          header: 'Recovery',
          question: 'Did the effort feel unusually hard?',
          options: [{ label: 'Yes', description: 'More difficult than usual' }],
        },
      ],
    };
    restoreReferencedQuestion(rows, question, 'owned-question');
    restoreReferencedQuestion(rows, question, 'owned-question');
    expect(rows).toHaveLength(1);
    const history = buildHistoryMessages({
      provider: 'openrouter',
      rows,
      currentUserMessage: {
        content: [{ type: 'text', text: 'Yes, unusually hard.' }],
      },
      thinking: false,
    });
    expect(JSON.stringify(history)).toContain(
      'Did the effort feel unusually hard?',
    );
    expect(JSON.stringify(history)).toContain('Yes, unusually hard.');
  });

  it('exposes the same bounded read/question/result tools on passive and resumed turns', async () => {
    const tools = await getCoachTools({
      ctx: {
        session: { user: { id: 'athlete' } },
        activeSkillName: 'athlete-state',
        athleteState: { submit: jest.fn(), recordRead: jest.fn() },
        healthData: {},
      } as never,
      activeSkill: athleteStateSkill as never,
      scopeBySkill: false,
      candidateToolNames: [...ATHLETE_STATE_TOOLS],
    });
    expect(tools.map((tool) => tool.name)).toContain('athlete_state.answer');
    expect(tools.map((tool) => tool.name)).toContain('health.summary');
    const scoped = scopeToolsByActiveSkill(
      COACH_TOOL_DEFINITIONS.filter((tool) =>
        ATHLETE_STATE_TOOLS.includes(tool.name as never),
      ),
      athleteStateSkill as never,
    ).map((tool) => tool.name);
    expect(scoped).toContain('training.data_coverage');
    expect(scoped).toContain('integration.status');
    expect(scoped).toContain('plan.execution_context');
    expect(tools.map((tool) => tool.name)).not.toContain('skill.activate');
    expect(
      tools.every((tool) => tool.kind !== 'mutation' && tool.kind !== 'draft'),
    ).toBe(true);
  });

  it('reads selected recovery facts through the existing health query without changing units or dates', async () => {
    const facts = {
      days: [
        {
          date: '2026-11-13',
          timezone: 'Asia/Shanghai',
          metrics: [
            {
              type: 'HRV_RMSSD_MS',
              value: 42,
              unit: 'ms',
              provider: 'INTERVALS_ICU',
            },
          ],
        },
      ],
    };
    const getOverview = jest.fn(async () => facts);
    expect(
      await healthSummaryTool.execute(
        {
          session: { user: { id: 'athlete' } },
          healthData: { getOverview },
        } as never,
        { days: 42, endDate: '2026-11-13' },
      ),
    ).toEqual(facts);
    expect(getOverview).toHaveBeenCalledWith('athlete', 42, '2026-11-13');
  });

  it('terminates a passive task after saving but lets a resumed turn explain its saved result', async () => {
    const submit = jest.fn(async () => ({
      assessmentId: 'state',
      state: 'STABLE',
      confidence: 0.8,
    }));
    const ctx = { athleteState: { submit } };
    expect(
      await athleteStateAnswerTool.execute(ctx as never, {
        result: {} as never,
      }),
    ).toMatchObject({ kind: 'athlete_state_saved' });
    expect(
      await athleteStateAnswerTool.execute(
        { ...ctx, backgroundTask: {} } as never,
        { result: {} as never },
      ),
    ).toMatchObject({ kind: 'coach_task_result_accepted' });
  });
});
