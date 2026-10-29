import { describe, expect, it, jest } from '@jest/globals';
import {
  buildAssistantMessageBody,
  coachAssistantBlockIsInternalToolUse,
  coachAssistantBlockIsUiSurface,
  coachSsePayloadForAbort,
  coachSsePayloadForModelUnavailable,
  coachSsePayloadForUiSurfaceFallback,
  coachSsePayloadForUnsafeOutput,
  hasCoachMetaOnlyToolResult,
  isCoachUiSurfaceToolName,
  normalizeCoachUserMessage,
  textFromAssistantMessageBody,
  textFromCoachUserMessage,
  writeCoachSse,
} from '../coach-message.util';

describe('coach-message util', () => {
  it('classifies UI surface tools separately from internal tool uses', () => {
    expect(isCoachUiSurfaceToolName('PresentCoachPlanDraft')).toBe(true);
    expect(isCoachUiSurfaceToolName('SearchActivities')).toBe(false);

    expect(
      coachAssistantBlockIsInternalToolUse({
        type: 'tool_use',
        name: 'SearchActivities',
      }),
    ).toBe(true);
    expect(
      coachAssistantBlockIsInternalToolUse({
        type: 'tool_use',
        name: 'PresentCoachPlanDraft',
      }),
    ).toBe(false);
    expect(coachAssistantBlockIsUiSurface({ type: 'text' })).toBe(true);
    expect(
      coachAssistantBlockIsUiSurface({
        type: 'tool_use',
        name: 'PresentCoachPlanDraft',
      }),
    ).toBe(true);
  });

  it('normalizes user messages by keeping only supported blocks', () => {
    const message = normalizeCoachUserMessage({
      content: [
        { type: 'text', text: 'Plan my week' },
        { type: 'text', text: 123 },
        {
          type: 'tool_result',
          tool_use_id: 'tool-1',
          content: { ok: true },
          is_error: false,
        },
        { type: 'tool_result', content: 'missing id' },
        { type: 'unknown', value: true },
      ],
    });

    expect(message).toEqual({
      content: [
        { type: 'text', text: 'Plan my week' },
        {
          type: 'tool_result',
          tool_use_id: 'tool-1',
          content: { ok: true },
          is_error: false,
        },
      ],
    });
    expect(textFromCoachUserMessage(message)).toBe('Plan my week');
    expect(
      normalizeCoachUserMessage({ content: [{ type: 'unknown' }] }),
    ).toBeNull();
  });

  it('detects meta-only tool results that should not request another model reply', () => {
    expect(
      hasCoachMetaOnlyToolResult({
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            content: { kind: 'coach_plan_draft_saved' },
          },
        ],
      }),
    ).toBe(true);
    expect(
      hasCoachMetaOnlyToolResult({
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-2',
            content: { kind: 'other' },
          },
        ],
      }),
    ).toBe(false);
  });

  it('builds assistant message bodies from streamed prose, reasoning, and cards', () => {
    const result = buildAssistantMessageBody({
      prose: '  Here is the plan.  ',
      reasoningContent: '',
      assistantMessages: [
        {
          reasoning_content: ' first thought ',
          content: [
            { type: 'text', text: '   ' },
            {
              type: 'tool_use',
              id: 'card-1',
              name: 'PresentCoachPlanDraft',
              input: { title: 'Draft' },
            },
          ],
        },
        {
          reasoning_content: 'second thought',
          content: [{ type: 'text', text: ' Extra note.' }],
        },
      ],
    });

    expect(result.content).toBe('Here is the plan.');
    expect(result.message.reasoning_content).toBe(
      'first thought\n\nsecond thought',
    );
    expect(result.message.content).toEqual([
      { type: 'text', text: 'Here is the plan.' },
      {
        type: 'tool_use',
        id: 'card-1',
        name: 'PresentCoachPlanDraft',
        input: { title: 'Draft' },
      },
      { type: 'text', text: ' Extra note.' },
    ]);
    expect(textFromAssistantMessageBody(result.message)).toBe(
      'Here is the plan. Extra note.',
    );
  });

  it('keeps explicitly ordered text and card blocks in place', () => {
    const orderedContent = [
      { type: 'text' as const, text: '先看训练。' },
      {
        type: 'tool_use' as const,
        id: 'workout',
        name: 'PlanDayView',
        input: { date: '2026-09-30' },
      },
      { type: 'text' as const, text: '再看负荷。' },
      {
        type: 'tool_use' as const,
        id: 'pmc',
        name: 'PmcRange',
        input: { from: '2026-09-23', to: '2026-09-30' },
      },
    ];
    const result = buildAssistantMessageBody({
      prose: '先看训练。再看负荷。',
      orderedContent,
      assistantMessages: [],
    });
    expect(result.message.content).toEqual(orderedContent);
  });

  it('writes SSE payloads and maps client aborts and model failures', () => {
    const res = { write: jest.fn() };
    writeCoachSse(res as never, { type: 'done' });
    expect(res.write).toHaveBeenCalledWith('data: {"type":"done"}\n\n');

    const i18n = {
      t: jest.fn((key: string, opts?: { lang?: string }) =>
        opts?.lang === 'zh' ? `zh:${key}` : `translated:${key}`,
      ),
    };
    expect(coachSsePayloadForAbort(i18n as never)).toEqual({
      code: 'aborted',
      message: 'translated:common.error.ai_coach_request_aborted',
    });

    // Every model-side failure (timeouts, provider errors, empty answers,
    // unavailable tier) collapses into one actionable, localized error.
    expect(
      coachSsePayloadForModelUnavailable({ i18n: i18n as never, lang: 'zh' }),
    ).toEqual({
      error_code: 'model_unavailable',
      result: 'zh:common.error.ai_coach_model_unavailable',
    });
  });

  it('builds UI surface fallback SSE payloads via i18n keys', () => {
    const i18n = {
      t: jest.fn((key: string, opts?: { lang?: string }) =>
        opts?.lang === 'zh' ? `zh:${key}` : `translated:${key}`,
      ),
    };

    expect(
      coachSsePayloadForUiSurfaceFallback({
        i18n: i18n as never,
        lang: 'zh',
        toolName: 'ask_user_question',
      }),
    ).toEqual({
      error_code: 'invalid_ask_user_question_payload',
      result: 'zh:common.error.ai_coach_invalid_ask_user_question_payload',
    });

    expect(
      coachSsePayloadForUiSurfaceFallback({
        i18n: i18n as never,
        lang: 'de',
        toolName: 'present_coach_plan_draft',
      }),
    ).toEqual({
      error_code: 'invalid_plan_draft_payload',
      result: 'translated:common.error.ai_coach_invalid_plan_draft_payload',
    });

    expect(
      coachSsePayloadForUiSurfaceFallback({
        i18n: i18n as never,
        lang: 'en',
        toolName: 'unknown_tool',
      }),
    ).toEqual({
      error_code: 'invalid_ui_surface_payload',
      result: 'translated:common.error.ai_coach_invalid_ui_surface_payload',
    });
  });

  it('builds a localized safe terminal without including blocked output', () => {
    const i18n = {
      t: jest.fn((key: string, opts?: { lang?: string }) =>
        opts?.lang === 'zh' ? `zh:${key}` : `translated:${key}`,
      ),
    };

    expect(
      coachSsePayloadForUnsafeOutput({
        i18n: i18n as never,
        lang: 'zh',
      }),
    ).toEqual({
      error_code: 'unsafe_ai_output_blocked',
      result: 'zh:common.error.ai_coach_unsafe_output_blocked',
    });
    expect(i18n.t).toHaveBeenCalledWith(
      'common.error.ai_coach_unsafe_output_blocked',
      { lang: 'zh' },
    );
  });

  it('localizes the model-unavailable terminal in the reply language', () => {
    const i18n = {
      t: jest.fn(
        (key: string, opts?: { lang?: string }) => `${opts?.lang}:${key}`,
      ),
    };

    expect(
      coachSsePayloadForModelUnavailable({
        i18n: i18n as never,
        lang: 'de',
      }),
    ).toEqual({
      error_code: 'model_unavailable',
      result: 'de:common.error.ai_coach_model_unavailable',
    });
  });
});
