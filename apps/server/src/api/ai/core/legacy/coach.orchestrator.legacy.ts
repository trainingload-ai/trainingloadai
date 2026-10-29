import OpenAI from 'openai';
// LEGACY / REFERENCE ONLY:
// AI Coach 主对话 loop 已切到 `tool-loop-agent.runtime.ts` 的 AI SDK
// ToolLoopAgent。此文件短期保留用于迁移对照旧的 streaming/tool/UI-card
// 行为；不要再把新的 coach chat 生产路径接回这里。
import {
  checkAiToolPermissions,
  findAiToolByName,
  isAiToolConcurrencySafe,
  toProviderToolName,
  validateAiToolInput,
  type AiToolDef,
  type AiToolContext,
  type AiToolModelSummaryArgs,
  asRecordTool,
} from '../tool.types';
import type { ActiveCoachSkill } from '../skill.types';
import {
  createToolCallAccumulator,
  feedToolCallStreamDelta,
  finalizeStreamedToolCalls,
  mapOpenAIChunkToCoachYields,
  TOOL_ARGS_PARSE_ERROR_KEY,
  TOOL_ARGS_RAW_PREVIEW_KEY,
  type CoachAssistantContentBlock,
  type CoachQueryYield,
} from '../coach-query-yield';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { Logger } from '@nestjs/common';
import { previewTextForLog, safeJsonPreview } from '../safe-json-preview';
import { asRecord, unknownErrorFields } from '../ai-common.util';
import { getCoachSkillByName } from '../skill.registry';
import { sortToolsBySkillPreference } from '../tool.registry';
import {
  buildContextWindowSnapshot,
  compactMessagesForBudget,
} from '../context-window';
import {
  createCoachClient as createCoachClientViaAdapter,
  getCoachBaseUrlForLog,
  getCoachModel as getCoachModelViaAdapter,
  getCoachUpstreamProvider,
  type CoachClientOptions,
} from '../coach-upstream.adapter';
import { resolveAthleteClock } from '../athlete-relative-day';
import { buildCoachSystemPrompt } from '../coach.prompt';

export { buildCoachSystemPrompt } from '../coach.prompt';

/**
 * 需要在客户端渲染「结构化卡片」的只读工具：
 * SSE / 落库的 assistant.tool_use.input 应回填 **execute 输出**（可信事实），而不是模型的 tool call 参数。
 * key：AiToolDef.name（canonical）；value：前端 PascalCase 组件名（与 ai.controller 白名单一致）
 */
const COACH_UI_CARD_TOOL_DISPLAY_NAMES: Record<string, string> = {
  'plan.day_view': 'PlanDayView',
  'activity.recent': 'ActivityRecent',
  'activity.day_view': 'ActivityDayView',
  'pmc.range': 'PmcRange',
  present_training_visualization: 'TrainingVisualization',
  'profile.zones': 'ProfileZones',
  'profile.zone_ranges': 'ProfileZoneRanges',
  coach_decision_draft: 'CoachDecisionDraft',
  coach_decision_apply: 'CoachDecisionApplied',
};

/** 写库 mutation 工具：落库 / SSE 的 tool_use 用统一名 + execute 回执（与 read 卡同契约） */
const MUTATION_APPLIED_UI_NAME = 'MutationApplied';

function buildCoachUiCardToolUseBlocks(args: {
  tools: AiToolDef[];
  coachCalls: ToolCall[];
  toolResults: Array<{ name: string; output: unknown; content: string }>;
}): CoachAssistantContentBlock[] {
  return args.coachCalls.map((call, index) => {
    const toolResult = args.toolResults[index];
    const resolvedTool = findAiToolByName(args.tools, call.name);
    const canonical = resolvedTool?.name ?? call.name;
    const uiName = COACH_UI_CARD_TOOL_DISPLAY_NAMES[canonical];
    if (uiName && toolResult?.output !== undefined) {
      return {
        type: 'tool_use',
        id: call.id,
        name: uiName,
        input: toolResult.output,
      };
    }
    const out = toolResult?.output as { kind?: unknown } | undefined;
    if (
      resolvedTool?.kind === 'mutation' &&
      out?.kind === 'mutation_applied' &&
      toolResult?.output !== undefined
    ) {
      return {
        type: 'tool_use',
        id: call.id,
        name: MUTATION_APPLIED_UI_NAME,
        input: toolResult.output,
      };
    }
    return {
      type: 'tool_use',
      id: call.id,
      name: call.name,
      input: call.args,
    };
  });
}

/** 与 OpenAI tool_call id 对齐，供 tool 角色消息回填 */
type ToolCall = { id: string; name: string; args: Record<string, unknown> };
type ResolvedToolCall = {
  call: ToolCall;
  tool?: AiToolDef;
};
const logger = new Logger('CoachOrchestrator');

function getModel(options?: CoachClientOptions) {
  return getCoachModelViaAdapter(options);
}

function getModelCandidates(options?: CoachClientOptions): string[] {
  const primary = getModel(options);

  const fallbacksRaw = process.env.OPENROUTER_FALLBACK_MODELS ?? '';
  const fallbacks = fallbacksRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // 去重且保证 primary 在第一位
  return [primary, ...fallbacks].filter((m, i, arr) => arr.indexOf(m) === i);
}

