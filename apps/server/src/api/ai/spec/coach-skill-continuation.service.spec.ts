import { AiService } from '../ai.service';
import { streamCoachAnswer } from '../core/tool-loop-agent.runtime';
import type { CoachQueryYield } from '../core/coach-query-yield';

jest.mock('../core/coach-upstream.adapter', () => ({
  ...jest.requireActual('../core/coach-upstream.adapter'),
  isCoachUpstreamConfigured: () => true,
  getCoachUpstreamProvider: () => 'openrouter',
}));
jest.mock('../core/tool-loop-agent.runtime', () => ({
  ...jest.requireActual('../core/tool-loop-agent.runtime'),
  streamCoachAnswer: jest.fn(async function* () {
    yield { type: 'result', subtype: 'success', is_error: false, result: '' };
  }),
}));

function fixture() {
  const service = Object.create(AiService.prototype) as AiService;
  const task = {
    stage: 'WAITING_USER',
    lastCalculationId: 'previous',
    revision: 3,
  };
  const protocolReply = jest.fn(async () => ({ status: 'NEEDS_INPUT' }));
  const findFirst = jest.fn(async (_query: unknown) => null as unknown);
  Object.assign(service, {
    logger: { log: jest.fn() },
    aiDataConsent: { assertGranted: jest.fn(async () => undefined) },
    loadCoachContextFromDb: jest.fn(async () => ({ rows: [], summary: '' })),
    fitnessCalculations: {
      currentTask: jest.fn(async () => task),
      protocolReply,
    },
    prisma: { aiCoachMessage: { findFirst } },
  });
  const reply = async (prompt: string, extra: Record<string, unknown> = {}) => {
    const stream = await service.coachStream({
      session: { user: { id: 'athlete' } },
      sid: 'session',
      lang: 'zh',
      prompt,
      signal: new AbortController().signal,
      ...extra,
    } as never);
    const events: CoachQueryYield[] = [];
    for await (const event of stream) events.push(event);
    return events;
  };
  const run = async (prompt: string, extra?: Record<string, unknown>) => {
    await reply(prompt, extra);
    return jest.mocked(streamCoachAnswer).mock.calls.at(-1)![0];
  };
  return { service, run, reply, protocolReply, findFirst };
}

