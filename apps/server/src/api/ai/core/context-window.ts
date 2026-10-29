import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { AiToolDef } from './tool.types';
import {
  getSelfHostAiModelPreset,
  isSelfHostAiProvider,
} from '@shared/self-host-ai-catalog';

type CoachChatMessage = ChatCompletionMessageParam & {
  reasoning_content?: unknown;
};

function coachChatExtras(
  message: ChatCompletionMessageParam,
): CoachChatMessage {
  return message;
}

export type ContextWindowSnapshot = {
  maxContextTokens: number;
  reservedOutputTokens: number;
  inputBudgetTokens: number;
  usedInputTokens: number;
  remainingInputTokens: number;
  compressionThresholdTokens: number;
  usageRatio: number;
  shouldCompress: boolean;
  estimator: 'mixed_chars_v1';
};

export type ContextCompactionResult = {
  messages: ChatCompletionMessageParam[];
  before: ContextWindowSnapshot;
  after: ContextWindowSnapshot;
  compressed: boolean;
  compactedMessages: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function compactText(text: string, maxChars: number): string {
  const normalized = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;
  if (maxChars <= 24) return normalized.slice(0, maxChars);

  const head = Math.max(8, Math.floor(maxChars * 0.6));
  const tail = Math.max(8, maxChars - head - 1);
  return `${normalized.slice(0, head)}…${normalized.slice(-tail)}`;
}

function stringifyMessageContent(
  content: ChatCompletionMessageParam['content'],
): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    try {
      return JSON.stringify(content);
    } catch {
      return '';
    }
  }
  return '';
}

function compactMessageContent(
  message: ChatCompletionMessageParam,
  maxChars: number,
): ChatCompletionMessageParam {
  const content = stringifyMessageContent(message.content);
  if (!content || content.length <= maxChars) return message;

  if (message.role === 'tool') {
    return {
      ...message,
      content: JSON.stringify({
        compacted: true,
        originalChars: content.length,
        preview: compactText(content, maxChars),
      }),
    };
  }

  if (typeof message.content === 'string') {
    return {
      ...message,
      content: compactText(message.content, maxChars),
    };
  }

  return {
    ...message,
    content: compactText(content, maxChars),
  };
}

function estimateTextTokens(text: string): number {
  let tokens = 0;
  let asciiRun = 0;
  const flushAscii = () => {
    if (asciiRun <= 0) return;
    tokens += Math.ceil(asciiRun / 4);
    asciiRun = 0;
  };

  for (const char of String(text ?? '')) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) {
      asciiRun += 1;
      continue;
    }
    flushAscii();
    // CJK text is much closer to one token per character than chars / 4.
    tokens += 1;
  }
  flushAscii();
  return tokens;
}

function estimateValueTokens(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'string') return estimateTextTokens(value) + 4;
  try {
    return estimateTextTokens(JSON.stringify(value)) + 8;
  } catch {
    return 16;
  }
}

function estimateMessageTokens(message: ChatCompletionMessageParam): number {
  const extras = coachChatExtras(message);
  return (
    6 +
    estimateValueTokens(message.role) +
    estimateValueTokens(message.content) +
    estimateValueTokens(
      'tool_calls' in extras ? extras.tool_calls : undefined,
    ) +
    estimateValueTokens(
      'tool_call_id' in extras ? extras.tool_call_id : undefined,
    ) +
    estimateValueTokens(extras.reasoning_content)
  );
}

function estimateToolsTokens(tools: AiToolDef[]): number {
  return tools.reduce(
    (sum, tool) =>
      sum +
      estimateValueTokens({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }),
    0,
  );
}

