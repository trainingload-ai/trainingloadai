import { AiService } from '../ai.service';
import { streamCoachAnswer } from '../core/tool-loop-agent.runtime';

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
  const run = async (prompt: string, extra: Record<string, unknown> = {}) => {
    const stream = await service.coachStream({
      session: { user: { id: 'athlete' } },
      sid: 'session',
      lang: 'zh',
      prompt,
      signal: new AbortController().signal,
      ...extra,
    } as never);
    for await (const _event of stream) {
      /* drain */
    }
    return jest.mocked(streamCoachAnswer).mock.calls.at(-1)![0];
  };
  return { run, protocolReply, findFirst };
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
