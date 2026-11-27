import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ToolSet } from 'ai';
import type { CoachActivityEvent } from '@shared/ai-coach-run-contract';
import type { AiToolContext, AiToolDef } from '../tool.types';
import { createAiSdkCoachTools } from '../ai-sdk-tool-adapter';
import { streamCoachAnswer } from '../tool-loop-agent.runtime';
import { CoachRunProjector, coachSnapshotChunks } from '../coach-run-projector';
import { COACH_TOOL_DEFINITIONS } from '../tool.registry';
import { getCoachSkillByName } from '../skill.registry';
import { skillActivateTool } from '../tools/skillActivate.tool';

let modelAttempts = 0;
let latestAgentConfig: any;
let executeBeforeFailure = false;
let textBeforeFailure: 'buffered' | 'visible' | undefined;
let upstreamStatus = 429;
jest.mock('ai', () => ({
  ...jest.requireActual<typeof import('ai')>('ai'),
  ToolLoopAgent: class {
    constructor(private readonly config: { tools: ToolSet }) {
      modelAttempts += 1;
      latestAgentConfig = config;
    }
    async stream() {
      const { tools } = this.config;
      const isFallback = modelAttempts > 1;
      return {
        fullStream: (async function* () {
          yield { type: 'start-step' };
          const usage = { inputTokens: 5, outputTokens: 3 };
          if (isFallback && textBeforeFailure) {
            yield { type: 'text-delta', text: '今天先做轻松骑行。' };
            yield { type: 'finish-step', usage };
            yield { type: 'finish', totalUsage: usage, finishReason: 'stop' };
            return;
          }
          if (textBeforeFailure) {
            yield { type: 'text-delta', text: '今天先做轻松跑。' };
            if (textBeforeFailure === 'visible') yield { type: 'finish-step', usage };
          }
          if (executeBeforeFailure)
            await tools.test_write.execute(
              {},
              { toolCallId: 'write', messages: [] },
            );
          yield {
            type: 'error',
            error: Object.assign(new Error('rate limited'), { status: upstreamStatus }),
          };
        })(),
      };
    }
  },
}));
jest.mock('../coach-upstream.adapter', () => ({
  ...jest.requireActual<typeof import('../coach-upstream.adapter')>(
    '../coach-upstream.adapter',
  ),
  getCoachModel: () => 'test-primary',
  getCoachUpstreamProvider: () => 'openrouter',
  createCoachLanguageModel: () => ({}),
  getCoachBaseUrlForLog: () => 'test',
}));

const ctx = (
  onActivity: (event: CoachActivityEvent) => Promise<void>,
): AiToolContext =>
  ({
    signal: new AbortController().signal,
    lang: 'zh',
    session: { user: { id: 'test' } },
    userService: { getPreferredTimezone: async () => 'UTC' },
    i18n: { t: (key: string) => key },
    onActivity,
  }) as unknown as AiToolContext;
const tool = (overrides: Partial<AiToolDef> = {}): AiToolDef => ({
  name: 'test.read',
  description: 'test',
  parameters: { type: 'object' },
  cost: 'low',
  kind: 'read',
  isConcurrencySafe: true,
  execute: async () => ({ ok: true }),
  ...overrides,
});