function isRateLimitError(err: unknown): boolean {
  const fields = unknownErrorFields(err);
  return (
    fields.status === 429 ||
    fields.code === 429 ||
    fields.error?.code === 429
  );
}

function headerValue(headers: unknown, name: string): string | null {
  const h = headers as { get?: (key: string) => unknown } | null;
  const value = h?.get?.(name);
  return typeof value === 'string' && value.trim() ? value : null;
}

function logUpstreamOpenError(args: {
  err: unknown;
  step: number;
  model: string;
  thinking: boolean;
}) {
  const fields = unknownErrorFields(args.err);
  const nested = fields.error;
  const provider = getCoachUpstreamProvider();
  const status = fields.status ?? 'unknown';
  const code = fields.code ?? nested?.code ?? 'unknown';
  const type = fields.type ?? nested?.type ?? 'unknown';
  const message = nested?.message ?? fields.message ?? String(args.err);
  const headers = fields.headers;
  logger.error(
    [
      '[AI][教练][upstream] 打开流失败',
      `服务商=${provider ?? 'none'}`,
      `baseURL=${getCoachBaseUrlForLog(provider)}`,
      `模型=${args.model}`,
      `thinking=${args.thinking ? '是' : 'no'}`,
      `步骤=${args.step}`,
      `status=${status}`,
      `code=${code}`,
      `type=${type}`,
      `requestId=${fields.requestID ?? 'none'}`,
      `deepseekTraceId=${headerValue(headers, 'x-ds-trace-id') ?? 'none'}`,
      `cloudfrontId=${headerValue(headers, 'x-amz-cf-id') ?? 'none'}`,
      `message="${String(message).replace(/\s+/g, ' ').trim()}"`,
    ].join(' '),
  );
}

function summarizeMessageForLog(message: ChatCompletionMessageParam) {
  const content = message.content;
  const extras = message as ChatCompletionMessageParam & {
    reasoning_content?: unknown;
    tool_calls?: Array<{
      id?: string;
      function?: { name?: string; arguments?: unknown };
    }>;
    tool_call_id?: unknown;
  };
  return {
    role: message.role,
    content:
      typeof content === 'string'
        ? previewTextForLog(content)
        : content === null || content === undefined
          ? null
          : previewTextForLog(content),
    reasoningChars:
      typeof extras.reasoning_content === 'string'
        ? extras.reasoning_content.length
        : undefined,
    toolCalls: Array.isArray(extras.tool_calls)
      ? extras.tool_calls.map((tc) => ({
          id: tc?.id,
          name: tc?.function?.name,
          args: previewTextForLog(tc?.function?.arguments, 500),
        }))
      : undefined,
    toolCallId:
      typeof extras.tool_call_id === 'string' ? extras.tool_call_id : undefined,
  };
}

function logUpstreamRequest(args: {
  step: number;
  model: string;
  thinking: boolean;
  messages: ChatCompletionMessageParam[];
  toolDefs: Array<{ function?: { name?: string } }>;
}) {
  const provider = getCoachUpstreamProvider();
  logger.log(
    [
      '[AI][教练][upstream] 请求摘要',
      `服务商=${provider ?? 'none'}`,
      `baseURL=${getCoachBaseUrlForLog(provider)}`,
      `模型=${args.model}`,
      `thinking=${args.thinking ? '是' : 'no'}`,
      `步骤=${args.step}`,
      `messages=${args.messages.length}`,
      `tools=${args.toolDefs.length}`,
      `toolNames=${args.toolDefs.map((t) => t.function?.name).join('|')}`,
      `payload=${safeJsonPreview(
        args.messages.map(summarizeMessageForLog),
        6000,
      )}`,
    ].join(' '),
  );
}