function inferContextWindowTokens(model: string): number {
  const normalized = String(model ?? '').toLowerCase();
  if (!normalized) return 64_000;
  const rawProvider = String(process.env.AI_PROVIDER ?? '')
    .trim()
    .toLowerCase();
  const provider = rawProvider === 'aliyun' ? 'dashscope' : rawProvider;
  if (isSelfHostAiProvider(provider)) {
    const preset = getSelfHostAiModelPreset(provider, model);
    if (preset) return preset.contextWindowTokens;
  }
  if (normalized === String(process.env.AI_DEFAULT_MODEL ?? '').toLowerCase()) {
    const configured = Number(process.env.AI_DEFAULT_MODEL_CONTEXT_TOKENS);
    if (Number.isInteger(configured) && configured >= 16_000) return configured;
  }
  if (
    normalized === String(process.env.AI_REASONING_MODEL ?? '').toLowerCase()
  ) {
    const configured = Number(process.env.AI_REASONING_MODEL_CONTEXT_TOKENS);
    if (Number.isInteger(configured) && configured >= 16_000) return configured;
  }
  if (
    normalized.includes('gpt-6') ||
    normalized.includes('gpt-5') ||
    normalized.includes('gpt-4.1')
  )
    return 1_050_000;
  if (normalized.includes('deepseek-v4') || normalized === 'deepseek-flash')
    return 1_000_000;
  if (normalized.includes('gemini-3')) return 1_048_576;
  if (normalized.includes('grok-4.')) return 500_000;
  if (normalized.includes('claude')) return 200_000;
  if (normalized.includes('qwen3.7') || normalized.includes('qwen3.8'))
    return 1_000_000;
  if (normalized.includes('mistral-small-2603')) return 262_144;
  if (normalized.includes('gpt-oss') || normalized.includes('llama-3.'))
    return 131_072;
  return 64_000;
}

export function buildContextWindowSnapshot(args: {
  model: string;
  messages: ChatCompletionMessageParam[];
  tools: AiToolDef[];
}): ContextWindowSnapshot {
  const maxContextTokens = Math.max(
    16_000,
    Number(
      process.env.AI_COACH_CONTEXT_WINDOW_TOKENS ??
        inferContextWindowTokens(args.model),
    ),
  );
  const reservedOutputTokens = clamp(
    Number(process.env.AI_COACH_RESERVED_OUTPUT_TOKENS ?? 8_000),
    1_000,
    Math.max(1_000, Math.floor(maxContextTokens * 0.5)),
  );
  const inputBudgetTokens = Math.max(
    1_000,
    maxContextTokens - reservedOutputTokens,
  );
  const compressionThresholdRatio = clamp(
    Number(process.env.AI_COACH_COMPRESSION_THRESHOLD_RATIO ?? 0.82),
    0.5,
    0.97,
  );
  const usedInputTokens =
    args.messages.reduce(
      (sum, message) => sum + estimateMessageTokens(message),
      0,
    ) + estimateToolsTokens(args.tools);
  const remainingInputTokens = Math.max(0, inputBudgetTokens - usedInputTokens);
  const compressionThresholdTokens = Math.floor(
    inputBudgetTokens * compressionThresholdRatio,
  );

  return {
    maxContextTokens,
    reservedOutputTokens,
    inputBudgetTokens,
    usedInputTokens,
    remainingInputTokens,
    compressionThresholdTokens,
    usageRatio: Number((usedInputTokens / inputBudgetTokens).toFixed(4)),
    shouldCompress: usedInputTokens >= compressionThresholdTokens,
    estimator: 'mixed_chars_v1',
  };
}

function hasToolCalls(message: ChatCompletionMessageParam): boolean {
  return 'tool_calls' in message && Array.isArray(message.tool_calls);
}

function isToolMessage(message: ChatCompletionMessageParam): boolean {
  return message.role === 'tool';
}

function isAtomicToolGroupMessage(
  message: ChatCompletionMessageParam,
): boolean {
  return hasToolCalls(message) || isToolMessage(message);
}

