import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test';
import { streamCoachAnswer } from '../tool-loop-agent.runtime';
import { createAiSdkCoachTools } from '../ai-sdk-tool-adapter';
import type { AiToolContext, AiToolDef } from '../tool.types';
import type { CoachQueryYield } from '../coach-query-yield';
import { CoachRunProjector, coachSnapshotChunks } from '../coach-run-projector';
import { readUIMessageStream } from 'ai';
import type { CoachUiChunk, CoachUiMessage } from '../coach-ui-message-stream';
import { askUserQuestionTool } from '../tools/askUserQuestion.tool';
import { presentTrainingVisualizationTool } from '../tools/presentTrainingVisualization.tool';
import { sanitizeStoredCoachMessageForClient } from '../coach-history-messages';

let model: MockLanguageModelV3;
type StreamChunk =
  Awaited<
    ReturnType<MockLanguageModelV3['doStream']>
  >['stream'] extends ReadableStream<infer T>
    ? T
    : never;
jest.mock('../coach-upstream.adapter', () => ({
  ...jest.requireActual<typeof import('../coach-upstream.adapter')>(
    '../coach-upstream.adapter',
  ),
  getCoachModel: () => 'test-primary',
  getCoachUpstreamProvider: () => 'openrouter',
  createCoachLanguageModel: () => model,
  getCoachBaseUrlForLog: () => 'test',
}));

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};
const ctx = (): AiToolContext =>
  ({
    signal: new AbortController().signal,
    lang: 'zh',
    session: { user: { id: 'test' } },
    userService: { getPreferredTimezone: async () => 'UTC' },
    i18n: { t: (key: string) => key },
  }) as unknown as AiToolContext;
const draft = {
  kind: 'coach_plan_draft',
  title: '恢复跑步习惯',
  description: '每周三次轻松训练，训练日之间留出恢复时间。',
  periodWeeks: 6,
  workouts: [],
};
const finalText =
  '根据你恢复跑步习惯的目标，这份草案每周安排三次轻松训练，并在训练日之间留出恢复时间。请先检查安排，确认后点击保存草案；目前尚未保存。';
const tool = (execute: AiToolDef['execute']): AiToolDef => ({
  name: 'present_coach_plan_draft',
  kind: 'read',
  cost: 'low',
  description: 'present draft',
  parameters: {
    type: 'object',
    properties: { title: { type: 'string' } },
    additionalProperties: false,
  },
  execute,
});

function setupModel(
  mode: 'text' | 'empty' | 'error' = 'text',
  callCount = 1,
  toolName = 'present_coach_plan_draft',
  publicPrelude?: string,
) {
  const responses: Awaited<ReturnType<MockLanguageModelV3['doStream']>>[] = [
    {
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        ...(publicPrelude
          ? [
              { type: 'reasoning-start' as const, id: 'private' },
              {
                type: 'reasoning-delta' as const,
                id: 'private',
                delta: 'PRIVATE_REASONING_DO_NOT_PUBLISH',
              },
              { type: 'reasoning-end' as const, id: 'private' },
              { type: 'text-start' as const, id: 'public' },
              {
                type: 'text-delta' as const,
                id: 'public',
                delta: publicPrelude,
              },
              { type: 'text-end' as const, id: 'public' },
            ]
          : []),
        ...Array.from({ length: callCount }, (_, index) => ({
          type: 'tool-call' as const,
          toolCallId: `draft-${index}`,
          toolName,
          input: JSON.stringify({ title: draft.title }),
        })),
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage,
        },
      ]),
    },
    {
      stream: convertArrayToReadableStream<StreamChunk>(
        mode === 'error'
          ? [
              {
                type: 'error',
                error: Object.assign(new Error('rate limited'), {
                  status: 429,
                }),
              },
            ]
          : [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'summary' },
              {
                type: 'text-delta',
                id: 'summary',
                delta: mode === 'empty' ? '' : finalText,
              },
              { type: 'text-end', id: 'summary' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage,
              },
            ],
      ),
    },
  ];
  let call = 0;
  model = new MockLanguageModelV3({
    doStream: async () => responses[call++],
  });
}

