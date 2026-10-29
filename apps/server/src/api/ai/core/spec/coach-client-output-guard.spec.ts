import { describe, expect, it, jest } from '@jest/globals';
import { CoachClientOutputGuard } from '../coach-client-output-guard';
import type { CoachUiStreamYield } from '../coach-ui-message-stream';

function createGuard(lang = 'zh') {
  const i18n = {
    t: jest.fn((key: string, opts?: { lang?: string }) =>
      opts?.lang ? `${opts.lang}:${key}` : key,
    ),
  };
  return {
    guard: new CoachClientOutputGuard(i18n as never, lang),
    i18n,
  };
}

const emptySuccess: CoachUiStreamYield = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: '',
};

describe('CoachClientOutputGuard', () => {
  it('passes status and visible text while removing raw reasoning', () => {
    const { guard } = createGuard();
    const status: CoachUiStreamYield = {
      type: 'system',
      subtype: 'status',
      status: 'model',
      step: 1,
    };
    const text: CoachUiStreamYield = {
      type: 'stream_event',
      event: { type: 'text_delta', text: '可见结论' },
    };

    expect(guard.handle(status)).toBe(status);
    expect(
      guard.handle({
        type: 'stream_event',
        event: { type: 'reasoning_delta', text: 'private reasoning' },
      }),
    ).toBeNull();
    expect(guard.handle(text)).toBe(text);
    expect(guard.handle(emptySuccess)).toBe(emptySuccess);
  });

  it.each([
    'AskUserQuestion',
    'PresentCoachPlanDraft',
    'PresentPlanWorkoutAdjustmentDraft',
    'PlanDayView',
    'MutationApplied',
  ])('allows an empty success after a renderable %s card', (name) => {
    const { guard } = createGuard();
    const card: CoachUiStreamYield = {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'card_1',
            name,
            input: {},
          },
        ],
      },
    };

    expect(guard.handle(card)).toBe(card);
    expect(guard.handle(emptySuccess)).toBe(emptySuccess);
  });

  it('converts whitespace-only success to a localized terminal error', () => {
    const { guard, i18n } = createGuard('zh');
    guard.handle({
      type: 'stream_event',
      event: { type: 'text_delta', text: '  \n' },
    });

    expect(
      guard.handle({ ...emptySuccess, usage: { totalTokens: 42 } }),
    ).toEqual({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      error_code: 'model_unavailable',
      result: 'zh:common.error.ai_coach_model_unavailable',
      usage: { totalTokens: 42 },
    });
    expect(i18n.t).toHaveBeenCalledWith(
      'common.error.ai_coach_model_unavailable',
      { lang: 'zh' },
    );
  });

  it('does not count internal tool calls as user-visible output', () => {
    const { guard } = createGuard('en');
    guard.handle({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'SearchActivities',
            input: {},
          },
        ],
      },
    });

    expect(guard.handle(emptySuccess)).toMatchObject({
      type: 'result',
      is_error: true,
      error_code: 'model_unavailable',
    });
  });

  it('does not treat result-only text as visible when no text delta was sent', () => {
    const { guard } = createGuard();

    expect(
      guard.handle({ ...emptySuccess, result: 'not emitted to the UI' }),
    ).toMatchObject({
      type: 'result',
      is_error: true,
      error_code: 'model_unavailable',
    });
  });

  it('passes an upstream error terminal unchanged', () => {
    const { guard } = createGuard();
    const error: CoachUiStreamYield = {
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      error_code: 'upstream_failed',
      result: 'Please retry.',
    };

    expect(guard.handle(error)).toBe(error);
    expect(guard.missingTerminalResult()).toBeNull();
  });

  it('creates one explicit error when the stream ends without a terminal', () => {
    const { guard } = createGuard('fr');
    guard.handle({
      type: 'system',
      subtype: 'status',
      status: 'model',
    });

    expect(guard.missingTerminalResult()).toEqual({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      error_code: 'model_unavailable',
      result: 'fr:common.error.ai_coach_model_unavailable',
    });
    expect(guard.missingTerminalResult()).toBeNull();
  });
});