describe('AiService continuation ownership', () => {
  const previousFlag = process.env.FITNESS_ASSESSMENT_ENABLED;
  beforeEach(() => {
    process.env.FITNESS_ASSESSMENT_ENABLED = 'true';
    jest.clearAllMocks();
  });
  afterAll(() => {
    if (previousFlag === undefined)
      delete process.env.FITNESS_ASSESSMENT_ENABLED;
    else process.env.FITNESS_ASSESSMENT_ENABLED = previousFlag;
  });

  it.each([
    '今天调整跑步计划',
    '根据最近记录画VO2max趋势',
    'apply a different chart layout',
  ])(
    'leaves a new objective available for model selection despite a pending fitness task: %s',
    async (prompt) => {
      const f = fixture();
      const call = await f.run(prompt);
      expect(call.activeSkill).toBeNull();
      expect(call.ctx.fitnessConfirmation).toBeUndefined();
      expect(call.ctx.fitnessTrackingReply).toBeUndefined();
      expect(f.protocolReply).not.toHaveBeenCalled();
    },
  );

  it('honors a new explicit plan entry rather than a pending fitness task', async () => {
    const f = fixture();
    expect(
      (await f.run('今天调整跑步计划', { intent: 'plan-followup' })).activeSkill
        ?.name,
    ).toBe('plan-followup');
  });

  it.each([{ intent: 'plan-builder' }, {}])('re-reads changed facts before publishing a plan question with entry %j', async (entry) => {
    const f = fixture();
    const oldFacts = {
      date: '2026-11-20',
      timezone: 'UTC',
      status: 'AVAILABLE',
      revision: 'before',
      health: null,
      memory: null,
      limitations: [],
      training: { activityRevision: 'no-runs' },
    };
    const latestFacts = {
      ...oldFacts,
      revision: 'after',
      training: { activityRevision: 'synced-runs' },
    };
    const build = jest
      .fn(async () => latestFacts)
      .mockResolvedValueOnce(oldFacts);
    const bindFactScope = jest.fn(async () => undefined);
    Object.assign(f.service, {
      userService: { getPreferredTimezone: async () => 'UTC' },
      factContext: { build },
      coachRuns: { bindFactScope },
    });
    const question = {
      id: 'baseline',
      header: 'Running background',
      question: 'How many days do you run?',
      options: [
        { value: 'one', label: 'One', description: 'One day a week' },
        { value: 'two', label: 'Two', description: 'Two days a week' },
      ],
    };
    const terminal = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '',
    } as const;
    jest
      .mocked(streamCoachAnswer)
      .mockImplementationOnce(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'old-question',
                name: 'AskUserQuestion',
                input: {
                  questions: [question],
                  metadata: { skill: 'plan-builder' },
                },
              },
            ],
          },
        };
        yield terminal;
      })
      .mockImplementationOnce(async function* ({ ctx }) {
        ctx.planQuestionReview!.decisions = [
          {
            id: 'baseline',
            outcome: 'ANSWERED',
            reason: 'Recently synced activities answer the baseline question.',
          },
        ];
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'draft',
                name: 'PresentCoachPlanDraft',
                input: { title: 'Starter week' },
              },
            ],
          },
        };
        yield terminal;
      });
    const prompt = 'Build an eight-week running plan with my current training.';
    const events = await f.reply(prompt, {
      ...entry,
      runtimeRunId: 'run',
      currentUserMessageId: 'input',
      operationId: 'operation',
    });
    expect(events.map((event) => event.type)).toEqual(['assistant', 'result']);
    expect(JSON.stringify(events)).toContain('PresentCoachPlanDraft');
    expect(JSON.stringify(events)).not.toContain('old-question');
    expect(streamCoachAnswer).toHaveBeenCalledTimes(2);
    expect(jest.mocked(streamCoachAnswer).mock.calls[0][0].activeSkill?.name).toBe(
      entry.intent,
    );
    const nextCall = jest.mocked(streamCoachAnswer).mock.calls[1][0];
    expect(nextCall.ctx).toMatchObject({
      sid: 'session',
      aiOperationId: 'operation',
      currentUserMessageId: 'input',
      planQuestionReview: { questions: [question] },
    });
    expect(nextCall.coachFacts).toBe(latestFacts);
    expect(
      nextCall.tools.find(({ name }) => name === 'plan.suitability_assess')
        ?.parameters,
    ).toMatchObject({
      required: expect.arrayContaining(['questionReview']),
      properties: {
        questionReview: {
          items: { properties: { id: { enum: ['baseline'] } } },
        },
      },
    });
    expect(JSON.stringify(nextCall.messages)).toContain(prompt);
    expect(JSON.stringify(nextCall.messages)).toContain(
      'Changed evidence: training.',
    );
    expect(bindFactScope.mock.calls).toEqual([
      ['athlete', 'run', expect.objectContaining({ revision: 'before' })],
      ['athlete', 'run', expect.objectContaining({ revision: 'after' })],
    ]);
  });

  it('restores the persisted question owner and its original question', async () => {
    const f = fixture();
    f.findFirst.mockImplementation(async (query: any) =>
      query.where.role === 'ASSISTANT'
        ? {
            message: {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'question',
                  name: 'AskUserQuestion',
                  input: {
                    metadata: { skill: 'fitness-assessment' },
                    questions: [
                      { id: 'effort', question: 'Was this a solo test?' },
                    ],
                  },
                },
              ],
            },
          }
        : { id: 'user-message' },
    );
    const call = await f.run('不是测试，只是恢复骑行', {
      intent: 'plan-builder',
      message: {
        content: [
          { type: 'text', text: '不是测试，只是恢复骑行' },
          {
            type: 'tool_result',
            tool_use_id: 'question',
            content: {
              kind: 'coach_question_reply',
              repliesToAssistantMessageId: 'assistant-message',
              questionToolUseId: 'question',
              answers: { effort: 'ordinary' },
              notes: {},
            },
          },
        ],
      },
    });
    expect(call.activeSkill?.name).toBe('fitness-assessment');
    expect(JSON.stringify(call.messages)).toContain('Was this a solo test?');
    expect(f.protocolReply).not.toHaveBeenCalled();
    expect(call.ctx.fitnessConfirmation).toBeUndefined();
  });

  it('retains the existing exact legacy protocol reply path', async () => {
    const f = fixture();
    const call = await f.run('只是轻松骑行');
    expect(call.activeSkill?.name).toBe('fitness-assessment');
    expect(f.protocolReply).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'athlete', sessionId: 'session' }),
      'previous',
      3,
      'ORDINARY',
      'unpersisted-user-turn',
    );
  });
});
