import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { ToolSet } from 'ai';
import type { CoachActivityEvent } from '@shared/ai-coach-run-contract';
import type { AiToolContext, AiToolDef } from '../tool.types';
import { createAiSdkCoachTools } from '../ai-sdk-tool-adapter';
import { streamCoachAnswer } from '../tool-loop-agent.runtime';

let modelAttempts = 0;
let executeBeforeFailure = false;
jest.mock('ai', () => ({
  ...jest.requireActual<typeof import('ai')>('ai'),
  ToolLoopAgent: class {
    constructor(private readonly config: { tools: ToolSet }) {
      modelAttempts += 1;
    }
    async stream() {
      const { tools } = this.config;
      return {
        fullStream: (async function* () {
          yield { type: 'start-step' };
          if (executeBeforeFailure)
            await tools.test_write.execute(
              {},
              { toolCallId: 'write', messages: [] },
            );
          yield {
            type: 'error',
            error: Object.assign(new Error('rate limited'), { status: 429 }),
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
  const previousFallback = process.env.OPENROUTER_DEFAULT_FALLBACK_MODELS;
  afterEach(() => {
    modelAttempts = 0;
    executeBeforeFailure = false;
    if (previousFallback === undefined)
      delete process.env.OPENROUTER_DEFAULT_FALLBACK_MODELS;
    else process.env.OPENROUTER_DEFAULT_FALLBACK_MODELS = previousFallback;
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
});
