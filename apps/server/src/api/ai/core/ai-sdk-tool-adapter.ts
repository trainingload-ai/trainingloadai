import {
  jsonSchema,
  type Tool,
  type ToolExecutionOptions,
  type ToolSet,
} from 'ai';
import { HttpException, Logger } from '@nestjs/common';
import {
  checkAiToolActiveSkill,
  checkAiToolPermissions,
  isAiToolConcurrencySafe,
  toProviderToolName,
  validateAiToolInput,
  type AiToolContext,
  type AiToolCheckError,
  type AiToolDef,
  type AiToolModelSummaryArgs,
  asRecordTool,
} from './tool.types';
import { safeJsonPreview } from './safe-json-preview';
import { COACH_MUTATION_ACTIVITY_PREFIX, coachMutationInvocationKey } from './coach-mutation-receipt';
import type { CoachActivityEvent } from '@shared/ai-coach-run-contract';
import { getCoachSkillByName } from './skill.registry';
import { toolSchemaValidator } from './tool-input-validation';
import { planPhaseProgress } from './tools/plan-draft-phase-progress';

// Resolve only catalog identities. Model-provided reasons/prompts stay private.
function skillIdentity(toolName: string, input: Record<string, unknown>) {
  if (toolName !== 'skill.activate' || typeof input.name !== 'string')
    return {};
  const skill = getCoachSkillByName(input.name);
  return skill ? { skillName: skill.name } : {};
}

const logger = new Logger('CoachAiSdkTools');

/** UI 卡片类工具：校验失败时需要完整上下文便于排查模型输出。 */
const UI_SURFACE_TOOL_NAMES = new Set([
  'ask_user_question',
  'plan_stage_phase',
  'present_coach_plan_draft',
  'present_plan_workout_adjustment_draft',
  'present_training_visualization',
]);

const UI_SURFACE_VALIDATION_LOG_PREVIEW_CHARS = 8_000;
const AUDITED_PLAN_TOOLS = new Set([
  'plan_suitability_assess',
  'plan_stage_phase',
  'present_coach_plan_draft',
  'present_plan_workout_adjustment_draft',
  'present_independent_workout_draft',
]);

export function isAuditedPlanTool(toolName: string): boolean {
  return AUDITED_PLAN_TOOLS.has(toolName);
}

