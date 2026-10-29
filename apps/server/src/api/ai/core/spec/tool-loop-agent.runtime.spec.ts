import { describe, expect, it } from '@jest/globals';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  detectUiSurfacePayloadError,
  isDisplayableFitnessAssessmentResult,
  uiSurfaceAssistantForToolResult,
  emitToolStepMessages,
  nextStreamPartWithTimeouts,
  progressForModelStep,
  resolveStepTimeoutMs,
  resolveStreamIdleTimeoutMs,
  stopAfterUiSurfaceTool,
  stopAfterUiSurfaceValidationExhausted,
  suppressTextForSelfContainedUiSurface,
  UI_SURFACE_MAX_VALIDATION_ATTEMPTS,
  toAiSdkModelMessages,
  visibleCoachTextForCompletedStep,
} from '../tool-loop-agent.runtime';

describe('ToolLoopAgent runtime compatibility helpers', () => {
  it('does not present READY evidence as a completed estimate', () => {
    const ready = {
      kind: 'fitness_assessment_result',
      calculationId: 'c',
      preparationStatus: 'READY',
    };
    expect(
      uiSurfaceAssistantForToolResult({
        id: 'call',
        name: 'fitness.evidence',
        input: {},
        output: ready,
        ok: true,
      }),
    ).toBeNull();
    const calculated = {
      kind: 'fitness_assessment_result',
      calculationId: 'c',
      status: 'ESTIMATED',
      candidates: [{ metric: 'LTHR', value: 176 }],
      observations: [],
    };
    expect(
      uiSurfaceAssistantForToolResult({
        id: 'call',
        name: 'fitness.calculate',
        input: {},
        output: calculated,
        ok: true,
      }),
    ).toMatchObject({
      type: 'assistant',
      message: { content: [{ name: 'FitnessAssessment' }] },
    });
  });

  it('keeps incomplete fitness evidence in the model loop instead of exposing an internal form', () => {
    const needsInput = {
      kind: 'fitness_assessment_result',
      status: 'NEEDS_INPUT',
      reasonCode: 'AMBIGUOUS_SCOPE',
      candidates: [],
      observations: [],
    };
    expect(isDisplayableFitnessAssessmentResult(needsInput)).toBe(false);
    expect(
      uiSurfaceAssistantForToolResult({
        id: 'call',
        name: 'fitness.evidence',
        input: {},
        output: needsInput,
        ok: true,
      }),
    ).toBeNull();
    expect(
      stopAfterUiSurfaceTool({
        steps: [
          {
            toolResults: [{ toolName: 'fitness_evidence', output: needsInput }],
          },
        ],
      }),
    ).toBe(false);
  });

  it.each([true, false])(
    'persists the explicit tool execution outcome (ok=%s)',
    async (ok) => {
      const events = await emitToolStepMessages({
        calls: [{ id: 'call-1', name: 'test_read', input: {} }],
        results: [
          {
            id: 'call-1',
            name: 'test_read',
            input: {},
            output: ok ? { count: 1 } : { error: 'failed' },
            ok,
          },
        ],
        tools: [],
        ctx: {} as Parameters<typeof emitToolStepMessages>[0]['ctx'],
      });
      expect(events[1]).toMatchObject({
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'call-1', is_error: !ok },
          ],
        },
      });
    },
  );

  it('allows every DeepSeek model step up to five minutes by default', () => {
    const previousGlobal = process.env.AI_COACH_STEP_TIMEOUT_MS;
    const previousDeepSeek = process.env.DEEPSEEK_STEP_TIMEOUT_MS;
    delete process.env.AI_COACH_STEP_TIMEOUT_MS;
    delete process.env.DEEPSEEK_STEP_TIMEOUT_MS;

    try {
      expect(resolveStepTimeoutMs('deepseek', 'plan-builder')).toBe(300_000);
      expect(resolveStepTimeoutMs('deepseek', 'plan-followup')).toBe(300_000);
      expect(resolveStepTimeoutMs('deepseek', null)).toBe(300_000);
    } finally {
      if (previousGlobal === undefined) {
        delete process.env.AI_COACH_STEP_TIMEOUT_MS;
      } else {
        process.env.AI_COACH_STEP_TIMEOUT_MS = previousGlobal;
      }
      if (previousDeepSeek === undefined) {
        delete process.env.DEEPSEEK_STEP_TIMEOUT_MS;
      } else {
        process.env.DEEPSEEK_STEP_TIMEOUT_MS = previousDeepSeek;
      }
    }
  });

  it('uses provider-specific stream idle timeouts', () => {
    const previousGlobal = process.env.AI_COACH_STREAM_IDLE_TIMEOUT_MS;
    delete process.env.AI_COACH_STREAM_IDLE_TIMEOUT_MS;
    try {
      expect(resolveStreamIdleTimeoutMs('deepseek')).toBe(60_000);
      expect(resolveStreamIdleTimeoutMs('aliyun')).toBe(30_000);
      expect(resolveStreamIdleTimeoutMs('openrouter')).toBe(20_000);
    } finally {
      if (previousGlobal === undefined) {
        delete process.env.AI_COACH_STREAM_IDLE_TIMEOUT_MS;
      } else {
        process.env.AI_COACH_STREAM_IDLE_TIMEOUT_MS = previousGlobal;
      }
    }
  });

  it('keeps plan-specific progress copy out of ordinary conversations', () => {
    expect(progressForModelStep(null, 1)).toBe('thinking');
    expect(
      progressForModelStep(
        {
          name: 'readiness-check',
          description: '',
          whenToUse: '',
          suggestedTools: [],
          prompt: '',
          activatedBy: 'test',
        },
        2,
      ),
    ).toBe('thinking');
  });

  it('preserves detailed progress for plan-builder conversations', () => {
    const planBuilder = {
      name: 'plan-builder',
      description: '',
      whenToUse: '',
      suggestedTools: [],
      prompt: '',
      activatedBy: 'test',
    };

    expect(progressForModelStep(planBuilder, 1)).toBe('analyzing_request');
    expect(progressForModelStep(planBuilder, 2)).toBe('synthesizing_evidence');
    expect(progressForModelStep(planBuilder, 3)).toBe('drafting_plan');
  });

  it('keeps text-only final-step deltas visible', () => {
    expect(
      visibleCoachTextForCompletedStep({
        text: '这是最终答复',
        hasToolCalls: false,
      }),
    ).toBe('这是最终答复');
  });

  it('hides model process narration from tool-call steps', () => {
    expect(
      visibleCoachTextForCompletedStep({
        text: "I'll load your plan. Here's the picture.",
        hasToolCalls: true,
      }),
    ).toBe('');
  });

  it('reports a stalled stream when no new part arrives within the idle timeout', async () => {
    let timeoutKind: string | null = null;
    const iterator: AsyncIterator<unknown> = {
      next: () => new Promise(() => undefined),
    };

    await expect(
      nextStreamPartWithTimeouts({
        iterator,
        stepDeadlineAt: null,
        step: 2,
        streamIdleTimeoutMs: 5,
        stepTimeoutMs: 50,
        onTimeout: (kind) => {
          timeoutKind = kind;
        },
      }),
    ).rejects.toMatchObject({
      code: 'AI_COACH_STREAM_IDLE_TIMEOUT',
    });
    expect(timeoutKind).toBe('stream_idle');
  });

  it('keeps a wider absolute step deadline as the final per-step guardrail', async () => {
    let timeoutKind: string | null = null;
    const iterator: AsyncIterator<unknown> = {
      next: () => new Promise(() => undefined),
    };

    await expect(
      nextStreamPartWithTimeouts({
        iterator,
        stepDeadlineAt: Date.now() + 5,
        step: 3,
        streamIdleTimeoutMs: 50,
        stepTimeoutMs: 5,
        onTimeout: (kind) => {
          timeoutKind = kind;
        },
      }),
    ).rejects.toMatchObject({
      code: 'AI_COACH_STEP_TIMEOUT',
    });
    expect(timeoutKind).toBe('step');
  });

  it('resets stream-idle detection after every received part', async () => {
    let part = 0;
    const iterator: AsyncIterator<number> = {
      next: async () => {
        await new Promise((resolve) => setTimeout(resolve, 3));
        part += 1;
        return { done: false, value: part };
      },
    };
    const stepDeadlineAt = Date.now() + 100;

    const first = await nextStreamPartWithTimeouts({
      iterator,
      stepDeadlineAt,
      step: 1,
      streamIdleTimeoutMs: 20,
      stepTimeoutMs: 100,
      onTimeout: () => undefined,
    });
    const second = await nextStreamPartWithTimeouts({
      iterator,
      stepDeadlineAt,
      step: 1,
      streamIdleTimeoutMs: 20,
      stepTimeoutMs: 100,
      onTimeout: () => undefined,
    });

    expect(first.value).toBe(1);
    expect(second.value).toBe(2);
  });

  it('converts OpenAI-compatible tool call history into AI SDK model messages', () => {
    const messages = toAiSdkModelMessages([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'show my zones' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'profile_zones',
              arguments: JSON.stringify({ sportType: 'RUN' }),
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content: JSON.stringify({ zones: [1, 2, 3] }),
      },
      { role: 'assistant', content: 'Here are your zones.' },
    ] as ChatCompletionMessageParam[]);

    expect(messages).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'show my zones' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'profile_zones',
            input: { sportType: 'RUN' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 'profile_zones',
            output: {
              type: 'text',
              value: JSON.stringify({ zones: [1, 2, 3] }),
            },
          },
        ],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Here are your zones.' }],
      },
    ]);
  });

  it('does not stop at a proposal card before the coaching explanation', () => {
    expect(
      stopAfterUiSurfaceTool({
        steps: [
          {
            toolResults: [
              {
                toolName: 'present_coach_plan_draft',
                output: { kind: 'coach_plan_draft' },
              },
            ],
          },
        ],
      }),
    ).toBe(false);

    expect(
      stopAfterUiSurfaceTool({
        steps: [
          {
            toolResults: [
              {
                toolName: 'present_coach_plan_draft',
                output: {
                  error: 'missing workouts',
                  stage: 'validate_input',
                },
              },
            ],
          },
        ],
      }),
    ).toBe(false);

    expect(
      stopAfterUiSurfaceTool({
        steps: [
          {
            toolResults: [
              {
                toolName: 'fitness_evidence',
                output: {
                  kind: 'fitness_assessment_result',
                  status: 'WAITING_DATA',
                },
              },
            ],
          },
        ],
      }),
    ).toBe(false);
    expect(
      stopAfterUiSurfaceTool({
        steps: [
          {
            toolResults: [
              {
                toolName: 'fitness_evidence',
                output: {
                  kind: 'fitness_assessment_result',
                  preparationStatus: 'READY',
                },
              },
            ],
          },
        ],
      }),
    ).toBe(false);

    expect(
      stopAfterUiSurfaceTool({
        steps: [
          {
            toolResults: [
              {
                toolName: 'coach_decision_draft',
                output: { kind: 'coach_decision_draft' },
              },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it('suppresses same-step prose only for self-contained proposal surfaces', () => {
    expect(
      suppressTextForSelfContainedUiSurface([{ name: 'coach_decision_draft' }]),
    ).toBe(true);
    expect(
      suppressTextForSelfContainedUiSurface([{ name: 'plan.day_view' }]),
    ).toBe(false);
  });

  it('detects ask_user_question validation failures for retry fallback', () => {
    expect(
      detectUiSurfacePayloadError({
        result: {
          id: 'call_1',
          name: 'ask_user_question',
          input: {
            questions: [
              {
                id: 'q1',
                header: '目标',
                question: '你的目标?',
                options: [{ value: 'a', label: 'A', description: null }],
              },
            ],
          },
          output: {
            error: 'questions[0].options[0].description must be a string',
            code: 'INVALID_INPUT',
            stage: 'validate_input',
          },
          ok: false,
        },
        attempt: 2,
        input: {
          questions: [
            {
              id: 'q1',
              header: '目标',
              question: '你的目标?',
              options: [{ value: 'a', label: 'A', description: null }],
            },
          ],
        },
      }),
    ).toMatchObject({
      toolName: 'ask_user_question',
      stage: 'validate_input',
      code: 'INVALID_INPUT',
    });
  });

  it('ignores successful ask_user_question output', () => {
    expect(
      detectUiSurfacePayloadError({
        result: {
          id: 'call_1',
          name: 'ask_user_question',
          input: { questions: [] },
          output: { kind: 'ask_user_question', questions: [] },
          ok: true,
        },
        attempt: 1,
        input: { questions: [] },
      }),
    ).toBeNull();
  });

  it('stops UI surface validation after max attempts', () => {
    const state = {
      uiSurfaceValidationFailureCount: UI_SURFACE_MAX_VALIDATION_ATTEMPTS,
      uiSurfacePayloadError: { toolName: 'ask_user_question' },
      emitUiSurfaceFallback: false,
    };

    expect(stopAfterUiSurfaceValidationExhausted(state)({ steps: [] })).toBe(
      true,
    );
    expect(state.emitUiSurfaceFallback).toBe(true);
  });

  it('allows retry before max UI surface validation attempts', () => {
    const state = {
      uiSurfaceValidationFailureCount: UI_SURFACE_MAX_VALIDATION_ATTEMPTS - 1,
      uiSurfacePayloadError: { toolName: 'ask_user_question' },
      emitUiSurfaceFallback: false,
    };

    expect(stopAfterUiSurfaceValidationExhausted(state)({ steps: [] })).toBe(
      false,
    );
    expect(state.emitUiSurfaceFallback).toBe(false);
  });
});