describe('real AI SDK delivery loop', () => {
  it.each(['exhausted', 'abandoned'] as const)(
    'does not report a chart as completed when repair is %s',
    async (mode) => {
      let calls = 0;
      model = new MockLanguageModelV3({
        doStream: async () => {
          calls += 1;
          if (calls > 3) throw new Error('chart repair budget exceeded');
          return {
            stream: convertArrayToReadableStream<StreamChunk>(
              mode === 'abandoned' && calls === 2
                ? [
                    { type: 'stream-start', warnings: [] },
                    { type: 'text-start', id: 'answer' },
                    {
                      type: 'text-delta',
                      id: 'answer',
                      delta: '这次没有生成图表。',
                    },
                    { type: 'text-end', id: 'answer' },
                    {
                      type: 'finish',
                      finishReason: { unified: 'stop', raw: 'stop' },
                      usage,
                    },
                  ]
                : [
                    { type: 'stream-start', warnings: [] },
                    {
                      type: 'tool-call',
                      toolCallId: `chart-${calls}`,
                      toolName: 'present_training_visualization',
                      input: JSON.stringify({
                        source: 'PMC',
                        intent: 'TREND',
                        from: '2026-04-09',
                        to: '2026-10-09',
                        measures: ['CTL'],
                      }),
                    },
                    {
                      type: 'finish',
                      finishReason: {
                        unified: 'tool-calls',
                        raw: 'tool_calls',
                      },
                      usage,
                    },
                  ],
            ),
          };
        },
      });
      const execute = jest.fn<AiToolDef['execute']>(async () => ({}));
      const events: CoachQueryYield[] = [];
      for await (const event of streamCoachAnswer({
        ctx: ctx(),
        tools: [{ ...presentTrainingVisualizationTool, execute }],
        messages: [{ role: 'user', content: '看看负荷图' }],
      }))
        events.push(event);
      expect(calls).toBe(mode === 'exhausted' ? 3 : 2);
      expect(execute).not.toHaveBeenCalled();
      expect(
        events.filter((event) => event.type === 'result').at(-1),
      ).toMatchObject({
        is_error: true,
        error_code: 'invalid_ui_surface_payload',
      });
    },
  );
  it.each([false, true])(
    'handles real schema repair, persists each attempt and only exposes the final outcome (exhausted=%s)',
    async (exhausted) => {
      const valid = {
        questions: [
          {
            id: 'goal',
            header: '目标',
            question: '下一步做什么？',
            options: [
              {
                value: 'view',
                label: '看看记录',
                description: '先了解近期训练',
              },
              { value: 'plan', label: '制定计划', description: '安排后续训练' },
            ],
          },
        ],
      };
      let calls = 0;
      model = new MockLanguageModelV3({
        doStream: async () => {
          calls += 1;
          if (calls > 4) throw new Error('repair budget was not bounded');
          return {
            stream: convertArrayToReadableStream<StreamChunk>([
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-call',
                toolCallId: `question-${calls}`,
                toolName: 'ask_user_question',
                input: JSON.stringify(
                  !exhausted && calls === 3 ? valid : { questions: [] },
                ),
              },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                usage,
              },
            ]),
          };
        },
      });
      const p = new CoachRunProjector({
        run: {
          runId: 'run',
          attemptId: 'attempt',
          messageId: 'message',
          revision: 0,
          status: 'running',
          startedAt: new Date().toISOString(),
          executionMs: 0,
          previousExecutionMs: 0,
        },
      });
      p.start();
      const execute = jest.fn<AiToolDef['execute']>(async (_ctx, input) => ({
        kind: 'ask_user_question',
        ...input,
      }));
      const events: CoachQueryYield[] = [];
      for await (const event of streamCoachAnswer({
        ctx: {
          ...ctx(),
          onActivity: async (activity) => {
            p.consume({ type: 'activity', activity });
          },
        },
        tools: [{ ...askUserQuestionTool, execute }],
        messages: [{ role: 'user', content: '帮我看看训练' }],
      })) {
        events.push(event);
        p.consume(event);
      }
      expect(model.doStreamCalls).toHaveLength(3);
      expect(execute).toHaveBeenCalledTimes(exhausted ? 0 : 1);
      expect(events.filter((e) => e.type === 'result').at(-1)).toMatchObject({
        is_error: exhausted,
      });
      p.finish(exhausted ? 'failed' : 'awaiting_input');
      const stored = p.envelope().message;
      expect(
        stored.activityAudit.filter((e) => e.status === 'failed'),
      ).toHaveLength(exhausted ? 3 : 2);
      expect(JSON.stringify(stored.providerHistory)).toContain('question-1');
      expect(JSON.stringify(stored.providerHistory)).toContain(
        'must NOT have fewer than 1 items',
      );
      const publicMessage = sanitizeStoredCoachMessageForClient(stored);
      expect(JSON.stringify(publicMessage)).not.toContain(
        'must NOT have fewer',
      );
      expect(JSON.stringify(publicMessage)).not.toContain('activityAudit');
      const failures = p.message.parts.filter(
        (part) =>
          part.type === 'data-coach-activity' &&
          part.data.display !== 'hidden' &&
          part.data.status === 'failed',
      );
      expect(failures).toHaveLength(exhausted ? 1 : 0);
      expect(p.pendingInteraction !== null).toBe(!exhausted);
    },
  );
  const oldBudget = process.env.AI_COACH_MAX_AGENT_STEPS;
  afterEach(() => {
    if (oldBudget === undefined) delete process.env.AI_COACH_MAX_AGENT_STEPS;
    else process.env.AI_COACH_MAX_AGENT_STEPS = oldBudget;
  });
  it.each([true, false])(
    'publishes only public tool preludes with deep mode=%s, and restores the same message',
    async (thinking) => {
      const publicText =
        '近期训练量会影响起始负荷；我会先核对这项依据，再安排递进幅度。';
      setupModel('text', 2, 'activity_recent', publicText);
      const p = new CoachRunProjector({
        run: {
          runId: 'run',
          attemptId: 'attempt',
          messageId: 'message',
          revision: 0,
          status: 'running',
          startedAt: '2026-10-09T00:00:00.000Z',
          executionMs: 0,
          previousExecutionMs: 0,
        },
      });
      const chunks: CoachUiChunk[] = p.start();
      const events: CoachQueryYield[] = [];
      for await (const event of streamCoachAnswer({
        ctx: ctx(),
        thinking,
        tools: [
          {
            ...tool(async () => ({ kind: 'activity_recent', items: [] })),
            name: 'activity.recent',
            isConcurrencySafe: true,
          },
        ],
        messages: [{ role: 'user', content: '根据近期活动安排训练' }],
      })) {
        events.push(event);
        chunks.push(...p.consume(event));
      }
      chunks.push(...p.finish('completed'));
      const summaries = events.filter(
        (event) => event.type === 'activity' && event.activity.publicSummary,
      );
      expect(summaries).toHaveLength(thinking ? 1 : 0);
      if (thinking)
        expect(summaries[0]).toMatchObject({
          activity: {
            key: 'model:1:1',
            publicSummary: {
              source: 'assistant_public_summary',
              text: publicText,
            },
          },
        });
      expect(model.doStreamCalls).toHaveLength(2); // no classifier or summarizer request
      const system = JSON.stringify(model.doStreamCalls[0].prompt);
      expect(system.includes('This is a public reasoning summary')).toBe(
        thinking,
      );
      expect(JSON.stringify(p.message)).not.toContain(
        'PRIVATE_REASONING_DO_NOT_PUBLISH',
      );
      expect(p.envelope().content).toBe(finalText); // the summary is not the final answer
      const collect = async (frames: CoachUiChunk[]) => {
        let last: CoachUiMessage;
        for await (const message of readUIMessageStream<CoachUiMessage>({
          stream: new ReadableStream({
            start(controller) {
              frames.forEach((frame) => controller.enqueue(frame));
              controller.close();
            },
          }),
        }))
          last = message;
        return last;
      };
      expect(await collect(chunks)).toEqual(p.message);
      expect(
        await collect(coachSnapshotChunks('message', p.envelope().message)),
      ).toEqual(p.message);
    },
  );
  it('delivers card then final text, including at the step limit, without replaying tools', async () => {
    process.env.AI_COACH_MAX_AGENT_STEPS = '1';
    setupModel();
    const execute = jest.fn<AiToolDef['execute']>(async () => draft);
    const events: CoachQueryYield[] = [];
    for await (const event of streamCoachAnswer({
      ctx: ctx(),
      tools: [tool(execute)],
      messages: [{ role: 'user', content: '重新安排六周训练' }],
    }))
      events.push(event);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[1].tools ?? []).toHaveLength(0);
    expect(model.doStreamCalls[1].toolChoice).toEqual({ type: 'none' });
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain(
      draft.description,
    );
    const card = events.findIndex((event) => event.type === 'assistant');
    const explanation = events.findIndex(
      (event) =>
        event.type === 'stream_event' &&
        event.event.type === 'text_delta' &&
        event.event.text === finalText,
    );
    expect(card).toBeGreaterThan(-1);
    expect(explanation).toBeGreaterThan(card);
    expect(events.filter((event) => event.type === 'model_usage')).toHaveLength(
      2,
    );
    expect(events.at(-1)).toMatchObject({
      type: 'result',
      is_error: false,
      result: finalText,
    });
  });
  it.each(['empty', 'error'] as const)(
    'preserves delivery and refuses silent success/provider replay when the summary is %s',
    async (mode) => {
      setupModel(mode);
      const execute = jest.fn<AiToolDef['execute']>(async () => draft);
      const events: CoachQueryYield[] = [];
      const run = async () => {
        for await (const event of streamCoachAnswer({
          ctx: ctx(),
          tools: [tool(execute)],
          messages: [{ role: 'user', content: '训练计划' }],
        }))
          events.push(event);
      };
      await expect(run()).rejects.toThrow(
        mode === 'empty' ? 'AI_COACH_DELIVERY_SUMMARY_EMPTY' : 'rate limited',
      );
      expect(execute).toHaveBeenCalledTimes(1);
      expect(events.some((event) => event.type === 'assistant')).toBe(true);
      expect(
        events.some((event) => event.type === 'result' && !event.is_error),
      ).toBe(false);
    },
  );
  it('blocks even hallucinated tool executions during the delivery-only phase', async () => {
    const execute = jest.fn<AiToolDef['execute']>(async () => draft);
    const tools = createAiSdkCoachTools({
      ctx: ctx(),
      tools: [tool(execute)],
      canExecute: () => false,
    });
    const result = await tools.present_coach_plan_draft.execute!(
      {},
      { toolCallId: 'blocked', messages: [] },
    );
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ stage: 'delivery' });
  });
  it('does not deduplicate equal read results from different calls in the real loop', async () => {
    setupModel('text', 2, 'activity_recent');
    const execute = jest.fn<AiToolDef['execute']>(async () => ({
      kind: 'activity_recent',
      items: [],
    }));
    const cards: string[] = [];
    for await (const event of streamCoachAnswer({
      ctx: ctx(),
      tools: [
        { ...tool(execute), name: 'activity.recent', isConcurrencySafe: true },
      ],
      messages: [{ role: 'user', content: '查询两段时间的活动' }],
    })) {
      if (event.type === 'assistant')
        for (const block of event.message.content)
          if (block.type === 'tool_use' && block.name === 'ActivityRecent')
            cards.push(block.id);
    }
    expect(execute).toHaveBeenCalledTimes(2);
    expect(cards).toEqual(['draft-0', 'draft-1']);
  });
  it('still ends immediately when questions are delivered', async () => {
    setupModel('text', 1, 'ask_user_question', '请先确认你的训练目标。');
    const execute = jest.fn<AiToolDef['execute']>(async () => ({
      kind: 'ask_user_question',
      questions: [],
    }));
    const events: CoachQueryYield[] = [];
    for await (const event of streamCoachAnswer({
      ctx: ctx(),
      thinking: true,
      tools: [{ ...tool(execute), name: 'ask_user_question' }],
      messages: [{ role: 'user', content: '新计划' }],
    }))
      events.push(event);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(
      events.some(
        (event) => event.type === 'activity' && event.activity.publicSummary,
      ),
    ).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: 'result', is_error: false });
  });
});
