import { describe, expect, it } from '@jest/globals';
import {
  isCoachPublicReasoningSummary,
  COACH_PUBLIC_SUMMARY_MAX_CHARS,
} from '@shared/ai-coach-run-contract';
import {
  coachPublicSummaryFromText,
  sanitizeCoachPublicSummary,
} from '../coach-public-summary';
import { sanitizeStoredCoachMessageForClient } from '../coach-history-messages';
import { CoachClientOutputGuard } from '../coach-client-output-guard';

const text =
  '近期训练量和恢复情况会影响起始负荷；我会先核对这些依据，再安排递进幅度。';
const summary = { source: 'assistant_public_summary' as const, text };

describe('public reasoning boundary', () => {
  it('accepts only bounded, explicitly public summaries', () => {
    expect(coachPublicSummaryFromText(text, 'zh')).toEqual(summary);
    expect(isCoachPublicReasoningSummary(summary)).toBe(true);
    for (const value of [
      undefined,
      {},
      '',
      { ...summary, source: 'reasoning_content' },
      { ...summary, reasoning_content: 'private' },
      { ...summary, text: '' },
      { ...summary, text: 'x'.repeat(COACH_PUBLIC_SUMMARY_MAX_CHARS + 1) },
    ])
      expect(sanitizeCoachPublicSummary(value)).toBeUndefined();
  });

  it.each([
    '<coach_app_context>private</coach_app_context>',
    'personalizationReadiness = READY',
    'training.plan_context returned a payload',
    'system prompt: private',
    '系统提示词是：保密内容',
    'Authorization: Bearer secret',
    'api_key=secret',
    '{"raw":"tool data"}',
    '```private code```',
    'https://example.test/private',
    'athlete@example.test',
  ])('drops unsafe or non-prose public candidates: %s', (candidate) => {
    expect(coachPublicSummaryFromText(candidate, 'zh')).toBeUndefined();
  });

  it('rechecks stored public content, strips raw reasoning and keeps activity status', () => {
    const message = sanitizeStoredCoachMessageForClient({
      kind: 'ui_message',
      version: 2,
      role: 'assistant',
      reasoning_content: 'private',
      providerHistory: [{ secret: 'private' }],
      parts: [
        { type: 'reasoning', text: 'private' },
        {
          type: 'data-coach-activity',
          data: {
            kind: 'analysis',
            status: 'completed',
            publicSummary: summary,
          },
        },
        {
          type: 'data-coach-activity',
          data: {
            kind: 'analysis',
            status: 'failed',
            publicSummary: { ...summary, text: 'api_key=secret' },
          },
        },
        {
          type: 'data-coach-activity',
          data: { kind: 'tool', status: 'completed', publicSummary: summary },
        },
      ],
    });
    expect(message).toMatchObject({
      parts: [
        {
          data: {
            kind: 'analysis',
            status: 'completed',
            publicSummary: summary,
          },
        },
        { data: { kind: 'analysis', status: 'failed' } },
        { data: { kind: 'tool', status: 'completed' } },
      ],
    });
    const parts = (message as { parts: { data: Record<string, unknown> }[] })
      .parts;
    expect(parts[1].data).not.toHaveProperty('publicSummary');
    expect(parts[2].data).not.toHaveProperty('publicSummary');
    expect(JSON.stringify(message)).not.toMatch(/secret|private/);
  });

  it('never counts a summary as final delivery or lets raw deltas through', () => {
    const guard = new CoachClientOutputGuard(
      { t: () => '没有最终回答' } as never,
      'zh',
    );
    const event = {
      type: 'activity' as const,
      activity: {
        key: 'model:1:1',
        kind: 'analysis' as const,
        status: 'completed' as const,
        labelKey: 'analysis',
        publicSummary: summary,
      },
    };
    expect(guard.handle(event)).toEqual(event);
    expect(
      guard.handle({
        type: 'stream_event',
        event: { type: 'reasoning_delta', text: 'private' },
      }),
    ).toBeNull();
    expect(
      guard.handle({
        ...event,
        activity: {
          ...event.activity,
          publicSummary: { ...summary, text: 'api_key=secret' },
        },
      }),
    ).not.toHaveProperty('activity.publicSummary');
    expect(
      guard.handle({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: '',
      }),
    ).toMatchObject({ type: 'result', is_error: true });
  });
});