describe('real execution lifecycle / fallback fences', () => {
  it.each(['chat', 'background', 'state-continuation'])(
    'keeps the caller submission and discovery boundary for %s',
    async (mode) => {
      const background = mode === 'background';
      const context = ctx(async () => undefined);
      if (mode === 'state-continuation') context.athleteState = {} as never;
      if (background)
        context.backgroundTask = {
          taskType: 'TODAY_SUGGESTION',
          allowedToolNames: ['coach_task_submit_result'],
          requiredToolNames: [],
          completedToolNames: new Set(),
          submitResult: () => undefined,
        };
      const drain = async () => {
        for await (const _event of streamCoachAnswer({
          tools: [tool({ name: 'coach_task_submit_result' })],
          ctx: context,
          model: 'test-explicit',
          messages: [
            { role: 'user', content: 'Generate the structured task result.' },
          ],
        })) {
          /* drain */
        }
      };
      await expect(drain()).rejects.toThrow('rate limited');
      const expected = background ? 'required' : 'auto';
      expect(latestAgentConfig.toolChoice).toBe(expected);
      const step = latestAgentConfig.prepareStep({ stepNumber: 0, steps: [] });
      expect(step.toolChoice).toBe(expected);
      expect(step.activeTools).toContain('coach_task_submit_result');
      expect(step.system.includes('# Available skills')).toBe(mode === 'chat');
    },
  );

  const previousFallback = process.env.OPENROUTER_DEFAULT_FALLBACK_MODELS;
  afterEach(() => {
    modelAttempts = 0;
    executeBeforeFailure = false;
    textBeforeFailure = undefined;
    upstreamStatus = 429;
    if (previousFallback === undefined)
      delete process.env.OPENROUTER_DEFAULT_FALLBACK_MODELS;
    else process.env.OPENROUTER_DEFAULT_FALLBACK_MODELS = previousFallback;
  });

  it('uses the newly activated real skill and capability set on the next step', async () => {
    const context = ctx(async () => undefined);
    const drain = async () => {
      for await (const _event of streamCoachAnswer({
        tools: [...COACH_TOOL_DEFINITIONS],
        ctx: context,
        model: 'test-explicit',
        activeSkill: getCoachSkillByName('plan-day-review'),
        messages: [
          {
            role: 'user',
            content: 'For the opened plan, show my VO2max history.',
          },
        ],
      })) {
        /* drain */
      }
    };
    await expect(drain()).rejects.toThrow('rate limited');
    const initial = latestAgentConfig.prepareStep({ stepNumber: 0, steps: [] });
    expect(initial.activeTools).toContain('plan_proposal_preview');
    const output = await skillActivateTool.execute(context, {
      name: 'training-analytics',
    });
    expect(output.skill).not.toHaveProperty('prompt');
    latestAgentConfig.onStepFinish({
      toolCalls: [],
      stepNumber: 0,
      toolResults: [
        {
          toolCallId: 'switch',
          toolName: 'skill_activate',
          input: { name: 'training-analytics' },
          output,
        },
      ],
    });
    const next = latestAgentConfig.prepareStep({ stepNumber: 1, steps: [] });
    expect(next.system).toContain('# Active skill: training-analytics');
    expect(next.system).toContain(
      getCoachSkillByName('training-analytics')!.prompt,
    );
    expect(next.system).toContain('# Available skills');
    expect(next.activeTools).toContain('metric_history');
    expect(next.activeTools).toContain('present_training_visualization');
    expect(next.activeTools).not.toContain('plan_proposal_preview');
    expect(context.fitnessConfirmation).toBeUndefined();
    expect(context.fitnessTrackingReply).toBeUndefined();
  });

  it('keeps same-name parallel calls separate, and serial queued calls out of running', async () => {
    const events: CoachActivityEvent[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tools = createAiSdkCoachTools({
      ctx: ctx(async (event) => {
        events.push(event);
      }),
      tools: [
        tool({
          isConcurrencySafe: false,
          execute: async (_ctx, input: { wait?: boolean }) => {
            if (input.wait) await gate;
            return {};
          },
        }),
      ],
    });
    const first = tools.test_read.execute(
      { wait: true },
      { toolCallId: 'one', messages: [] },
    );
    const second = tools.test_read.execute(
      {},
      { toolCallId: 'two', messages: [] },
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(
      events.filter((e) => e.toolCallId === 'two').map((e) => e.status),
    ).toEqual(['queued']);
    release();
    await Promise.all([first, second]);
    expect(
      events.filter((e) => e.toolCallId === 'one').map((e) => e.status),
    ).toEqual(['queued', 'running', 'completed']);
    expect(
      events.filter((e) => e.toolCallId === 'two').map((e) => e.status),
    ).toEqual(['queued', 'running', 'completed']);
  });

  it('reports a skill activation failure without leaking the private error', async () => {
    const events: CoachActivityEvent[] = [];
    const tools = createAiSdkCoachTools({
      ctx: ctx(async (event) => {
        events.push(event);
      }),
      tools: [
        tool({
          name: 'skill.activate',
          execute: async () => {
            throw new Error('private skill file path');
          },
        }),
      ],
    });
    await tools.skill_activate.execute(
      {},
      { toolCallId: 'skill', messages: [] },
    );
    expect(events.map((e) => [e.kind, e.status])).toEqual([
      ['skill', 'queued'],
      ['skill', 'running'],
      ['skill', 'failed'],
    ]);
    expect(JSON.stringify(events)).not.toContain('private skill file path');
  });

  it.each([false, true])(
    'fallback cannot repeat a started write (write=%s)',
    async (write) => {
      process.env.OPENROUTER_DEFAULT_FALLBACK_MODELS = 'test-fallback';
      executeBeforeFailure = write;
      const execute = jest.fn(async () => ({}));
      const events: CoachActivityEvent[] = [];
      const run = async () => {
        for await (const _event of streamCoachAnswer({
          tools: [tool({ name: 'test.write', kind: 'mutation', execute })],
          ctx: ctx(async (event) => {
            events.push(event);
          }),
          messages: [{ role: 'user', content: '你好' }],
        })) {
          /* drain */
        }
      };
      await expect(run()).rejects.toThrow('rate limited');
      expect(modelAttempts).toBe(write ? 1 : 2);
      expect(execute).toHaveBeenCalledTimes(write ? 1 : 0);
    },
  );

  it.each([
    ['visible', 429, false, 1, '今天先做轻松跑。', 'FAILED'],
    ['buffered', 429, false, 2, '今天先做轻松骑行。', 'SUCCESS'],
    ['buffered', 400, false, 1, '', undefined],
    ['buffered', 429, true, 1, '', undefined],
  ] as const)(
    'isolates %s text on upstream %s (cancelled=%s)',
    async (visibility, status, cancel, attempts, expectedText, usageStatus) => {
      process.env.OPENROUTER_DEFAULT_FALLBACK_MODELS = 'test-fallback';
      textBeforeFailure = visibility;
      upstreamStatus = status;
      const controller = new AbortController();
      const context = { ...ctx(async () => undefined), signal: controller.signal };
      const projector = new CoachRunProjector({
        run: {
          runId: 'run-1', attemptId: 'attempt-1', messageId: 'message-1',
          revision: 0, status: 'running', startedAt: new Date().toISOString(),
          previousExecutionMs: 0, executionMs: 0,
        },
      });
      const streamed: string[] = [];
      const usage: string[] = [];
      const drain = async () => {
        for await (const event of streamCoachAnswer({
          tools: [tool()],
          ctx: context,
          messages: [{ role: 'user', content: '今天应该怎么训练？' }],
        })) {
          for (const chunk of projector.consume(event))
            if (chunk.type === 'text-delta') streamed.push(chunk.delta);
          if (event.type === 'model_usage') usage.push(event.status);
          if (cancel && event.type === 'activity' && event.activity.status === 'running')
            controller.abort(new Error('client disconnected'));
          if (event.type === 'result') expect(event.result).toBe(expectedText);
        }
      };

      if (attempts === 2) await drain();
      else await expect(drain()).rejects.toThrow();
      expect(modelAttempts).toBe(attempts);
      expect(streamed.join('')).toBe(expectedText);
      expect(usage).toEqual(usageStatus ? [usageStatus] : []);

      projector.finish(attempts === 2 ? 'completed' : 'failed');
      const stored = projector.envelope().message;
      const replayed = coachSnapshotChunks('message-1', stored)
        .filter((chunk) => chunk.type === 'text-delta')
        .map((chunk) => chunk.delta);
      expect(replayed.join('')).toBe(expectedText);
    },
  );
});
