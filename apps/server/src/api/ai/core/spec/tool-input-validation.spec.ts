import { describe, expect, it, jest } from '@jest/globals';
import { toolSchemaValidator } from '../tool-input-validation';
import { COACH_TOOL_DEFINITIONS } from '../tool.registry';
import { trainingAggregateTool } from '../tools/trainingAggregate.tool';
import { presentTrainingVisualizationTool } from '../tools/presentTrainingVisualization.tool';
import { askUserQuestionTool } from '../tools/askUserQuestion.tool';
import { createAiSdkCoachTools } from '../ai-sdk-tool-adapter';
import { validateAiToolInput, type AiToolContext } from '../tool.types';
import { presentCoachPlanDraftTool } from '../tools/presentCoachPlanDraft.tool';

const dates = { from: '2026-04-09', to: '2026-10-09' };
const chart = {
  source: 'PMC',
  ...dates,
  groupBy: 'WEEK',
  measures: ['CTL', 'ATL', 'TSB'],
  intent: 'TREND',
};
const question = {
  questions: [
    {
      id: 'goal',
      header: '目标',
      question: '你想做什么？',
      options: [
        { value: 'a', label: '查看', description: '先查看记录' },
        { value: 'b', label: '计划', description: '制定计划' },
      ],
    },
  ],
};

describe('model and runtime tool contracts', () => {
  it('compiles every registered tool schema', () => {
    for (const tool of COACH_TOOL_DEFINITIONS)
      expect(() => toolSchemaValidator(tool.parameters)).not.toThrow();
  });

  it.each([
    ['missing groupBy', { ...chart, groupBy: undefined }, '/groupBy'],
    [
      'wrong source measure',
      {
        ...chart,
        source: 'ACTIVITIES',
        measures: ['ACTIVITY_COUNT', 'DAILY_LOAD'],
      },
      '/measures/1',
    ],
    ['unknown input', { ...chart, rows: [] }, '/rows'],
    ['invalid date format', { ...chart, from: 'yesterday' }, '/from'],
  ])(
    'rejects %s with an actionable path and no silent defaults',
    (_name, input, path) => {
      const before = JSON.stringify(input);
      const result = toolSchemaValidator(
        presentTrainingVisualizationTool.parameters,
      )(input);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ path }),
        );
      expect(JSON.stringify(input)).toBe(before);
    },
  );

  it.each([
    { source: 'PMC', ...dates, groupBy: 'WEEK', measures: ['CTL'] },
    {
      source: 'ACTIVITIES',
      ...dates,
      groupBy: 'DAY',
      measures: ['ACTIVITY_COUNT', 'DURATION_MIN'],
    },
    { source: 'METRICS', ...dates, groupBy: 'MONTH', measures: ['WEIGHT'] },
    {
      source: 'ACTIVITY_SERIES',
      activityHashIds: ['owned-id'],
      measures: ['HEART_RATE'],
    },
    { source: 'ZONE_DISTRIBUTION', ...dates, zoneType: 'HEART_RATE' },
  ])(
    'accepts source-specific valid input without requiring dates on a series',
    (input) => {
      expect(
        toolSchemaValidator(trainingAggregateTool.parameters)(input).success,
      ).toBe(true);
    },
  );

  it('rejects missing option values and invalid question/option counts before execute', () => {
    const validate = toolSchemaValidator(askUserQuestionTool.parameters);
    expect(validate(question).success).toBe(true);
    expect(validate({ questions: [] }).success).toBe(false);
    expect(
      validate({ questions: Array(5).fill(question.questions[0]) }).success,
    ).toBe(false);
    expect(
      validate({
        questions: [
          {
            ...question.questions[0],
            options: [{ label: '选项' }, { value: 'b', label: '计划' }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      validate({
        questions: [
          {
            ...question.questions[0],
            options: question.questions[0].options.slice(0, 1),
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('keeps semantic validation after the schema boundary', async () => {
    const input = { ...chart, from: '2026-12-01', to: '2026-01-01' };
    const result = await validateAiToolInput(
      presentTrainingVisualizationTool,
      {} as AiToolContext,
      input as never,
    );
    expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    const duplicate = {
      questions: [
        {
          ...question.questions[0],
          options: [
            { value: 'a', label: 'A', description: 'A option' },
            { value: 'a', label: 'B', description: 'B option' },
          ],
        },
      ],
    };
    expect(
      await validateAiToolInput(
        askUserQuestionTool,
        {} as AiToolContext,
        duplicate as never,
      ),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining('must be unique'),
    });
  });

  it('validates both the SDK schema and direct execute, preserving errors for model repair', async () => {
    const execute = jest.fn(async () => ({ ok: true }));
    const tools = createAiSdkCoachTools({
      tools: [{ ...trainingAggregateTool, execute: execute as never }],
      ctx: { signal: new AbortController().signal } as AiToolContext,
    });
    const tool = tools.training_aggregate;
    const validate = (
      tool.inputSchema as { validate: (input: unknown) => { success: boolean } }
    ).validate;
    expect(validate({ source: 'PMC' }).success).toBe(false);
    const output = await tool.execute?.(
      { source: 'PMC' },
      { toolCallId: 'invalid', messages: [] },
    );
    expect(execute).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      code: 'INVALID_INPUT',
      stage: 'validate_input',
      issues: expect.any(Array),
    });
    expect(
      await tool.toModelOutput?.({
        toolCallId: 'invalid',
        input: { source: 'PMC' },
        output,
      }),
    ).toEqual({ type: 'text', value: JSON.stringify(output) });
  });

  it('defers UI-surface schema rejection so the model receives repair feedback', async () => {
    const execute = jest.fn(async () => ({ kind: 'coach_plan_draft' }));
    const tools = createAiSdkCoachTools({
      tools: [{ ...presentCoachPlanDraftTool, execute: execute as never }],
      ctx: { signal: new AbortController().signal } as AiToolContext,
    });
    const tool = tools.present_coach_plan_draft;
    const validate = (
      tool.inputSchema as { validate: (input: unknown) => { success: boolean } }
    ).validate;
    const missingTitle = { periodWeeks: 12, workouts: [] };

    expect(validate(missingTitle).success).toBe(true);
    const output = await tool.execute?.(missingTitle, {
      toolCallId: 'missing-title',
      messages: [],
    });

    expect(execute).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      code: 'INVALID_INPUT',
      stage: 'validate_input',
      error: expect.stringContaining('/title'),
    });
  });
});