function shouldLogToolOutputs(): boolean {
  const raw = String(process.env.AI_LOG_TOOL_OUTPUTS ?? '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === '是' || raw === 'on';
}

function shouldLogToolDebug(): boolean {
  const raw = String(process.env.AI_COACH_DEBUG_TOOLS ?? '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === '是' || raw === 'on';
}

function shouldLogPlanDraftDebug(): boolean {
  const raw = String(process.env.AI_COACH_DEBUG_PLAN_DRAFT ?? '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === '是' || raw === 'on';
}

async function summarizeToolResultForModel(args: {
  tool: AiToolDef | undefined;
  ctx: AiToolContext;
  input: Record<string, unknown>;
  output: unknown;
}): Promise<unknown> {
  // 工具可以自定义给模型看的摘要，避免把大结果原样塞回上下文窗口。
  const { tool, ctx, input, output } = args;
  if (!tool?.summarizeForModel) return output;

  try {
    return await tool.summarizeForModel({
      ctx,
      input,
      output,
      maxChars: Math.max(500, Math.floor(tool.maxResultChars ?? 12_000)),
    } as AiToolModelSummaryArgs);
  } catch (err) {
    logger.warn(
      `[AI][教练][工具] 摘要失败 name=${tool.name} ${err instanceof Error ? err.message : String(err)}`,
    );
    return output;
  }
}

async function stringifyToolResultForModel(args: {
  tool: AiToolDef | undefined;
  ctx: AiToolContext;
  input: Record<string, unknown>;
  output: unknown;
}): Promise<string> {
  // OpenAI-compatible tool message 只能放字符串，这里统一处理 JSON 化、截断和不可序列化兜底。
  const { tool, ctx, input, output } = args;
  const maxChars = Math.max(500, Math.floor(tool?.maxResultChars ?? 12_000));
  const summarized = await summarizeToolResultForModel({
    tool,
    ctx,
    input,
    output,
  });

  try {
    const json = JSON.stringify(summarized);
    if (json.length <= maxChars) return json;

    return JSON.stringify({
      truncated: true,
      reason: 'tool_result_budget_exceeded',
      maxChars,
      originalChars: json.length,
      preview: json.slice(0, maxChars),
    });
  } catch (err) {
    return JSON.stringify({
      truncated: true,
      reason: 'tool_result_not_serializable',
      error: err instanceof Error ? err.message : String(err),
      preview: safeJsonPreview(summarized, Math.min(maxChars, 2_000)),
    });
  }
}

function partitionResolvedToolCalls(calls: ResolvedToolCall[]) {
  // 只有显式标记并发安全的相邻工具会合批并行；其余保持模型给出的顺序串行执行。
  const batches: Array<{
    isConcurrencySafe: boolean;
    items: ResolvedToolCall[];
  }> = [];

  for (const item of calls) {
    const isConcurrencySafe = item.tool
      ? (() => {
          try {
            return isAiToolConcurrencySafe(
              asRecordTool(item.tool),
              item.call.args,
            );
          } catch {
            return false;
          }
        })()
      : false;

    const previous = batches[batches.length - 1];
    if (isConcurrencySafe && previous?.isConcurrencySafe) {
      previous.items.push(item);
      continue;
    }

    batches.push({ isConcurrencySafe, items: [item] });
  }

  return batches;
}

async function executeResolvedToolCall(args: {
  item: ResolvedToolCall;
  ctx: AiToolContext;
}): Promise<{ name: string; output: unknown; ok: boolean }> {
  // 工具执行统一走：存在性校验 -> 入参校验 -> 权限校验 -> execute，错误也以工具结果回给模型。
  const { item, ctx } = args;
  const { call, tool } = item;

  if (!tool) {
    logger.warn(`[AI][教练][工具] 未知工具 name=${call.name}`);
    return {
      name: call.name,
      output: { error: `Unknown tool: ${call.name}` },
      ok: false,
    };
  }

  if (shouldLogToolDebug()) {
    const keys =
      call.args && typeof call.args === 'object' && !Array.isArray(call.args)
        ? Object.keys(call.args)
        : [];
    logger.warn(
      `[AI][教练][tool-debug] start name=${call.name} keys=${keys.join(',') || '(empty)'} argsPreview=${safeJsonPreview(call.args, 1600)}`,
    );
  }

  if (call.name === 'present_coach_plan_draft' && shouldLogPlanDraftDebug()) {
    const keys =
      call.args && typeof call.args === 'object' && !Array.isArray(call.args)
        ? Object.keys(call.args)
        : [];
    logger.warn(
      `[AI][教练][plan_draft][debug] before_validate keys=${keys.join(',') || '(empty)'} argsPreview=${safeJsonPreview(call.args, 1200)}`,
    );
  }

  const argsObj = call.args as Record<string, unknown>;
  const argsParseError =
    typeof argsObj[TOOL_ARGS_PARSE_ERROR_KEY] === 'string'
      ? argsObj[TOOL_ARGS_PARSE_ERROR_KEY]
      : undefined;
  const argsRawPreview =
    typeof argsObj[TOOL_ARGS_RAW_PREVIEW_KEY] === 'string'
      ? argsObj[TOOL_ARGS_RAW_PREVIEW_KEY]
      : undefined;
  if (argsParseError) {
    logger.warn(
      `[AI][教练][工具] 参数 JSON 解析失败 name=${call.name} ${argsParseError} rawPreview=${safeJsonPreview(argsRawPreview, 800)}`,
    );
    return {
      name: call.name,
      output: {
        error: argsParseError,
        code: 'INVALID_TOOL_ARGUMENTS_JSON',
        stage: 'parse_arguments',
        ...(argsRawPreview ? { rawPreview: argsRawPreview } : {}),
      },
      ok: false,
    };
  }

  if (
    call.name === 'present_coach_plan_draft' &&
    Object.keys(argsObj).length === 0
  ) {
    logger.warn(
      '[AI][教练][工具] 参数为空 name=present_coach_plan_draft expected=title,periodWeeks,workouts',
    );
    return {
      name: call.name,
      output: {
        error:
          'present_coach_plan_draft arguments were empty; retry with a complete JSON object containing title, periodWeeks, and workouts.',
        code: 'EMPTY_TOOL_ARGUMENTS',
        stage: 'parse_arguments',
      },
      ok: false,
    };
  }

  const recordTool = asRecordTool(tool);
  const validation = await validateAiToolInput(
    recordTool,
    ctx,
    argsObj,
  );
  if (validation.ok === false) {
    if (shouldLogToolDebug()) {
      logger.warn(
        `[AI][教练][tool-debug] validate_failed name=${call.name} code=${validation.code ?? 'none'} message=${validation.message} argsPreview=${safeJsonPreview(call.args, 1600)}`,
      );
    }
    if (call.name === 'present_coach_plan_draft' && shouldLogPlanDraftDebug()) {
      logger.warn(
        `[AI][教练][plan_draft][debug] validate_failed message=${validation.message} code=${validation.code ?? 'none'} argsPreview=${safeJsonPreview(call.args, 1200)}`,
      );
    }
    logger.warn(
      `[AI][教练][工具] 参数不合法 name=${call.name} ${validation.message}`,
    );
    return {
      name: call.name,
      output: {
        error: validation.message,
        code: validation.code,
        stage: 'validate_input',
      },
      ok: false,
    };
  }

  const permission = await checkAiToolPermissions(
    recordTool,
    ctx,
    argsObj,
  );
  if (permission.ok === false) {
    if (shouldLogToolDebug()) {
      logger.warn(
        `[AI][教练][tool-debug] permission_failed name=${call.name} code=${permission.code ?? 'none'} message=${permission.message} argsPreview=${safeJsonPreview(call.args, 1600)}`,
      );
    }
    logger.warn(
      `[AI][教练][工具] 无权限 name=${call.name} ${permission.message}`,
    );
    return {
      name: call.name,
      output: {
        error: permission.message,
        code: permission.code,
        stage: 'check_permissions',
      },
      ok: false,
    };
  }

  const tExec = Date.now();
  logger.debug(`[AI][教练][工具] 开始 name=${call.name} cost=${tool.cost}`);

  const execCtx: AiToolContext = {
    ...ctx,
    currentToolCallId: call.id,
  };

  try {
    const out = await recordTool.execute(execCtx, argsObj);
    const outChars = (() => {
      try {
        return JSON.stringify(out).length;
      } catch {
        return -1;
      }
    })();
    logger.debug(
      `[AI][教练][工具] 完成 name=${call.name} 耗时毫秒=${Date.now() - tExec} outChars=${outChars}`,
    );
    if (shouldLogToolOutputs()) {
      logger.debug(
        `[AI][教练][工具] 输出预览 name=${call.name} preview=${safeJsonPreview(out)}`,
      );
    }
    if (shouldLogToolDebug()) {
      logger.warn(
        `[AI][教练][tool-debug] success name=${call.name} outPreview=${safeJsonPreview(out, 2000)}`,
      );
    }
    return { name: call.name, output: out, ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (shouldLogToolDebug()) {
      logger.warn(
        `[AI][教练][tool-debug] execute_failed name=${call.name} message=${msg} argsPreview=${safeJsonPreview(call.args, 1600)}`,
      );
    }
    logger.warn(`[AI][教练][工具] 失败 name=${call.name} ${msg}`);
    return {
      name: call.name,
      output: { error: msg, stage: 'execute' },
      ok: false,
    };
  }
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const abortSignalCtor = AbortSignal as typeof AbortSignal & {
    any?: (items: AbortSignal[]) => AbortSignal;
  };
  if (typeof abortSignalCtor.any === 'function') {
    return abortSignalCtor.any(signals);
  }
  return signals[0];
}

function withTimeoutSignal(
  base: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; cancel: () => void } {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { signal: base, cancel: () => void 0 };
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort('timeout'), timeoutMs);
  const combined = anySignal([base, ac.signal]);
  return { signal: combined, cancel: () => clearTimeout(t) };
}

/**
 * 针对 429/上游抖动做简单重试（指数退避 + jitter）
 * - 仅在 RateLimitError 时重试
 * - 避免 free 模型的临时限流直接把请求打挂
 */
async function retryOn429<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const maxRetries = Number(process.env.OPENROUTER_RETRY_MAX || 2);
  const baseMs = Number(process.env.OPENROUTER_RETRY_BASE_MS || 800);
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (e) {
      if (!isRateLimitError(e) || attempt >= maxRetries) throw e;
      const backoff = Math.min(baseMs * 2 ** attempt, 4000);
      const jitter = Math.floor(Math.random() * 250);
      logger.warn(
        `[AI][教练][重试] ${label} 上游限流(429) attempt=${attempt + 1}/${maxRetries} sleepMs=${backoff + jitter}`,
      );
      await sleep(backoff + jitter);
      attempt += 1;
    }
  }
}

/**
 * 创建 AI Coach 的 OpenAI 客户端（兼容 OpenRouter）
 *
 * 约定：
 * - 通过 `OPENROUTER_API_KEY` / `OPENROUTER_BASE_URL` 指向 OpenRouter
 * - 推荐携带 `HTTP-Referer` 与 `X-Title`，用于 OpenRouter 侧识别与统计
 */
export function createCoachClient(options?: CoachClientOptions): OpenAI {
  // 迁移为可插拔上游：openrouter / aliyun(dashscope) / deepseek
  // 保留原导出名，避免上层大范围重构
  return createCoachClientViaAdapter(options);
}

function getReasoningEffort(): 'low' | 'medium' | 'high' | undefined {
  const raw = String(process.env.AI_COACH_REASONING_EFFORT ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
  return undefined;
}

function buildThinkingRequestExtras(args: {
  thinking: boolean;
  provider: ReturnType<typeof getCoachUpstreamProvider>;
}) {
  // 不同上游对“思考模式”的开关字段不完全一致，这里集中生成请求扩展字段。
  if (!args.thinking) {
    if (args.provider === 'deepseek') {
      return {
        extra_body: {
          thinking: { type: 'disabled' },
        },
      };
    }
    return {};
  }
  const effort = getReasoningEffort();
  return {
    ...(effort ? { reasoning_effort: effort } : {}),
    extra_body: {
      thinking: { type: 'enabled' },
    },
  };
}

function resolveStepTimeoutMs(
  provider: ReturnType<typeof getCoachUpstreamProvider>,
): number {
  // 每一轮 agent 请求都有独立超时，避免工具循环某一步卡死导致整条 SSE 永不结束。
  const common = Number(process.env.AI_COACH_STEP_TIMEOUT_MS || 0);
  if (Number.isFinite(common) && common > 0) return common;

  if (provider === 'deepseek') {
    const deepseek = Number(process.env.DEEPSEEK_STEP_TIMEOUT_MS || 60_000);
    if (Number.isFinite(deepseek) && deepseek > 0) return deepseek;
    return 60_000;
  }

  if (provider === 'aliyun') {
    const aliyun = Number(process.env.ALIYUN_STEP_TIMEOUT_MS || 30_000);
    if (Number.isFinite(aliyun) && aliyun > 0) return aliyun;
    return 30_000;
  }

  const openrouter = Number(process.env.OPENROUTER_STEP_TIMEOUT_MS || 20_000);
  if (Number.isFinite(openrouter) && openrouter > 0) return openrouter;
  return 20_000;
}

/**
 * AI Coach：与 Claude Code `queryLoop` 同构的 **agent 循环**
 * ——每轮带 tools 流式采样，模型自行产出 tool_calls 或正文；有工具则服务端执行并写回消息后再请求，直到无工具调用。
 */
export async function* streamCoachAnswer(args: {
  client: OpenAI;
  tools: AiToolDef[];
  ctx: AiToolContext;
  messages: ChatCompletionMessageParam[];
  activeSkill?: ActiveCoachSkill | null;
  thinking?: boolean;
}): AsyncGenerator<CoachQueryYield, void, undefined> {
  const { client, tools, ctx, activeSkill } = args;
  const t0 = Date.now();
  const thinking = args.thinking === true;
  const clock = await resolveAthleteClock({
    userService: ctx.userService,
    userId: ctx.session?.user?.id,
  });
  const provider = getCoachUpstreamProvider();
  const models = getModelCandidates({ thinking });
  const thinkingRequestExtras = buildThinkingRequestExtras({
    thinking,
    provider,
  });
  const stepTimeoutMs = resolveStepTimeoutMs(provider);
  const maxSteps = Math.max(
    1,
    Number(process.env.AI_COACH_MAX_AGENT_STEPS ?? 16),
  );
  let currentActiveSkill = activeSkill;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: buildCoachSystemPrompt(ctx.lang, currentActiveSkill, clock),
    },
    ...args.messages,
  ];

  logger.log(
    `[AI][教练][agent] 开始 服务商=${provider ?? 'none'} models=${models.join('|')} 语言=${ctx.lang} historyMessages=${args.messages.length} maxSteps=${maxSteps} stepTimeoutMs=${stepTimeoutMs} 技能=${activeSkill?.name ?? 'none'} thinking=${thinking ? 'enabled' : 'disabled'}`,
  );

  for (let step = 0; step < maxSteps; step++) {
    const stepStartedAt = Date.now();
    const orderedTools = sortToolsBySkillPreference(tools, currentActiveSkill);
    const toolDefs = orderedTools.map((t) => ({
      type: 'function' as const,
      function: {
        name: toProviderToolName(t.name),
        description: t.description,
        parameters: t.parameters,
      },
    }));
    messages[0] = {
      role: 'system',
      content: buildCoachSystemPrompt(ctx.lang, currentActiveSkill, clock),
    };
    const contextCompaction = compactMessagesForBudget({
      model: models[0],
      messages,
      tools: orderedTools,
    });
    if (contextCompaction.compressed) {
      messages.splice(0, messages.length, ...contextCompaction.messages);
      logger.log(
        `[AI][教练][context] 步骤=${step} compressed=是 usedBefore=${contextCompaction.before.usedInputTokens} usedAfter=${contextCompaction.after.usedInputTokens} compactedMessages=${contextCompaction.compactedMessages}`,
      );
    }
    const contextWindow = contextCompaction.compressed
      ? contextCompaction.after
      : buildContextWindowSnapshot({
          model: models[0],
          messages,
          tools: orderedTools,
        });

    yield {
      type: 'system',
      subtype: 'status',
      status: 'running',
      step: step + 1,
    };
    yield {
      type: 'system',
      subtype: 'context_window',
      step: step + 1,
      maxContextTokens: contextWindow.maxContextTokens,
      reservedOutputTokens: contextWindow.reservedOutputTokens,
      inputBudgetTokens: contextWindow.inputBudgetTokens,
      usedInputTokens: contextWindow.usedInputTokens,
      remainingInputTokens: contextWindow.remainingInputTokens,
      compressionThresholdTokens: contextWindow.compressionThresholdTokens,
      usageRatio: contextWindow.usageRatio,
      estimator: contextWindow.estimator,
      compressed: contextCompaction.compressed,
      compactedMessages: contextCompaction.compactedMessages,
    };
    yield {
      type: 'stream_event',
      event: { type: 'phase', phase: 'model' },
    };
    yield {
      type: 'system',
      subtype: 'status',
      status: 'model',
      step: step + 1,
    };

    let completion: AsyncIterable<unknown> | null = null;
    let openErr: unknown = null;
    let usedModel = models[0];

    for (const m of models) {
      let cancelTimeout = () => void 0;
      const openStartedAt = Date.now();
      try {
        const { signal: timedSignal, cancel } = withTimeoutSignal(
          ctx.signal,
          stepTimeoutMs,
        );
        cancelTimeout = cancel;
        logUpstreamRequest({
          step,
          model: m,
          thinking,
          messages,
          toolDefs,
        });
        completion = await retryOn429(
          () =>
            client.chat.completions.create(
              {
                model: m,
                stream: true,
                stream_options: { include_usage: true },
                tools: toolDefs,
                tool_choice: 'auto',
                messages,
                temperature: 0.35,
                ...thinkingRequestExtras,
              },
              { signal: timedSignal },
            ),
          `coachAgentStep${step}`,
        );
        cancelTimeout();
        openErr = null;
        usedModel = m;
        logger.log(
          `[AI][教练][upstream] 打开流成功 服务商=${provider ?? 'none'} 模型=${m} 步骤=${step} openElapsedMs=${Date.now() - openStartedAt}`,
        );
        break;
      } catch (e) {
        cancelTimeout();
        openErr = e;
        logUpstreamOpenError({
          err: e,
          step,
          model: m,
          thinking,
        });
        if (isRateLimitError(e)) {
          logger.warn(`[AI][教练][agent] 打开流 429 步骤=${step} 模型=${m}`);
          continue;
        }
        throw e;
      }
    }
    if (openErr || !completion) throw openErr ?? new Error('coach stream open');

    const toolAcc = createToolCallAccumulator();
    let contentBuf = '';
    let reasoningBuf = '';
    let lastUsage: unknown = undefined;
    let finishReason: string | null = null;
    let chunkCount = 0;
    let firstChunkAt: number | null = null;
    let firstTextDeltaAt: number | null = null;
    const streamStartedAt = Date.now();
    const waitFirstChunkTimer = setInterval(() => {
      if (firstChunkAt !== null) return;
      logger.log(
        `[AI][教练][upstream] 等待首包中 服务商=${provider ?? 'none'} 模型=${usedModel} 步骤=${step} waitMs=${Date.now() - streamStartedAt}`,
      );
    }, 10_000);

    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      for await (const chunk of completion) {
        chunkCount += 1;
        if (firstChunkAt === null) {
          firstChunkAt = Date.now();
          const firstChunkFromAgentStartMs = firstChunkAt - t0;
          const firstChunkFromStepStartMs = firstChunkAt - stepStartedAt;
          const firstChunkFromOpenMs = firstChunkAt - streamStartedAt;
          logger.log(
            `[AI][教练][upstream] 收到首包 服务商=${provider ?? 'none'} 模型=${usedModel} 步骤=${step} firstChunkFromAgentStartMs=${firstChunkFromAgentStartMs} firstChunkFromStepStartMs=${firstChunkFromStepStartMs} firstChunkFromOpenMs=${firstChunkFromOpenMs}`,
          );
        }
        const ch = chunk as {
          choices?: Array<{
            delta?: {
              content?: string | null;
              reasoning_content?: string | null;
            };
            finish_reason?: string | null;
          }>;
          usage?: unknown;
        };
        const u = ch.usage;
        if (u !== undefined) lastUsage = u;
        const fr = ch.choices?.[0]?.finish_reason;
        if (fr) finishReason = fr;

        feedToolCallStreamDelta(toolAcc, chunk);
        for (const ev of mapOpenAIChunkToCoachYields(chunk)) {
          yield ev;
        }
        const d = ch.choices?.[0]?.delta?.content;
        if (typeof d === 'string' && d.length > 0) {
          contentBuf += d;
          if (firstTextDeltaAt === null) {
            firstTextDeltaAt = Date.now();
            const firstTextDeltaFromAgentStartMs = firstTextDeltaAt - t0;
            const firstTextDeltaFromStepStartMs = firstTextDeltaAt - stepStartedAt;
            const firstTextDeltaFromOpenMs = firstTextDeltaAt - streamStartedAt;
            logger.log(
              `[AI][教练][upstream] 收到首个文本增量 服务商=${provider ?? 'none'} 模型=${usedModel} 步骤=${step} firstTextDeltaFromAgentStartMs=${firstTextDeltaFromAgentStartMs} firstTextDeltaFromStepStartMs=${firstTextDeltaFromStepStartMs} firstTextDeltaFromOpenMs=${firstTextDeltaFromOpenMs}`,
            );
          }
        }
        const reasoning = ch.choices?.[0]?.delta?.reasoning_content;
        if (typeof reasoning === 'string' && reasoning.length > 0) {
          reasoningBuf += reasoning;
        }
      }
    } finally {
      clearInterval(waitFirstChunkTimer);
    }
    logger.log(
      `[AI][教练][upstream] 流读取完成 服务商=${provider ?? 'none'} 模型=${usedModel} 步骤=${step} chunkCount=${chunkCount} finishReason=${finishReason ?? 'none'} textChars=${contentBuf.length} reasoningChars=${reasoningBuf.length} 耗时毫秒=${Date.now() - streamStartedAt}`,
    );

    const { apiToolCalls, coachCalls } = finalizeStreamedToolCalls(toolAcc);

    if (finishReason === 'tool_calls' && coachCalls.length === 0) {
      throw new Error(
        'Upstream finished with tool_calls but no tool invocations were parsed',
      );
    }

    if (coachCalls.length > 0) {
      yield {
        type: 'tool_progress',
        tool_name: 'batch',
        status: 'issued',
        tool_names: coachCalls.map((c) => c.name),
      };
      yield {
        type: 'stream_event',
        event: { type: 'phase', phase: 'tool_run' },
      };
      yield {
        type: 'system',
        subtype: 'status',
        status: 'tool_run',
        step: step + 1,
      };

      const resolvedCalls = coachCalls.map((call) => ({
        call,
        tool: findAiToolByName(orderedTools, call.name),
      }));

      const toolResults: Array<{
        name: string;
        output: unknown;
        content: string;
      }> = [];
      let planDraftPayloadError:
        | {
            toolName: string;
            error?: string;
            code?: string;
            stage?: string | null;
          }
        | undefined;
      for (const batch of partitionResolvedToolCalls(resolvedCalls)) {
        for (const item of batch.items) {
          yield {
            type: 'tool_progress',
            tool_name: item.call.name,
            status: 'start',
          };
        }

        const batchResults = batch.isConcurrencySafe
          ? await Promise.all(
              batch.items.map((item) => executeResolvedToolCall({ item, ctx })),
            )
          : await (async () => {
              const results: Array<{
                name: string;
                output: unknown;
                ok: boolean;
              }> = [];
              for (const item of batch.items) {
                results.push(await executeResolvedToolCall({ item, ctx }));
              }
              return results;
            })();

        for (const [index, result] of batchResults.entries()) {
          const resolved = batch.items[index];
          const outputObj =
            result.output && typeof result.output === 'object'
              ? (result.output as Record<string, unknown>)
              : null;
          const stage =
            typeof outputObj?.stage === 'string' ? outputObj.stage : null;
          const code =
            typeof outputObj?.code === 'string' ? outputObj.code : undefined;
          const error =
            typeof outputObj?.error === 'string' ? outputObj.error : undefined;

          // 兜底：计划草案投递工具若入参解析/校验失败，先把错误回给模型自修复；没有下一步预算时再终止。
          if (
            result.ok === false &&
            result.name === 'present_coach_plan_draft' &&
            (stage === 'validate_input' || stage === 'parse_arguments')
          ) {
            const rawArgs = resolved?.call?.args;
            const isEmptyArgs =
              rawArgs != null &&
              typeof rawArgs === 'object' &&
              !Array.isArray(rawArgs) &&
              Object.keys(rawArgs).length === 0;
            if (shouldLogPlanDraftDebug()) {
              logger.warn(
                `[AI][教练][plan_draft][debug] payload_failed allow_retry=${step + 1 < maxSteps ? 'yes' : 'no'} emptyArgs=${isEmptyArgs ? 'yes' : 'no'} stage=${stage ?? 'none'} code=${code ?? 'none'} error=${error ?? 'unknown'} argsPreview=${safeJsonPreview(rawArgs, 1200)}`,
              );
            }
            // 先把具体错误回传给模型，让它按工具结果修复；只有已经没有下一步预算时才终止。
            planDraftPayloadError = {
              toolName: result.name,
              error,
              code,
              stage,
            };
          }

          const content = await stringifyToolResultForModel({
            tool: resolved?.tool,
            ctx,
            input: resolved?.call.args ?? {},
            output: result.output,
          });

          if (resolved?.tool?.name === 'skill.activate') {
            const activated = asRecord(result.output);
            const skill = asRecord(activated?.skill);
            const activatedSkillName =
              typeof skill?.name === 'string' ? skill.name : undefined;
            const activatedSkill = getCoachSkillByName(activatedSkillName);
            if (activatedSkill) {
              currentActiveSkill = activatedSkill;
              logger.log(
                `[AI][教练][skill] 步骤=${step} activated=${activatedSkill.name} by=tool`,
              );
            }
          }

          toolResults.push({
            name: result.name,
            output: result.output,
            content,
          });
          yield {
            type: 'tool_progress',
            tool_name: result.name,
            status: 'end',
            ok: result.ok,
          };
        }

        if (planDraftPayloadError && step + 1 >= maxSteps) {
          break;
        }
      }

      if (planDraftPayloadError && step + 1 >= maxSteps) {
        logger.warn(
          `[AI][教练][工具兜底] 步骤=${step} tool=${planDraftPayloadError.toolName} stage=${planDraftPayloadError.stage ?? 'unknown'} code=${planDraftPayloadError.code ?? 'unknown'} error=${planDraftPayloadError.error ?? 'unknown'}`,
        );
        yield {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          error_code: 'invalid_plan_draft_payload',
          result:
            '计划草案生成失败：草案参数不完整。请重试一次；若仍失败，请缩短问题或分步生成。',
        };
        return;
      }

      const pendingQuestion = toolResults.find(
        (result) =>
          result.name === 'ask_user_question' &&
          (result.output as { kind?: unknown })?.kind === 'ask_user_question',
      );
      if (pendingQuestion) {
        const output = pendingQuestion.output as {
          questions?: Array<{
            id: string;
            header: string;
            question: string;
            options: Array<{
              value: string;
              label: string;
              description: string;
              preview?: string;
            }>;
            multiSelect?: boolean;
          }>;
          metadata?: {
            source?: string;
            skill?: string;
          };
        };
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'ask_user_question',
                name: 'AskUserQuestion',
                input: {
                  questions: Array.isArray(output.questions)
                    ? output.questions
                    : [],
                  metadata: output.metadata,
                },
              },
            ],
          },
        };
        yield {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: contentBuf || '',
          usage: lastUsage,
        };
        logger.log(
          `[AI][教练][question] 步骤=${step} emitted=${output.questions?.length ?? 0} 来源=${output.metadata?.source ?? 'unknown'}`,
        );
        return;
      }

      const pendingPlanDraft = toolResults.find(
        (result) =>
          result.name === 'present_coach_plan_draft' &&
          (result.output as { kind?: unknown })?.kind === 'coach_plan_draft',
      );
      if (pendingPlanDraft) {
        const output = pendingPlanDraft.output as {
          title: string;
          description?: string;
          periodWeeks: number;
          workouts: Array<{
            weekIndex: number;
            dayIndex: number;
            sessionIndex?: number;
            text: string;
            notes?: string;
            name?: string;
            sportType?: string;
          }>;
        };
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'present_coach_plan_draft',
                name: 'PresentCoachPlanDraft',
                input: {
                  title: output.title,
                  description: output.description,
                  periodWeeks: output.periodWeeks,
                  workouts: Array.isArray(output.workouts)
                    ? output.workouts
                    : [],
                },
              },
            ],
          },
        };
        yield {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: contentBuf || '',
          usage: lastUsage,
        };
        logger.log(
          `[AI][教练][plan_draft] 步骤=${step} workouts=${output.workouts?.length ?? 0}`,
        );
        return;
      }

      const pendingWorkoutAdjustmentDraft = toolResults.find(
        (result) =>
          result.name === 'present_plan_workout_adjustment_draft' &&
          (result.output as { kind?: unknown })?.kind ===
            'plan_workout_adjustment_draft',
      );
      if (pendingWorkoutAdjustmentDraft) {
        const output = pendingWorkoutAdjustmentDraft.output as {
          planId: string;
          workoutId: string;
          title: string;
          reason: string;
          before: unknown;
          after: unknown;
          changes: unknown[];
        };
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'present_plan_workout_adjustment_draft',
                name: 'PresentPlanWorkoutAdjustmentDraft',
                input: {
                  planId: output.planId,
                  workoutId: output.workoutId,
                  title: output.title,
                  reason: output.reason,
                  before: output.before,
                  after: output.after,
                  changes: Array.isArray(output.changes) ? output.changes : [],
                },
              },
            ],
          },
        };
        yield {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: contentBuf || '',
          usage: lastUsage,
        };
        logger.log(
          `[AI][教练][workout_adjustment_draft] 步骤=${step} planId=${output.planId} workoutId=${output.workoutId}`,
        );
        return;
      }

      yield {
        type: 'tool_progress',
        tool_name: 'batch',
        status: 'done',
        result_count: toolResults.length,
      };

      messages.push({
        role: 'assistant',
        content: contentBuf || null,
        tool_calls: apiToolCalls,
        ...(reasoningBuf ? { reasoning_content: reasoningBuf } : {}),
      });
      yield {
        type: 'assistant',
        message: {
          content: buildCoachUiCardToolUseBlocks({
            tools: orderedTools,
            coachCalls,
            toolResults,
          }) as CoachAssistantContentBlock[],
          ...(reasoningBuf ? { reasoning_content: reasoningBuf } : {}),
        },
      };
      for (let i = 0; i < coachCalls.length; i++) {
        messages.push({
          role: 'tool',
          tool_call_id: coachCalls[i].id,
          content: toolResults[i]?.content ?? 'null',
        });
      }
      yield {
        type: 'user',
        message: {
          content: coachCalls.map((call, index) => ({
            type: 'tool_result',
            tool_use_id: call.id,
            content: toolResults[index]?.content ?? 'null',
          })),
        },
      };

      logger.debug(
        `[AI][教练][agent] 步骤=${step} 工具轮结束 模型=${usedModel} tools=${coachCalls.length} 耗时毫秒=${Date.now() - t0}`,
      );
      continue;
    }

    yield {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: contentBuf || '',
      usage: lastUsage,
    };
    logger.log(
      `[AI][教练][agent] 结束 步骤=${step} 模型=${usedModel} 耗时毫秒=${Date.now() - t0}`,
    );
    return;
  }

  throw new Error(
    `AI_COACH_MAX_AGENT_STEPS (${maxSteps}) exceeded — agent loop stopped.`,
  );
}
