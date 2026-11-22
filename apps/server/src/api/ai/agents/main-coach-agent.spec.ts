import { runMainCoachAgent } from './main-coach-agent';
import type { MetricExplanationRequest } from './coach-explainer-agent';
import type { CoachQueryYield } from '../core/coach-query-yield';
import { getCoachSkillByName } from '../core/skill.registry';
import { scopeToolsByActiveSkill } from '../core/tool.registry';
import { streamCoachAnswer } from '../core/tool-loop-agent.runtime';
import { buildAiTool, type AiToolDef } from '../core/tool.types';

jest.mock('../core/tool-loop-agent.runtime', () => ({
  streamCoachAnswer: jest.fn(),
}));

const stream = jest.mocked(streamCoachAnswer);
const usage: CoachQueryYield = {
  type: 'model_usage',
  model: 'test-model',
  status: 'SUCCESS',
  usage: { inputTokens: 10, outputTokens: 6 },
};
const finished: CoachQueryYield = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: 'Explanation delivered.',
};

function fixture() {
  const tools = [
    buildAiTool({
      name: 'metric.history',
      description: 'Read an athlete metric.',
      parameters: { type: 'object' },
      cost: 'low',
      kind: 'read',
      execute: async () => ({}),
    }),
    buildAiTool({
      name: 'plan.another_edit',
      description: 'Write to the plan.',
      parameters: { type: 'object' },
      cost: 'low',
      kind: 'mutation',
      execute: async () => ({}),
    }),
  ];
  return {
    ctx: {
      session: { user: { id: 'athlete' } },
      lang: 'en',
      signal: new AbortController().signal,
    } as Parameters<typeof streamCoachAnswer>[0]['ctx'],
    tools,
    messages: [{ role: 'user' as const, content: 'Private history' }],
  };
}

describe('Main Agent metric delegation', () => {
  beforeEach(() => stream.mockReset());

  it('delegates once within the original turn and accounts for the child model call', async () => {
    const input = fixture();
    const request: MetricExplanationRequest = {
      question: 'Why did FTP change?',
      scope: 'ATHLETE',
    };
    stream.mockImplementationOnce(async function* (main) {
      const tool = main.tools.find(
        (candidate) => candidate.name === 'metric.explain',
      ) as AiToolDef<MetricExplanationRequest>;
      const answer = await tool.execute(main.ctx, request);
      expect(answer).toEqual({
        status: 'EXPLAINED',
        explanation: 'FTP changed after the latest estimate.',
        evidenceTools: ['metric.history'],
      });
      expect(await tool.execute(main.ctx, request)).toEqual(answer);
      expect(
        await tool.execute(main.ctx, {
          ...request,
          question: 'Why did CTL change?',
        }),
      ).toEqual({ status: 'ALREADY_REQUESTED' });
      yield finished;
    });
    stream.mockImplementationOnce(async function* (child) {
      expect(child.messages.map((message) => message.content)).not.toContain(
        'Private history',
      );
      expect(child.tools.map((tool) => tool.name)).toEqual([
        'metric.history',
        'coach_task_submit_result',
      ]);
      expect(child.maxSteps).toBe(5);
      expect(child.ctx.session.user.id).toBe('athlete');
      const task = child.ctx.backgroundTask!;
      const result = {
        status: 'EXPLAINED',
        explanation: 'FTP changed after the latest estimate.',
      };
      expect(() => task.submitResult(result)).toThrow(
        'Read relevant athlete evidence',
      );
      task.completedToolNames!.add('metric.history');
      await task.submitResult(result);
      yield usage;
      yield finished;
    });
    const events: CoachQueryYield[] = [];
    for await (const event of runMainCoachAgent(input)) events.push(event);
    expect(events).toEqual([usage, finished]);
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it('keeps an ordinary reply on a single run', async () => {
    stream.mockImplementationOnce(async function* () {
      yield finished;
    });
    const events: CoachQueryYield[] = [];
    for await (const event of runMainCoachAgent(fixture())) events.push(event);
    expect(events).toEqual([finished]);
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('explains the saved review using only its server-selected evidence', async () => {
    const input = fixture();
    const review = {
      state: 'PROPOSED',
      factHash: 'saved-facts',
      rationale: 'Recovery between sessions is short.',
      baseEventSeq: 2,
      currentEventSeq: 4,
      committed: false,
      review: { scale: 'weekly' as const, evidenceCodes: ['SHORT_RECOVERY'] },
      adjustment: {
        kind: 'postpone',
        before: { date: '2026-11-21', expectedLoad: 30 },
        after: { date: '2026-11-22', expectedLoad: 30 },
      },
    };
    stream.mockImplementationOnce(async function* (main) {
      const tool = scopeToolsByActiveSkill(
        main.tools,
        getCoachSkillByName('plan-followup'),
      ).find((candidate) => candidate.name === 'review.explain') as AiToolDef<{
        question: string;
      }>;
      expect(
        main.tools.some((candidate) => candidate.name === 'metric.explain'),
      ).toBe(false);
      await expect(
        tool.execute(main.ctx, { question: 'Why did the date change?' }),
      ).resolves.toMatchObject({
        status: 'EXPLAINED',
        factHash: 'saved-facts',
        state: 'PROPOSED',
        committed: false,
      });
      yield finished;
    });
    stream.mockImplementationOnce(async function* (child) {
      expect(child.tools.map((tool) => tool.name)).toEqual([
        'coach_task_submit_result',
      ]);
      expect(child.messages[0].content).toEqual(
        expect.stringContaining('"factHash":"saved-facts"'),
      );
      await child.ctx.backgroundTask!.submitResult({
        status: 'EXPLAINED',
        explanation:
          'The pending recommendation would give more recovery time.',
      });
      yield finished;
    });
    const events: CoachQueryYield[] = [];
    for await (const event of runMainCoachAgent(input, review))
      events.push(event);
    expect(events).toEqual([finished]);
    expect(stream).toHaveBeenCalledTimes(2);
  });
});
