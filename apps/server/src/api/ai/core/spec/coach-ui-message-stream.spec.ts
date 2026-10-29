import { describe, expect, it } from '@jest/globals';
import { coachQueryYieldsToUIMessageStream } from '../coach-ui-message-stream';
import type { CoachUiStreamYield } from '../coach-ui-message-stream';

async function* fromEvents(events: CoachUiStreamYield[]) {
  for (const event of events) {
    yield event;
  }
}

async function collectChunks(events: CoachUiStreamYield[]) {
  const stream = coachQueryYieldsToUIMessageStream(fromEvents(events));
  const reader = stream.getReader();
  const chunks: unknown[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
}

describe('coachQueryYieldsToUIMessageStream', () => {
  it('converts text deltas and never exposes raw reasoning as UI chunks', async () => {
    const chunks = await collectChunks([
      {
        type: 'system',
        subtype: 'status',
        status: 'model',
        step: 1,
        progress: 'analyzing_request',
      },
      {
        type: 'stream_event',
        event: { type: 'reasoning_delta', text: 'thinking' },
      },
      {
        type: 'stream_event',
        event: { type: 'text_delta', text: 'hello' },
      },
      {
        type: 'stream_event',
        event: { type: 'text_delta', text: ' world' },
      },
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'hello world',
      },
    ]);

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'start' }),
        { type: 'start-step' },
        {
          type: 'data-coach-status',
          id: 'coach-status-current',
          data: {
            status: 'model',
            step: 1,
            progress: 'analyzing_request',
          },
        },
        { type: 'text-start', id: 'coach-text-1' },
        { type: 'text-delta', id: 'coach-text-1', delta: 'hello' },
        { type: 'text-delta', id: 'coach-text-1', delta: ' world' },
        { type: 'text-end', id: 'coach-text-1' },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'stop' },
      ]),
    );
    for (const type of [
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
    ]) {
      expect(chunks).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ type })]),
      );
    }
  });

  it('preserves text-card-text ordering with separate text segments', async () => {
    const chunks = await collectChunks([
      {
        type: 'stream_event',
        event: { type: 'text_delta', text: '先看今天的安排。' },
      },
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'workout-card',
              name: 'PlanDayView',
              input: { kind: 'plan_day_view', date: '2026-09-30' },
            },
          ],
        },
      },
      {
        type: 'stream_event',
        event: { type: 'text_delta', text: '再结合负荷判断。' },
      },
    ]);

    const visible = chunks.filter((chunk) => {
      const type = (chunk as { type?: string }).type;
      return type?.startsWith('text-') || type === 'data-coach-tool';
    });
    expect(visible).toEqual([
      { type: 'text-start', id: 'coach-text-1' },
      {
        type: 'text-delta',
        id: 'coach-text-1',
        delta: '先看今天的安排。',
      },
      { type: 'text-end', id: 'coach-text-1' },
      {
        type: 'data-coach-tool',
        id: 'workout-card',
        data: {
          toolCallId: 'workout-card',
          name: 'PlanDayView',
          input: { kind: 'plan_day_view', date: '2026-09-30' },
        },
      },
      { type: 'text-start', id: 'coach-text-2' },
      {
        type: 'text-delta',
        id: 'coach-text-2',
        delta: '再结合负荷判断。',
      },
      { type: 'text-end', id: 'coach-text-2' },
    ]);
  });

  it('converts tool, tool result, progress, context, and branch events', async () => {
    const chunks = await collectChunks([
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'ProfileZones',
              input: { sportType: 'RUN' },
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_1',
              content: { ok: true },
            },
          ],
        },
      },
      {
        type: 'tool_progress',
        tool_name: 'profile.zones',
        status: 'end',
        ok: true,
        result_count: 2,
      },
      {
        type: 'system',
        subtype: 'context_window',
        step: 1,
        maxContextTokens: 100,
        reservedOutputTokens: 20,
        inputBudgetTokens: 80,
        usedInputTokens: 40,
        remainingInputTokens: 40,
        compressionThresholdTokens: 72,
        usageRatio: 0.5,
        estimator: 'mixed_chars_v1',
        compressed: false,
        compactedMessages: 0,
      },
      {
        type: 'branch',
        subtype: 'opened',
        branch: {
          id: 'branch_1',
          contextId: 'ctx_1',
          status: 'ACTIVE',
        },
      },
    ]);

    expect(chunks).toEqual(
      expect.arrayContaining([
        {
          type: 'data-coach-tool',
          id: 'tool_1',
          data: {
            toolCallId: 'tool_1',
            name: 'ProfileZones',
            input: { sportType: 'RUN' },
          },
        },
        {
          type: 'data-coach-user-tool-result',
          id: 'tool_1',
          data: {
            toolUseId: 'tool_1',
            content: { ok: true },
          },
        },
        {
          type: 'data-coach-tool-progress',
          id: 'coach-tool-progress-current',
          data: {
            toolName: 'profile.zones',
            status: 'end',
            ok: true,
            resultCount: 2,
          },
        },
        {
          type: 'data-coach-context-window',
          id: 'coach-context-window-current',
          data: expect.objectContaining({
            step: 1,
            estimator: 'mixed_chars_v1',
            usedInputTokens: 40,
          }),
        },
        {
          type: 'data-coach-branch-opened',
          id: 'branch_1',
          data: {
            id: 'branch_1',
            contextId: 'ctx_1',
            status: 'ACTIVE',
          },
        },
      ]),
    );
  });

  it('does not expose failed internal UI delivery calls as cards', async () => {
    const chunks = await collectChunks([
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'failed_question',
              name: 'ask_user_question',
              input: {
                questions: [
                  {
                    id: 'start_week',
                    header: '开始时间',
                    question: '从哪天开始？',
                    options: [{ label: '明天', description: '从明天开始' }],
                  },
                ],
              },
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'successful_question',
              name: 'AskUserQuestion',
              input: {
                questions: [
                  {
                    id: 'start_week',
                    header: '开始时间',
                    question: '从哪天开始？',
                    options: [
                      {
                        value: 'tomorrow',
                        label: '明天',
                        description: '从明天开始',
                      },
                      {
                        value: 'next_monday',
                        label: '下周一',
                        description: '从下周一开始',
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    ]);

    expect(chunks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-tool',
          id: 'failed_question',
        }),
      ]),
    );
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'data-coach-tool',
          id: 'successful_question',
          data: expect.objectContaining({ name: 'AskUserQuestion' }),
        }),
      ]),
    );
  });

  it('emits an UI stream error chunk for terminal coach errors', async () => {
    const chunks = await collectChunks([
      {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        result: 'quota exceeded',
      },
    ]);

    expect(chunks).toEqual(
      expect.arrayContaining([
        { type: 'error', errorText: 'quota exceeded' },
        { type: 'finish', finishReason: 'error' },
      ]),
    );
  });
});
