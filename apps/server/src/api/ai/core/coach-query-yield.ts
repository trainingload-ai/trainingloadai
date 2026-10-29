import type { CoachActivityEvent } from '@shared/ai-coach-run-contract';

export type CoachPhase = 'model' | 'tool_run';

export type CoachProgressCode =
  | 'thinking'
  | 'preparing'
  | 'analyzing_request'
  | 'synthesizing_evidence'
  | 'drafting_plan'
  | 'running_tools';

export type CoachModelUsageStatus = 'SUCCESS' | 'RETRY' | 'FAILED';

export type CoachApiFunctionToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type CoachAssistantToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
};

export type CoachAssistantContentBlock =
  | { type: 'text'; text: string }
  | CoachAssistantToolUseBlock;

export type CoachUserToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
};

export type CoachUserContentBlock =
  | { type: 'text'; text: string }
  | CoachUserToolResultBlock;

export type CoachUserMessageBody = {
  content: CoachUserContentBlock[];
};

export type CoachAssistantMessageBody = {
  content: CoachAssistantContentBlock[];
  reasoning_content?: string;
};

export type CoachStreamEvent =
  | {
      type: 'text_delta';
      text: string;
      modelStepId?: string;
      placement?: 'activity' | 'answer';
    }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'phase'; phase: CoachPhase };

/**
 * 对齐 Claude SDKMessage 的最小协议集合：
 * - stream_event: 增量文本与阶段事件
 * - assistant: 完整助手消息（含 tool_use）
 * - system: 运行状态与上下文窗口
 * - tool_progress: 工具阶段状态
 * - result: 回合收尾
 */
export type CoachQueryYield =
  | { type: 'activity'; activity: CoachActivityEvent }
  | {
      type: 'stream_event';
      event: CoachStreamEvent;
    }
  | {
      type: 'assistant';
      message: CoachAssistantMessageBody;
    }
  | {
      type: 'user';
      message: CoachUserMessageBody;
    }
  | {
      type: 'system';
      subtype: 'status';
      status: 'running' | 'model' | 'tool_run';
      step?: number;
      progress?: CoachProgressCode;
    }
  | {
      type: 'system';
      subtype: 'context_window';
      step: number;
      maxContextTokens: number;
      reservedOutputTokens: number;
      inputBudgetTokens: number;
      usedInputTokens: number;
      remainingInputTokens: number;
      compressionThresholdTokens: number;
      usageRatio: number;
      estimator: 'mixed_chars_v1';
      compressed: boolean;
      compactedMessages: number;
    }
  | {
      type: 'tool_progress';
      tool_name: string;
      status: 'issued' | 'start' | 'end' | 'done';
      ok?: boolean;
      result_count?: number;
      tool_names?: string[];
    }
  | {
      /**
       * Internal accounting event. Controllers consume it before serializing
       * the user-facing stream so each upstream model call is attributable.
       */
      type: 'model_usage';
      usage: unknown;
      model: string;
      provider?: string;
      status: CoachModelUsageStatus;
    }
  | {
      type: 'result';
      subtype: 'success' | 'error_during_execution';
      is_error: boolean;
      result: string;
      usage?: unknown;
      /** Actual upstream model that produced the successful result. */
      model?: string;
      provider?: string;
      error_code?: string;
      data?: unknown;
      operation?: {
        operationId: string;
        status?: 'STARTED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABANDONED';
        replayed?: boolean;
        recovery?: unknown;
        purpose?: 'DEFAULT' | 'REASONING';
        pending?: boolean;
        completedAt?: string | null;
        errorCode?: string | null;
      };
    };

export type ToolCallStreamAccumulator = Map<
  number,
  { id?: string; name?: string; arguments: string }
>;

export const TOOL_ARGS_PARSE_ERROR_KEY = '__tool_args_parse_error';
export const TOOL_ARGS_RAW_PREVIEW_KEY = '__tool_args_raw_preview';

