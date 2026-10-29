import { describe, expect, it, jest } from '@jest/globals';
import { createAiSdkCoachTools } from '../ai-sdk-tool-adapter';
import type { AiToolContext, AiToolDef } from '../tool.types';
import { askUserQuestionToolParametersSchema } from '../../../../../../../packages/shared/ai-coach-schema';
import { skillActivateTool } from '../tools/skillActivate.tool';
import type { CoachActivityEvent } from '@shared/ai-coach-run-contract';

function createCtx(): AiToolContext {
  return {
    prisma: {} as never,
    userService: {} as never,
    i18n: { t: (key: string) => key } as never,
    coachTools: {} as never,
    coachActions: {} as never,
    planService: {} as never,
    planQuery: {} as never,
    planExecutionContext: {} as never,
    activityService: {} as never,
    workoutService: {} as never,
    workoutDefinitions: {} as never,
    pmc: {} as never,
    session: { user: { id: 'u1' } } as never,
    sid: 'sid1',
    lang: 'zh',
    signal: new AbortController().signal,
  };
}

function baseTool(overrides: Partial<AiToolDef> = {}): AiToolDef {
  return {
    name: 'profile.zones',
    description: 'Read athlete zones',
    parameters: {
      type: 'object',
      properties: {
        sportType: { type: 'string' },
      },
      additionalProperties: false,
    },
    cost: 'low',
    kind: 'read',
    execute: async (_ctx, input) => ({
      ok: true,
      input,
      rows: [{ zone: 2 }],
    }),
    ...overrides,
  };
}

