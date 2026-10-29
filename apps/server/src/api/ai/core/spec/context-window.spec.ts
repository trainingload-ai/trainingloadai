import { describe, expect, it } from '@jest/globals';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  buildContextWindowSnapshot,
  compactMessagesForBudget,
} from '../context-window';

describe('context-window', () => {
  function withContextEnv<T>(env: Record<string, string>, fn: () => T): T {
    const previous = {
      AI_COACH_CONTEXT_WINDOW_TOKENS:
        process.env.AI_COACH_CONTEXT_WINDOW_TOKENS,
      AI_COACH_RESERVED_OUTPUT_TOKENS:
        process.env.AI_COACH_RESERVED_OUTPUT_TOKENS,
      AI_COACH_COMPRESSION_THRESHOLD_RATIO:
        process.env.AI_COACH_COMPRESSION_THRESHOLD_RATIO,
      AI_COACH_COMPACTION_KEEP_TAIL_GROUPS:
        process.env.AI_COACH_COMPACTION_KEEP_TAIL_GROUPS,
    };
    Object.assign(process.env, env);
    try {
      return fn();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  }

  it('builds a budget snapshot including messages and tool definitions', () => {
    const snapshot = withContextEnv(
      {
        AI_COACH_CONTEXT_WINDOW_TOKENS: '16000',
        AI_COACH_RESERVED_OUTPUT_TOKENS: '1000',
        AI_COACH_COMPRESSION_THRESHOLD_RATIO: '0.5',
      },
      () =>
        buildContextWindowSnapshot({
          model: 'unknown-model',
          messages: [
            { role: 'system', content: 'You are a coach.' },
            { role: 'user', content: '你好，please help me plan.' },
          ],
          tools: [
            {
              name: 'PlanTool',
              description: 'Create a plan',
              parameters: { type: 'object', properties: { weeks: {} } },
            } as never,
          ],
        }),
    );

    expect(snapshot).toMatchObject({
      maxContextTokens: 16000,
      reservedOutputTokens: 1000,
      inputBudgetTokens: 15000,
      compressionThresholdTokens: 7500,
      shouldCompress: false,
      estimator: 'mixed_chars_v1',
    });
    expect(snapshot.usedInputTokens).toBeGreaterThan(0);
    expect(snapshot.remainingInputTokens).toBe(
      snapshot.inputBudgetTokens - snapshot.usedInputTokens,
    );
  });

  it('returns cloned messages unchanged when under the compression threshold', () => {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'short question' },
    ];

    const result = withContextEnv(
      {
        AI_COACH_CONTEXT_WINDOW_TOKENS: '16000',
        AI_COACH_RESERVED_OUTPUT_TOKENS: '1000',
        AI_COACH_COMPRESSION_THRESHOLD_RATIO: '0.9',
      },
      () => compactMessagesForBudget({ model: 'gpt-5', messages, tools: [] }),
    );

    expect(result.compressed).toBe(false);
    expect(result.compactedMessages).toBe(0);
    expect(result.messages).toEqual(messages);
    expect(result.messages[0]).not.toBe(messages[0]);
    expect(result.after).toBe(result.before);
  });

  it('compacts old user and assistant text while preserving the system prompt and recent tail', () => {
    const longUser = `old user ${'u'.repeat(20000)}`;
    const longAssistant = `old assistant ${'a'.repeat(20000)}`;
    const recentUser = `recent ${'r'.repeat(2000)}`;
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: longUser },
      { role: 'assistant', content: longAssistant },
      { role: 'user', content: recentUser },
    ];

    const result = withContextEnv(
      {
        AI_COACH_CONTEXT_WINDOW_TOKENS: '16000',
        AI_COACH_RESERVED_OUTPUT_TOKENS: '12000',
        AI_COACH_COMPRESSION_THRESHOLD_RATIO: '0.5',
      },
      () => compactMessagesForBudget({ model: 'gpt-5', messages, tools: [] }),
    );

    expect(result.compressed).toBe(true);
    expect(result.compactedMessages).toBeGreaterThanOrEqual(1);
    expect(result.messages[0]).toEqual({
      role: 'system',
      content: 'system prompt',
    });
    expect(String(result.messages[1].content).length).toBeLessThan(
      longUser.length,
    );
    expect(String(result.messages[1].content)).toContain('…');
    expect(result.messages.at(-1)).toEqual({ role: 'user', content: recentUser });
    expect(result.after.usedInputTokens).toBeLessThan(
      result.before.usedInputTokens,
    );
  });

  it('drops old assistant tool-call groups atomically when text compaction is not enough', () => {
    const toolCallMessage = {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'LoadActivity', arguments: '{}' },
        },
      ],
    } as ChatCompletionMessageParam;
    const toolResult = {
      role: 'tool',
      tool_call_id: 'call-1',
      content: JSON.stringify({ data: 'x'.repeat(30000) }),
    } as ChatCompletionMessageParam;
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'old question' },
      toolCallMessage,
      toolResult,
      { role: 'assistant', content: 'old answer' },
      { role: 'user', content: 'recent question' },
      { role: 'assistant', content: 'recent answer' },
    ];

    const result = withContextEnv(
      {
        AI_COACH_CONTEXT_WINDOW_TOKENS: '16000',
        AI_COACH_RESERVED_OUTPUT_TOKENS: '14000',
        AI_COACH_COMPRESSION_THRESHOLD_RATIO: '0.5',
        AI_COACH_COMPACTION_KEEP_TAIL_GROUPS: '2',
      },
      () => compactMessagesForBudget({ model: 'gpt-5', messages, tools: [] }),
    );

    expect(result.compressed).toBe(true);
    expect(result.messages).not.toContainEqual(toolCallMessage);
    expect(result.messages).not.toContainEqual(toolResult);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'recent question' },
        { role: 'assistant', content: 'recent answer' },
      ]),
    );
    expect(result.compactedMessages).toBeGreaterThanOrEqual(3);
  });
});
