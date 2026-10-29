import {
  jsonSchema,
  type Tool,
  type ToolExecutionOptions,
  type ToolSet,
} from 'ai';
import { Logger } from '@nestjs/common';
import {
  checkAiToolPermissions,
  isAiToolConcurrencySafe,
  toProviderToolName,
  validateAiToolInput,
  type AiToolContext,
  type AiToolDef,
  type AiToolModelSummaryArgs,
  asRecordTool,
} from './tool.types';
import { safeJsonPreview } from './safe-json-preview';
import { getCoachSkillByName } from './skill.registry';
import { toolSchemaValidator } from './tool-input-validation';

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
  'present_coach_plan_draft',
  'present_plan_workout_adjustment_draft',
  'present_training_visualization',
]);

const UI_SURFACE_VALIDATION_LOG_PREVIEW_CHARS = 8_000;

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

function logUiSurfaceValidationFailure(args: {
  providerToolName: string;
  validation: { message: string; code?: string };
  input: Record<string, unknown>;
}) {
  const { providerToolName, validation, input } = args;
  const argsPreview = safeJsonPreview(
    input,
    UI_SURFACE_VALIDATION_LOG_PREVIEW_CHARS,
  );
  const questionCount = Array.isArray(input.questions)
    ? input.questions.length
    : undefined;
  logger.warn(
    `[AI][教练][工具] 参数不合法 name=${providerToolName} ${validation.message} code=${validation.code ?? 'none'} keys=${Object.keys(input).join(',') || '(empty)'}${questionCount !== undefined ? ` questionCount=${questionCount}` : ''} argsPreview=${argsPreview}`,
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

async function executeCoachTool(args: {
  tool: AiToolDef;
  ctx: AiToolContext;
  input: Record<string, unknown>;
  toolCallId: string;
  providerToolName: string;
}): Promise<unknown> {
  const { tool, ctx, input, toolCallId, providerToolName } = args;

  if (shouldLogToolDebug()) {
    logger.warn(
      `[AI][教练][tool-debug] start name=${providerToolName} keys=${Object.keys(input).join(',') || '(empty)'} argsPreview=${safeJsonPreview(input, 1600)}`,
    );
  }

  if (
    providerToolName === 'present_coach_plan_draft' &&
    shouldLogPlanDraftDebug()
  ) {
    logger.warn(
      `[AI][教练][plan_draft][debug] before_validate keys=${Object.keys(input).join(',') || '(empty)'} argsPreview=${safeJsonPreview(input, 1200)}`,
    );
  }

  if (
    providerToolName === 'present_coach_plan_draft' &&
    Object.keys(input).length === 0
  ) {
    logger.warn(
      '[AI][教练][工具] 参数为空 name=present_coach_plan_draft expected=title,periodWeeks,workouts',
    );
    return {
      error:
        'present_coach_plan_draft arguments were empty; retry with a complete JSON object containing title, periodWeeks, and workouts.',
      code: 'EMPTY_TOOL_ARGUMENTS',
      stage: 'parse_arguments',
    };
  }

  const recordTool = asRecordTool(tool);
  const validation = await validateAiToolInput(recordTool, ctx, input);
  if (validation.ok === false) {
    if (shouldLogToolDebug()) {
      logger.warn(
        `[AI][教练][tool-debug] validate_failed name=${providerToolName} code=${validation.code ?? 'none'} message=${validation.message} argsPreview=${safeJsonPreview(input, 1600)}`,
      );
    }
    if (
      providerToolName === 'present_coach_plan_draft' &&
      shouldLogPlanDraftDebug()
    ) {
      logger.warn(
        `[AI][教练][plan_draft][debug] validate_failed message=${validation.message} code=${validation.code ?? 'none'} argsPreview=${safeJsonPreview(input, 1200)}`,
      );
    }
    if (UI_SURFACE_TOOL_NAMES.has(providerToolName)) {
      logUiSurfaceValidationFailure({
        providerToolName,
        validation,
        input,
      });
    } else {
      logger.warn(
        `[AI][教练][工具] 参数不合法 name=${providerToolName} ${validation.message}`,
      );
    }
    return {
      error: validation.message,
      code: validation.code,
      stage: 'validate_input',
      ...(validation.issues ? { issues: validation.issues } : {}),
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

  ctx.signal.throwIfAborted();
  await ctx.onActivity?.({
    key: `tool:${toolCallId}`,
    kind: tool.name === 'skill.activate' ? 'skill' : 'tool',
    status: 'running',
    labelKey: tool.name === 'skill.activate' ? 'skill' : 'tool',
    toolCallId,
    toolName: tool.name,
    ...skillIdentity(tool.name, input),
    mutation: tool.isReadOnly === false || tool.kind === 'mutation',
  });
  ctx.signal.throwIfAborted();
  try {
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
    const sdkTool: Tool<Record<string, unknown>, unknown> = {
      description: toolDef.description,
      inputSchema: jsonSchema(toolDef.parameters, {
        // Keep the exact JSON Schema visible to the provider. For UI surface
        // tools only, defer local parsing failure to executeCoachTool so the
        // strict validator below can return an ordinary tool result to the
        // model. Otherwise AI SDK rejects the call before the existing bounded
        // repair loop can see the error and retry it.
        validate: validateProviderInput,
      }),
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
        const event = {
          key: `tool:${options.toolCallId}`,
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
        await ctx.onActivity?.({ ...event, status: 'queued' });
        const run = async () => {
          ctx.signal.throwIfAborted();
          const result = await executeCoachTool({
            tool: toolDef,
            ctx,
            input: inputRecord,
            toolCallId: options.toolCallId,
            providerToolName,
          });
          const failed =
            result &&
            typeof result === 'object' &&
            ('error' in result ||
              ('ok' in result && result.ok === false) ||
              (toolDef.name === 'skill.activate' &&
                'activated' in result &&
                result.activated === false));
          if (!failed && toolDef.name !== 'coach_task_submit_result') {
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