export function createToolCallAccumulator(): ToolCallStreamAccumulator {
  return new Map();
}

export function feedToolCallStreamDelta(
  acc: ToolCallStreamAccumulator,
  chunk: unknown,
): void {
  const toolCalls = (
    chunk as { choices?: Array<{ delta?: { tool_calls?: unknown[] } }> }
  )?.choices?.[0]?.delta?.tool_calls;
  if (!Array.isArray(toolCalls)) return;
  for (const tc of toolCalls) {
    const t = tc as {
      index?: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    };
    const idx = t.index ?? 0;
    const cur = acc.get(idx) ?? { arguments: '' };
    if (t.id) cur.id = t.id;
    if (t.function?.name) cur.name = t.function.name;
    if (t.function?.arguments) cur.arguments += t.function.arguments;
    acc.set(idx, cur);
  }
}

function parseToolArgsJson(s: string): Record<string, unknown> {
  if (!s.trim()) return {};
  try {
    const x = JSON.parse(s);
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      return x as Record<string, unknown>;
    }
    return {
      [TOOL_ARGS_PARSE_ERROR_KEY]: 'tool arguments JSON must be an object',
      [TOOL_ARGS_RAW_PREVIEW_KEY]: s.slice(0, 1000),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      [TOOL_ARGS_PARSE_ERROR_KEY]: `tool arguments must be valid JSON: ${message}`,
      [TOOL_ARGS_RAW_PREVIEW_KEY]: s.slice(0, 1000),
    };
  }
}

export function finalizeStreamedToolCalls(acc: ToolCallStreamAccumulator): {
  apiToolCalls: CoachApiFunctionToolCall[];
  coachCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
} {
  const sorted = [...acc.entries()].sort((a, b) => a[0] - b[0]);
  const apiToolCalls: CoachApiFunctionToolCall[] = sorted.map(([i, v], j) => ({
    id: v.id ?? `call_${j}_${i}`,
    type: 'function' as const,
    function: {
      name: v.name ?? '',
      arguments: v.arguments,
    },
  }));
  const coachCalls = apiToolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: parseToolArgsJson(tc.function.arguments),
  }));
  return { apiToolCalls, coachCalls };
}

export function isCoachQueryYield(x: unknown): x is CoachQueryYield {
  if (!x || typeof x !== 'object') return false;
  const t = (x as { type?: unknown }).type;
  if (typeof t !== 'string') return false;
  switch (t) {
    case 'stream_event':
      return typeof (x as { event?: unknown }).event === 'object';
    case 'assistant':
      return Array.isArray(
        (x as { message?: { content?: unknown } }).message?.content,
      );
    case 'user':
      return Array.isArray(
        (x as { message?: { content?: unknown } }).message?.content,
      );
    case 'system':
      return typeof (x as { subtype?: unknown }).subtype === 'string';
    case 'tool_progress':
      return typeof (x as { tool_name?: unknown }).tool_name === 'string';
    case 'model_usage':
      return (
        typeof (x as { model?: unknown }).model === 'string' &&
        typeof (x as { status?: unknown }).status === 'string'
      );
    case 'result':
      return (
        typeof (x as { subtype?: unknown }).subtype === 'string' &&
        typeof (x as { is_error?: unknown }).is_error === 'boolean'
      );
    default:
      return false;
  }
}

export function mapOpenAIChunkToCoachYields(chunk: unknown): CoachQueryYield[] {
  const c = chunk as {
    choices?: Array<{
      delta?: {
        content?: string | null;
        reasoning_content?: string | null;
      };
    }>;
  };
  const out: CoachQueryYield[] = [];
  // reasoning_content is retained by provider-specific runtimes only when it
  // is required for model continuity. It must never become a client event.
  const content = c?.choices?.[0]?.delta?.content;
  if (typeof content === 'string' && content.length > 0) {
    out.push({
      type: 'stream_event',
      event: { type: 'text_delta', text: content },
    });
  }
  return out;
}