export async function recordPlanToolValidationRejection(args: {
  ctx: AiToolContext;
  toolCallId: string;
  toolName: string;
  candidate: unknown;
  validation: AiToolCheckError;
  stage: 'parse_arguments' | 'validate_input';
}) {
  const { ctx, toolCallId, toolName, candidate, validation, stage } = args;
  if (!isAuditedPlanTool(toolName)) return;
  const code = validation.code ?? 'INVALID_INPUT';
  await ctx.onPlanValidationRejected?.({
    toolCallId,
    toolName,
    stage,
    candidate,
    code,
    message: validation.message,
    ...(validation.modelRepair && { modelRepair: validation.modelRepair }),
    feedback: validation.feedback,
    diagnostics: validation.diagnostics ?? validation.issues,
  });
  logger.warn(
    `Plan candidate rejected tool=${toolName} toolCall=${toolCallId} stage=${stage} code=${code}`,
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

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function previewToolInputForLog(
  providerToolName: string,
  input: Record<string, unknown>,
  maxChars: number,
): string {
  return providerToolName === 'ask_user_question' ||
    isAuditedPlanTool(providerToolName)
    ? '[omitted]'
    : safeJsonPreview(input, maxChars);
}

function logUiSurfaceValidationFailure(args: {
  providerToolName: string;
  validation: { message: string; code?: string };
  input: Record<string, unknown>;
}) {
  const { providerToolName, validation, input } = args;
  const argsPreview = previewToolInputForLog(
    providerToolName,
    input,
    UI_SURFACE_VALIDATION_LOG_PREVIEW_CHARS,
  );
  const questionCount = Array.isArray(input.questions)
    ? input.questions.length
    : undefined;
  logger.warn(
    `[AI][coach][tool] Invalid input name=${providerToolName} ${validation.message} code=${validation.code ?? 'none'} keys=${Object.keys(input).join(',') || '(empty)'}${questionCount !== undefined ? ` questionCount=${questionCount}` : ''} argsPreview=${argsPreview}`,
  );
}

async function summarizeToolResultForModel(args: {
  tool: AiToolDef | undefined;
  ctx: AiToolContext;
  input: Record<string, unknown>;
  output: unknown;
}): Promise<unknown> {
  const { tool, ctx, input, output } = args;
  if (output && typeof output === 'object' && 'error' in output) return output;
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

function clipCodePointSafe(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const suffix = `... [truncated ${text.length} chars]`;
  const keep = Math.max(0, maxChars - suffix.length);
  if (keep === 0) return suffix.slice(0, maxChars);
  let slice = text.slice(0, keep);
  const last = slice.charCodeAt(slice.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    slice = slice.slice(0, -1);
  }
  return `${slice}${suffix}`;
}

function compactValueForBudget(
  value: unknown,
  limits: { maxString: number; maxArray: number; maxDepth: number },
  depth = 0,
): unknown {
  if (
    value == null ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }
  if (typeof value === 'string') {
    return clipCodePointSafe(value, limits.maxString);
  }
  if (Array.isArray(value)) {
    if (depth >= limits.maxDepth) {
      return { _omittedArrayLength: value.length };
    }
    if (value.length <= limits.maxArray) {
      return value.map((item) =>
        compactValueForBudget(item, limits, depth + 1),
      );
    }
    const headCount = Math.max(1, Math.ceil(limits.maxArray / 2));
    const tailCount = Math.max(0, limits.maxArray - headCount);
    const omitted = value.length - headCount - tailCount;
    return [
      ...value
        .slice(0, headCount)
        .map((item) => compactValueForBudget(item, limits, depth + 1)),
      { _omittedItems: omitted },
      ...(tailCount > 0
        ? value
            .slice(-tailCount)
            .map((item) => compactValueForBudget(item, limits, depth + 1))
        : []),
    ];
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (depth >= limits.maxDepth) {
      return { _omittedKeys: entries.length };
    }
    const compacted: Record<string, unknown> = {};
    for (const [key, entry] of entries) {
      if (entry === undefined) continue;
      compacted[key] = compactValueForBudget(entry, limits, depth + 1);
    }
    return compacted;
  }
  return String(value);
}

function buildStructuredBudgetEnvelope(
  value: unknown,
  maxChars: number,
  originalChars: number,
): string {
  const passes = [
    { maxString: 2_000, maxArray: 20, maxDepth: 6 },
    { maxString: 600, maxArray: 10, maxDepth: 5 },
    { maxString: 240, maxArray: 6, maxDepth: 4 },
    { maxString: 100, maxArray: 3, maxDepth: 3 },
    { maxString: 48, maxArray: 2, maxDepth: 2 },
  ];
  let lastSummary: unknown = null;
  for (const limits of passes) {
    const summary = compactValueForBudget(value, limits);
    lastSummary = summary;
    const envelope = JSON.stringify({
      truncated: true,
      reason: 'tool_result_budget_exceeded',
      maxChars,
      originalChars,
      summary,
    });
    if (envelope.length <= maxChars) return envelope;
  }

  // Wide object fallback: keep compact scalar fields first so late metadata stays visible.
  if (
    lastSummary &&
    typeof lastSummary === 'object' &&
    !Array.isArray(lastSummary)
  ) {
    const entries = Object.entries(lastSummary as Record<string, unknown>);
    const ordered = [...entries].sort(([, a], [, b]) => {
      const lenA = JSON.stringify(a)?.length ?? 0;
      const lenB = JSON.stringify(b)?.length ?? 0;
      return lenA - lenB;
    });
    const kept: Record<string, unknown> = {};
    let omitted = 0;
    for (const [key, entry] of ordered) {
      const candidate = { ...kept, [key]: entry };
      const remaining = entries.length - Object.keys(candidate).length;
      const envelope = JSON.stringify({
        truncated: true,
        reason: 'tool_result_budget_exceeded',
        maxChars,
        originalChars,
        summary:
          remaining > 0 ? { ...candidate, _omittedKeys: remaining } : candidate,
      });
      if (envelope.length <= maxChars) {
        kept[key] = entry;
      } else {
        omitted++;
      }
    }
    return JSON.stringify({
      truncated: true,
      reason: 'tool_result_budget_exceeded',
      maxChars,
      originalChars,
      summary: omitted > 0 ? { ...kept, _omittedKeys: omitted } : kept,
    });
  }

  return JSON.stringify({
    truncated: true,
    reason: 'tool_result_budget_exceeded',
    maxChars,
    originalChars,
    summary: clipCodePointSafe(
      String(lastSummary ?? ''),
      Math.max(64, maxChars - 160),
    ),
  });
}

export async function stringifyAiSdkToolResultForModel(args: {
  tool: AiToolDef | undefined;
  ctx: AiToolContext;
  input: Record<string, unknown>;
  output: unknown;
}): Promise<string> {
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

    return buildStructuredBudgetEnvelope(summarized, maxChars, json.length);
  } catch (err) {
    return JSON.stringify({
      truncated: true,
      reason: 'tool_result_not_serializable',
      error: err instanceof Error ? err.message : String(err),
      preview: safeJsonPreview(summarized, Math.min(maxChars, 2_000)),
    });
  }
}

async function executeCoachTool(args: {
  tool: AiToolDef;
  ctx: AiToolContext;
  input: Record<string, unknown>;
  rawInput: unknown;
  event: CoachActivityEvent & { toolCallId: string };
  beforeRunning: () => Promise<void>;
  onReplay: () => void;
  providerToolName: string;
}): Promise<unknown> {
  const { tool, ctx, input, rawInput, event, beforeRunning, onReplay, providerToolName } = args;
  const { toolCallId } = event;

  const skill = checkAiToolActiveSkill(tool, ctx);
  if (skill.ok === false) {
    return {
      error: skill.message,
      code: skill.code,
      stage: 'check_permissions',
    };
  }

  if (shouldLogToolDebug()) {
    logger.warn(
      `[AI][coach][tool-debug] start name=${providerToolName} keys=${Object.keys(input).join(',') || '(empty)'} argsPreview=${previewToolInputForLog(providerToolName, input, 1600)}`,
    );
  }

  if (
    providerToolName === 'present_coach_plan_draft' &&
    shouldLogPlanDraftDebug()
  ) {
    logger.warn(
      `Validating plan draft keys=${Object.keys(input).join(',') || '(empty)'}`,
    );
  }

  if (
    providerToolName === 'present_coach_plan_draft' &&
    Object.keys(input).length === 0
  ) {
    const invalidShape =
      rawInput === null ||
      Array.isArray(rawInput) ||
      typeof rawInput !== 'object';
    const stage = invalidShape ? 'validate_input' : 'parse_arguments';
    const code = invalidShape ? 'INVALID_INPUT' : 'EMPTY_TOOL_ARGUMENTS';
    const message =
      'Provide a complete plan draft JSON object with title, periodWeeks and workouts.';
    await recordPlanToolValidationRejection({
      ctx,
      toolCallId,
      toolName: providerToolName,
      candidate: rawInput ?? null,
      stage,
      validation: { ok: false, code, message },
    });
    logger.warn(
      '[AI][教练][工具] 参数为空 name=present_coach_plan_draft expected=title,periodWeeks,workouts',
    );
    return { error: message, code, stage };
  }

  const recordTool = asRecordTool(tool);
  const validation = await validateAiToolInput(recordTool, ctx, input);
  if (validation.ok === false) {
    await recordPlanToolValidationRejection({
      ctx,
      toolCallId,
      toolName: providerToolName,
      candidate: rawInput,
      validation,
      stage: 'validate_input',
    });
    if (shouldLogToolDebug() && !isAuditedPlanTool(providerToolName)) {
      logger.warn(
        `[AI][coach][tool-debug] validate_failed name=${providerToolName} code=${validation.code ?? 'none'} message=${validation.message} argsPreview=${previewToolInputForLog(providerToolName, input, 1600)}`,
      );
    }
    if (
      providerToolName === 'present_coach_plan_draft' &&
      shouldLogPlanDraftDebug()
    ) {
      logger.warn(
        `Plan draft validation failed code=${validation.code ?? 'none'}`,
      );
    }
    if (
      !isAuditedPlanTool(providerToolName) &&
      UI_SURFACE_TOOL_NAMES.has(providerToolName)
    ) {
      logUiSurfaceValidationFailure({
        providerToolName,
        validation,
        input,
      });
    } else if (!isAuditedPlanTool(providerToolName)) {
      logger.warn(
        `[AI][教练][工具] 参数不合法 name=${providerToolName} ${validation.message}`,
      );
    }
    return {
      error: validation.modelRepair ?? validation.message,
      code: validation.code,
      stage: 'validate_input',
      ...(validation.issues ? { issues: validation.issues } : {}),
      ...(validation.feedback && !validation.modelRepair
        ? { feedback: validation.feedback }
        : {}),
    };
  }

  const permission = await checkAiToolPermissions(recordTool, ctx, input);
  if (permission.ok === false) {
    if (shouldLogToolDebug()) {
      logger.warn(
        `[AI][教练][tool-debug] permission_failed name=${providerToolName} code=${permission.code ?? 'none'} message=${permission.message} argsPreview=${safeJsonPreview(input, 1600)}`,
      );
    }
    logger.warn(
      `[AI][教练][工具] 无权限 name=${providerToolName} ${permission.message}`,
    );
    return {
      error: permission.message,
      code: permission.code,
      stage: 'check_permissions',
    };
  }

  const tExec = Date.now();
  const planDraftMetrics = (() => {
    if (providerToolName !== 'present_coach_plan_draft') return '';
    const templates = Array.isArray(input.sessionTemplates)
      ? input.sessionTemplates
      : [];
    const workouts = Array.isArray(input.workouts) ? input.workouts : [];
    const expandedOccurrences = workouts.reduce((total, raw) => {
      const workout = asRecord(raw);
      return (
        total +
        (Array.isArray(workout.weekIndexes) ? workout.weekIndexes.length : 1)
      );
    }, 0);
    let inputChars = -1;
    try {
      inputChars = JSON.stringify(input).length;
    } catch {
      // Keep metrics best-effort and never block tool execution.
    }
    return ` inputChars=${inputChars} templateCount=${templates.length} scheduleEntries=${workouts.length} expandedOccurrences=${expandedOccurrences}`;
  })();
  logger.debug(
    `[AI][教练][工具] 开始 name=${providerToolName} cost=${tool.cost}${planDraftMetrics}`,
  );

  const execCtx: AiToolContext = {
    ...ctx,
    currentToolCallId: toolCallId,
  };

  const replayCommitted = () => recordTool.replayCommittedInvocation?.(execCtx, input);
  let guardFailed = false;
  try {
    if (execCtx.mutationRun && recordTool.replayCommittedInvocation) {
      const receipt = await replayCommitted();
      if (receipt) {
        onReplay();
        return receipt;
      }
    }
    try {
      ctx.signal.throwIfAborted();
      await beforeRunning();
      await ctx.onActivity?.({ ...event, status: 'running' });
      ctx.signal.throwIfAborted();
    } catch (error) {
      // The same call may have committed while the checkpoint or signal was fenced.
      const receipt = execCtx.mutationRun ? await replayCommitted() : null;
      if (receipt) {
        onReplay();
        return receipt;
      }
      guardFailed = true;
      throw error;
    }
    const out = await recordTool.execute(execCtx, input);
    const outChars = (() => {
      try {
        return JSON.stringify(out).length;
      } catch {
        return -1;
      }
    })();
    logger.debug(
      `[AI][教练][工具] 完成 name=${providerToolName} 耗时毫秒=${Date.now() - tExec} outChars=${outChars}`,
    );
    if (shouldLogToolOutputs()) {
      logger.debug(
        `[AI][教练][工具] 输出预览 name=${providerToolName} preview=${safeJsonPreview(out)}`,
      );
    }
    if (shouldLogToolDebug()) {
      logger.warn(
        `[AI][教练][tool-debug] success name=${providerToolName} outPreview=${safeJsonPreview(out, 2000)}`,
      );
    }
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (shouldLogToolDebug()) {
      logger.warn(
        `[AI][教练][tool-debug] execute_failed name=${providerToolName} message=${msg} argsPreview=${safeJsonPreview(input, 1600)}`,
      );
    }
    logger.warn(`[AI][教练][工具] 失败 name=${providerToolName} ${msg}`);
    const problem = err instanceof HttpException ? asRecord(err.getResponse()) : null;
    if (problem?.code === 'PLAN_SCHEDULE_INVALID' && Array.isArray(problem.issues)) {
      return { error: msg, code: problem.code, issues: problem.issues, stage: 'execute' };
    }
    if (
      problem?.code === 'COACH_MUTATION_INVOCATION_MISMATCH' ||
      problem?.code === 'COACH_MUTATION_INACTIVE_ATTEMPT' ||
      problem?.code === 'COACH_MUTATION_INVOCATION_INVALID'
    )
      return { error: msg, code: problem.code, stage: 'execute' };
    if (guardFailed) throw err;
    return { error: msg, stage: 'execute' };
  }
}

export function createAiSdkCoachTools(args: {
  tools: AiToolDef[];
  ctx: AiToolContext;
  canExecute?: () => boolean;
}): ToolSet {
  const { tools, ctx } = args;
  let unsafeQueue: Promise<unknown> = Promise.resolve();
  const out: ToolSet = {};

  for (const toolDef of tools) {
    const providerToolName = toProviderToolName(toolDef.name);
    const validateProviderInput = UI_SURFACE_TOOL_NAMES.has(providerToolName)
      ? (value: unknown) => ({
          success: true as const,
          value: value as Record<string, unknown>,
        })
      : toolSchemaValidator<Record<string, unknown>>(toolDef.parameters);
    // UI tools return actionable validation errors through the normal tool loop.
    const inputSchema = jsonSchema(toolDef.parameters, {
      validate: validateProviderInput,
    });
    const assembledSchema =
      providerToolName === 'present_coach_plan_draft'
        ? jsonSchema(
            {
              type: 'object',
              additionalProperties: false,
              required: ['assessmentId', 'title'],
              properties: {
                assessmentId: { type: 'string' },
                title: { type: 'string', minLength: 1 },
                description: { type: 'string' },
              },
            },
            { validate: validateProviderInput },
          )
        : undefined;
    const sdkTool: Tool<Record<string, unknown>, unknown> = {
      description: toolDef.description,
      get inputSchema() {
        return assembledSchema && planPhaseProgress(ctx)?.next === null
          ? assembledSchema
          : inputSchema;
      },
      metadata: {
        canonicalName: toolDef.name,
        kind:
          toolDef.kind ?? (toolDef.isReadOnly === false ? 'mutation' : 'read'),
        riskTier: toolDef.riskTier,
      },
      execute: async (input: unknown, options: ToolExecutionOptions) => {
        // Defense in depth: a provider may hallucinate a disabled tool call.
        if (args.canExecute?.() === false)
          return {
            error: 'Tools are disabled during final delivery',
            stage: 'delivery',
          };
        const inputRecord = asRecord(input);
        const guardedMutation = Boolean(ctx.mutationRun && toolDef.replayCommittedInvocation);
        const invocationKey = guardedMutation
          ? coachMutationInvocationKey(ctx, toolDef.name, options.toolCallId)
          : null;
        if (guardedMutation && !invocationKey) {
          return {
            error: 'Coach mutation invocation identity is incomplete',
            code: 'COACH_MUTATION_INVOCATION_INVALID',
            stage: 'execute',
          };
        }
        const event: CoachActivityEvent & { toolCallId: string } = {
          status: 'queued',
          key: invocationKey
            ? `${COACH_MUTATION_ACTIVITY_PREFIX}${invocationKey}`
            : `tool:${options.toolCallId}`,
          kind:
            toolDef.name === 'skill.activate'
              ? ('skill' as const)
              : ('tool' as const),
          labelKey: toolDef.name === 'skill.activate' ? 'skill' : 'tool',
          toolCallId: options.toolCallId,
          toolName: toolDef.name,
          ...skillIdentity(toolDef.name, inputRecord),
          mutation: toolDef.isReadOnly === false || toolDef.kind === 'mutation',
        };
        if (!guardedMutation) await ctx.onActivity?.(event);
        const run = async () => {
          if (!guardedMutation) ctx.signal.throwIfAborted();
          let queuedActivity = !guardedMutation;
          let replayed = false;
          const result = await executeCoachTool({
            tool: toolDef,
            ctx,
            input: inputRecord,
            rawInput: input,
            event,
            beforeRunning: async () => {
              if (queuedActivity) return;
              await ctx.onActivity?.(event);
              queuedActivity = true;
            },
            onReplay: () => { replayed = true; },
            providerToolName,
          });
          if (!queuedActivity || replayed) return result;
          const failed =
            result &&
            typeof result === 'object' &&
            ('error' in result ||
              ('ok' in result && result.ok === false) ||
              (toolDef.name === 'skill.activate' &&
                'activated' in result &&
                result.activated === false));
          if (
            !failed &&
            toolDef.name !== 'coach_task_submit_result' &&
            toolDef.name !== 'athlete_state.answer'
          ) {
            ctx.athleteState?.recordRead(
              toolDef.name,
              input as Record<string, unknown>,
              result,
            );
            ctx.backgroundTask?.completedToolNames?.add(toolDef.name);
          }
          await ctx.onActivity?.({
            ...event,
            status: failed ? 'failed' : 'completed',
            ...(failed
              ? {
                  failure: {
                    stage: String(
                      (result as Record<string, unknown>).stage ?? 'execute',
                    ),
                    code: String(
                      (result as Record<string, unknown>).code ?? 'TOOL_FAILED',
                    ),
                  },
                }
              : {}),
          });
          return result;
        };

        const isSafe = (() => {
          try {
            return isAiToolConcurrencySafe(asRecordTool(toolDef), inputRecord);
          } catch {
            return false;
          }
        })();

        if (isSafe) return await run();

        const queued = unsafeQueue.then(run, run);
        unsafeQueue = queued.catch(() => undefined);
        return await queued;
      },
      toModelOutput: async ({ input, output }) => ({
        type: 'text',
        value: await stringifyAiSdkToolResultForModel({
          tool: toolDef,
          ctx,
          input: asRecord(input),
          output,
        }),
      }),
    };

    out[providerToolName] = sdkTool as ToolSet[string];
  }

  return out;
}