function buildAtomicHistoryGroups(messages: ChatCompletionMessageParam[]) {
  const groups: Array<{ start: number; end: number }> = [];
  let i = 1; // keep system prompt outside history compaction groups
  while (i < messages.length) {
    const message = messages[i];
    if (hasToolCalls(message)) {
      let end = i + 1;
      while (end < messages.length && isToolMessage(messages[end])) {
        end += 1;
      }
      groups.push({ start: i, end });
      i = end;
      continue;
    }
    groups.push({ start: i, end: i + 1 });
    i += 1;
  }
  return groups;
}

function dropOldestHistoryGroups(args: {
  messages: ChatCompletionMessageParam[];
  model: string;
  tools: AiToolDef[];
  before: ContextWindowSnapshot;
  compactedMessages: number;
}): ContextCompactionResult {
  let messages = args.messages;
  let droppedMessages = 0;
  const minTailGroups = Math.max(
    1,
    Number(process.env.AI_COACH_COMPACTION_KEEP_TAIL_GROUPS ?? 4),
  );

  // Recompute groups after each drop because indices shift.
  // Never drop the system prompt; prefer removing old complete history groups.
  // Tool-call groups are atomic: assistant tool_calls + following tool messages.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snapshot = buildContextWindowSnapshot({
      model: args.model,
      messages,
      tools: args.tools,
    });
    if (!snapshot.shouldCompress) {
      return {
        messages,
        before: args.before,
        after: snapshot,
        compressed: args.compactedMessages + droppedMessages > 0,
        compactedMessages: args.compactedMessages + droppedMessages,
      };
    }

    const groups = buildAtomicHistoryGroups(messages);
    if (groups.length <= minTailGroups) {
      return {
        messages,
        before: args.before,
        after: snapshot,
        compressed: args.compactedMessages + droppedMessages > 0,
        compactedMessages: args.compactedMessages + droppedMessages,
      };
    }

    const drop = groups[0];
    droppedMessages += drop.end - drop.start;
    messages = [...messages.slice(0, drop.start), ...messages.slice(drop.end)];
  }
}

export function compactMessagesForBudget(args: {
  model: string;
  messages: ChatCompletionMessageParam[];
  tools: AiToolDef[];
}): ContextCompactionResult {
  const cloned = args.messages.map((message) => ({ ...message }));
  const before = buildContextWindowSnapshot({
    model: args.model,
    messages: cloned,
    tools: args.tools,
  });
  if (!before.shouldCompress) {
    return {
      messages: cloned,
      before,
      after: before,
      compressed: false,
      compactedMessages: 0,
    };
  }

  const passes: Array<{
    roles: Array<ChatCompletionMessageParam['role']>;
    keepLast: number;
    maxChars: number;
  }> = [
    { roles: ['assistant', 'user'], keepLast: 2, maxChars: 1_200 },
    { roles: ['assistant', 'user'], keepLast: 1, maxChars: 800 },
  ];

  let compactedMessages = 0;
  for (const pass of passes) {
    const cutoff = Math.max(1, cloned.length - pass.keepLast);
    for (let index = 1; index < cutoff; index++) {
      const message = cloned[index];
      if (!pass.roles.includes(message.role)) continue;
      if (isAtomicToolGroupMessage(message)) continue;

      const compacted = compactMessageContent(message, pass.maxChars);
      if (JSON.stringify(compacted) !== JSON.stringify(message)) {
        cloned[index] = compacted;
        compactedMessages += 1;
      }
    }

    const afterPass = buildContextWindowSnapshot({
      model: args.model,
      messages: cloned,
      tools: args.tools,
    });
    if (!afterPass.shouldCompress) {
      return {
        messages: cloned,
        before,
        after: afterPass,
        compressed: compactedMessages > 0,
        compactedMessages,
      };
    }
  }

  const after = buildContextWindowSnapshot({
    model: args.model,
    messages: cloned,
    tools: args.tools,
  });
  if (!after.shouldCompress) {
    return {
      messages: cloned,
      before,
      after,
      compressed: compactedMessages > 0,
      compactedMessages,
    };
  }

  return dropOldestHistoryGroups({
    messages: cloned,
    model: args.model,
    tools: args.tools,
    before,
    compactedMessages,
  });
}
