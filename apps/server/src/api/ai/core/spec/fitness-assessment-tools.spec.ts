import { describe, expect, it, jest } from '@jest/globals';
import type { FitnessAssessmentResult } from '@shared/fitness-assessment';
import type { AiToolContext } from '../tool.types';
import { fitnessCalculateTool } from '../tools/fitnessAssessment.tools';
import {
  emitToolStepMessages,
  stopAfterUiSurfaceTool,
  uiSurfaceAssistantForToolResult,
} from '../tool-loop-agent.runtime';

const assessment = {
  kind: 'fitness_assessment_result',
  schemaVersion: 1,
  calculationId: 'calculation-1',
  status: 'ESTIMATED',
  candidates: [{ metric: 'LTHR', value: 165, unit: 'bpm' }],
  observations: [
    { metric: 'last20MinutesMeanHeartRate', value: 165.4, unit: 'bpm' },
  ],
  limitations: ['ORDINARY_ACTIVITY_LTHR'],
  noMetricWrite: true,
} as FitnessAssessmentResult;

function context(presentedAt: Date | null, result = assessment) {
  const calculations = {
    calculate: jest.fn(async () => result),
    calculation: jest.fn(async () => ({ presentedAt })),
  };
  const ctx = {
    session: { user: { id: 'athlete' } },
    sid: 'session',
    branchId: 'branch',
    currentTurnStartedAt: new Date('2026-09-27T05:20:00Z'),
    currentUserPrompt: '你觉得这个数据准吗？',
    fitnessCalculations: calculations,
  } as unknown as AiToolContext;
  return { ctx, calculations };
}

describe('fitness calculation delivery', () => {
  it('keeps a displayed assessment available for reasoning without rendering again or ending the answer', async () => {
    const { ctx, calculations } = context(new Date('2026-09-27T05:19:23Z'));
    const input = { calculationId: assessment.calculationId };
    const output = await fitnessCalculateTool.execute(ctx, input);
    expect(output).toEqual({
      kind: 'fitness_assessment_reference',
      assessment,
    });
    const scopedContext = {
      userId: 'athlete',
      sessionId: 'session',
      branchId: 'branch',
      now: ctx.currentTurnStartedAt,
    };
    expect(calculations.calculate).toHaveBeenCalledWith(
      scopedContext,
      assessment.calculationId,
    );
    expect(calculations.calculation).toHaveBeenCalledWith(
      scopedContext,
      assessment.calculationId,
    );
    const call = { id: 'followup-call', name: 'fitness_calculate', input };
    const result = { ...call, output, ok: true };
    expect(uiSurfaceAssistantForToolResult(result)).toBeNull();
    expect(
      stopAfterUiSurfaceTool({
        steps: [{ toolResults: [{ toolName: call.name, output }] }],
      }),
    ).toBe(false);

    // The explanation still receives the exact estimate, observation and
    // limitations through the normal persisted/model-facing tool messages.
    const messages = await emitToolStepMessages({
      calls: [call],
      results: [result],
      tools: [fitnessCalculateTool],
      ctx,
    });
    expect(messages[0]).toMatchObject({
      type: 'assistant',
      message: { content: [{ name: 'fitness_calculate' }] },
    });
    const modelResult = messages[1] as {
      message: { content: Array<{ content: string }> };
    };
    expect(JSON.parse(modelResult.message.content[0].content)).toEqual(output);
  });

  it('still delivers a first result, including a completed calculation that was never presented', async () => {
    const { ctx } = context(null);
    const output = await fitnessCalculateTool.execute(ctx, {
      calculationId: assessment.calculationId,
    });
    expect(output).toEqual(assessment);
    expect(
      uiSurfaceAssistantForToolResult({
        id: 'first-call',
        name: 'fitness_calculate',
        input: {},
        output,
        ok: true,
      }),
    ).toMatchObject({
      type: 'assistant',
      message: { content: [{ name: 'FitnessAssessment' }] },
    });
    expect(
      stopAfterUiSurfaceTool({
        steps: [{ toolResults: [{ toolName: 'fitness_calculate', output }] }],
      }),
    ).toBe(true);
  });

  it('delivers a new assessment even when it estimates the same number', async () => {
    const next = { ...assessment, calculationId: 'new-calculation' };
    const { ctx } = context(null, next);
    const output = await fitnessCalculateTool.execute(ctx, {
      calculationId: next.calculationId,
    });
    expect(output).toEqual(next);
    expect(
      uiSurfaceAssistantForToolResult({
        id: 'new-call',
        name: 'fitness_calculate',
        input: {},
        output,
        ok: true,
      }),
    ).not.toBeNull();
  });

  it('does not bypass calculation validity checks when retrieving a displayed result', async () => {
    const { ctx, calculations } = context(new Date('2026-09-27T05:19:23Z'));
    calculations.calculate.mockRejectedValue(new Error('METHOD_UNAVAILABLE'));
    await expect(
      fitnessCalculateTool.execute(ctx, {
        calculationId: assessment.calculationId,
      }),
    ).rejects.toThrow('METHOD_UNAVAILABLE');
    expect(calculations.calculation).not.toHaveBeenCalled();
  });
});