describe('createAiSdkCoachTools', () => {
  it('publishes only the canonical skill identity at every lifecycle state', async () => {
    const events: CoachActivityEvent[] = [];
    const ctx = {
      ...createCtx(),
      onActivity: async (event: CoachActivityEvent) => {
        events.push(event);
      },
    };
    const tools = createAiSdkCoachTools({ tools: [skillActivateTool], ctx });
    await tools.skill_activate.execute?.(
      { name: 'training-stats', reason: 'PRIVATE_MODEL_ARGUMENT' },
      { toolCallId: 'skill-1', messages: [] },
    );
    expect(events.map((event) => event.status)).toEqual([
      'queued',
      'running',
      'completed',
    ]);
    expect(
      events.every((event) => event.skillName === 'training-analytics'),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_MODEL_ARGUMENT');
    expect(JSON.stringify(events)).not.toContain('prompt');
  });

  it('records rejected skill activation as failed without echoing unknown inputs', async () => {
    const events: CoachActivityEvent[] = [];
    const tools = createAiSdkCoachTools({
      tools: [skillActivateTool],
      ctx: {
        ...createCtx(),
        onActivity: async (event) => {
          events.push(event);
        },
      },
    });
    await tools.skill_activate.execute?.(
      { name: 'PRIVATE_UNKNOWN_SKILL' },
      { toolCallId: 'skill-2', messages: [] },
    );
    expect(events.at(-1)?.status).toBe('failed');
    expect(events.every((event) => event.skillName === undefined)).toBe(true);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_UNKNOWN_SKILL');
  });

  it('maps canonical tool names to provider-safe AI SDK tool names', async () => {
    const tools = createAiSdkCoachTools({
      tools: [baseTool()],
      ctx: createCtx(),
    });

    expect(Object.keys(tools)).toEqual(['profile_zones']);
    expect(tools.profile_zones.description).toBe('Read athlete zones');

    const output = await tools.profile_zones.execute?.(
      { sportType: 'RUN' },
      { toolCallId: 'call_1', messages: [] },
    );

    expect(output).toMatchObject({
      ok: true,
      input: { sportType: 'RUN' },
    });
  });

  it('records successful background evidence tools before result submission', async () => {
    const completedToolNames = new Set<string>();
    const tools = createAiSdkCoachTools({
      tools: [baseTool({ name: 'training.data_coverage' })],
      ctx: {
        ...createCtx(),
        backgroundTask: {
          taskType: 'TODAY_SUGGESTION',
          allowedToolNames: ['training.data_coverage'],
          requiredToolNames: ['training.data_coverage'],
          completedToolNames,
          submitResult: jest.fn(),
        },
      },
    });

    await tools.training_data_coverage.execute?.(
      {},
      { toolCallId: 'coverage-1', messages: [] },
    );

    expect(completedToolNames).toEqual(new Set(['training.data_coverage']));
  });

  it('returns validation errors as tool output without executing the tool', async () => {
    const execute = jest.fn(async () => ({ shouldNotRun: true }));
    const tools = createAiSdkCoachTools({
      tools: [
        baseTool({
          validateInput: () => ({
            ok: false,
            message: 'bad input',
            code: 'BAD_INPUT',
          }),
          execute,
        }),
      ],
      ctx: createCtx(),
    });

    const output = await tools.profile_zones.execute?.(
      {},
      { toolCallId: 'call_1', messages: [] },
    );

    expect(execute).not.toHaveBeenCalled();
    expect(output).toEqual({
      error: 'bad input',
      code: 'BAD_INPUT',
      stage: 'validate_input',
    });
  });

  it('returns ask_user_question validation errors without executing the tool', async () => {
    const execute = jest.fn(async () => ({ kind: 'ask_user_question' }));
    const tools = createAiSdkCoachTools({
      tools: [
        baseTool({
          name: 'ask_user_question',
          parameters: askUserQuestionToolParametersSchema,
          validateInput: async (_ctx, input) => ({
            ok: false,
            message: 'questions[2].options[0].description must be a string',
            code: 'INVALID_INPUT',
          }),
          execute,
        }),
      ],
      ctx: createCtx(),
    });

    const output = await tools.ask_user_question.execute?.(
      {
        questions: [
          {
            id: 'weekly_days',
            header: '频率',
            question: '每周跑几天?',
            options: [
              { value: '3', label: '3天', description: '适中' },
              { value: '4', label: '4天', description: '更多' },
            ],
          },
        ],
      },
      { toolCallId: 'call_1', messages: [] },
    );

    expect(execute).not.toHaveBeenCalled();
    expect(output).toEqual({
      error: 'questions[2].options[0].description must be a string',
      code: 'INVALID_INPUT',
      stage: 'validate_input',
    });
  });

  it('uses summarizeForModel for model-visible tool output', async () => {
    const tools = createAiSdkCoachTools({
      tools: [
        baseTool({
          summarizeForModel: () => ({ compact: true }),
        }),
      ],
      ctx: createCtx(),
    });

    const output = await tools.profile_zones.toModelOutput?.({
      toolCallId: 'call_1',
      input: { sportType: 'RUN' },
      output: { huge: ['ignored'] },
    });

    expect(output).toEqual({
      type: 'text',
      value: JSON.stringify({ compact: true }),
    });
  });

  it('serializes tools that are not concurrency safe', async () => {
    const order: string[] = [];
    const tools = createAiSdkCoachTools({
      tools: [
        baseTool({
          isConcurrencySafe: false,
          parameters: {
            type: 'object',
            properties: { id: { type: 'number' } },
            additionalProperties: false,
          },
          execute: async (_ctx, input) => {
            const typedInput = input as { id?: unknown };
            order.push(`start:${String(typedInput.id)}`);
            await new Promise((resolve) => setTimeout(resolve, 5));
            order.push(`end:${String(typedInput.id)}`);
            return { id: typedInput.id };
          },
        }),
      ],
      ctx: createCtx(),
    });

    await Promise.all([
      tools.profile_zones.execute?.(
        { id: 1 },
        { toolCallId: 'c1', messages: [] },
      ),
      tools.profile_zones.execute?.(
        { id: 2 },
        { toolCallId: 'c2', messages: [] },
      ),
    ]);

    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
  });
});
