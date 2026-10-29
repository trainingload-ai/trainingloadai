import type { FitnessCalculationService } from '@/fitness-calculation/fitness-calculation.service';
import type { FitnessAssessmentApplyService } from '../fitness-assessment-apply.service';
import type { FitnessAssessmentFollowupService } from '../fitness-assessment-followup.service';
import type {
  FitnessConfirmation,
  FitnessTrackingReply,
} from '@shared/fitness-assessment';
import type { PrismaService } from '@/prisma/prisma.service';
import type { UserService } from '@/api/user/user.service';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { I18nService } from 'nestjs-i18n';
import type { CoachToolsService } from './coach-tools.service';
import type { CoachActionService } from './coach-action.service';
import type { PlanService } from '@/api/plan/plan.service';
import type { PlanQueryService } from '@/api/plan/application/plan-query.service';
import type { PlanExecutionContextService } from '@/api/plan/plan-execution-context.service';
import type { ActivityService } from '@/api/activity/activity.service';
import type { PMCService } from '@/training-load/pmc.service';
import type { CoachBranchingService } from '../coach-branching.service';
import type { ActivityReadService } from '@/api/activity/activity-read.service';
import type { UserQueryService } from '@/api/user/user-query.service';
import type { ExternalProviderStatusQueryService } from '@/integrations/external-provider/external-provider-status-query.service';
import type { ActivitySeriesQueryService } from '@/api/activity/activity-series-query.service';
import type { WorkoutService } from '@/api/workout/workout.service';
import type { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import type { AiUsageKind } from '@prisma/client';
import type { AthleteMemoryQueryService } from '@/athlete-memory/application/athlete-memory-query.service';
import type { WebEvidenceGateway } from './web-evidence.gateway';
import type { TrainingDataCoverageQueryService } from './training-data-coverage-query.service';
import {
  toolSchemaValidator,
  type ToolInputIssue,
} from './tool-input-validation';

export type JsonSchemaObject = {
  /**
   * 仅支持 object 入参（与 OpenAI function calling 的 parameters 对齐）
   */
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  allOf?: Record<string, unknown>[];
};

export type AiToolContext = {
  fitnessCalculations?: FitnessCalculationService;
  fitnessApply?: FitnessAssessmentApplyService;
  fitnessFollowup?: FitnessAssessmentFollowupService;
  fitnessConfirmation?: FitnessConfirmation;
  fitnessTrackingReply?: FitnessTrackingReply;
  activeSkillName?: string;
  fitnessAssessmentActive?: boolean;
  /**
   * Per-turn plan suitability gate. The plan-builder must assess the compact
   * brief before it spends a model turn producing the full workout calendar.
   * The object is intentionally mutable and survives the shallow execution
   * context copies made for individual tool calls.
   */
  planSuitability?: {
    latest?: {
      assessmentId: string;
      status: 'READY' | 'NEEDS_INPUT' | 'NEEDS_ADJUSTMENT';
      constraints: {
        periodWeeks: number;
        maxTrainingDaysPerWeek: number;
        maxDailyMinutes: number;
        requiredSports: string[];
        strengthPreference: 'AUTO' | 'INCLUDE' | 'EXCLUDE';
      };
    };
  };
  /** Parent operation attribution for nested model calls made by tools. */
  aiOperationId?: string | null;
  aiUsageKind?: AiUsageKind;
  currentUserPrompt?: string;
  /** Structured-question response state for this resumed turn. */
  questionResponse?: {
    declinedAll: boolean;
    skippedQuestionIds: readonly string[];
  };
  confirmedDecisionId?: string;
  currentTurnStartedAt?: Date;
  /** Live public-web evidence gateway and per-turn cost guard. */
  webEvidence?: WebEvidenceGateway;
  webEvidenceBudget?: { searchCalls: number; fetchCalls: number };
  /** Server-owned safety state for a bound Athlete State Case. */
  athleteStateSafetyMode?: 'HIGH_CONCERN';
  /**
   * 后台教练任务的结构化结果出口。
   *
   * 任务只能通过 `coach_task_submit_result` 提交最终结果；校验失败会抛错并让
   * Agent 在同一轮内修复。这个出口不写领域事实，也不授予任何 mutation 权限。
   */
  backgroundTask?: {
    taskType: string;
    /** Explicit read-tool policy for this task; result submission is added separately. */
    allowedToolNames: readonly string[];
    /** Evidence tools that must complete before the result can be submitted. */
    requiredToolNames?: readonly string[];
    /** Successful tool executions recorded by the Agent runtime. */
    completedToolNames?: Set<string>;
    submitResult: (result: unknown) => Promise<void> | void;
  };
  /**
   * 数据访问与业务能力：
   * - prisma: 读写数据库
   * - userService: 获取用户画像/指标等聚合能力
   * - i18n: 国际化文案（错误提示等）
   */
  prisma: PrismaService;
  userService: UserService;
  i18n: I18nService;
  /**
   * 工具实现层（用于承载工具的具体业务逻辑，避免散落在各 tool 文件里）
   */
  coachTools: CoachToolsService;
  /**
   * 写动作账本服务：mutationToolFactory 内部使用，记录 forward/reverse 并支持撤销。
   * - read 类工具不应该用到它
   */
  coachActions: CoachActionService;
  /**
   * 分支对话决策服务：branch 模式下用于把讨论压缩成 decision draft。
   */
  coachBranching?: CoachBranchingService;
  /**
   * 训练计划写路径（关联活动 ↔ 计划课；mutation 工具使用）
   */
  planService: PlanService;
  /**
   * 计划表只读查询（禁止 tool 直读 Plan 表）
   */
  planQuery: PlanQueryService;
  /**
   * 计划执行只读上下文（日/周复盘工具使用，避免 tool 里 new Service）
   */
  planExecutionContext: PlanExecutionContextService;
  /**
   * 活动写删（与 Activity API 一致）
   */
  activityService: ActivityService;
  /**
   * PMC 只读查询（禁止直读 PMC 表）
   */
  pmc: PMCService;
  /** Athlete Memory 只读能力；HealthData 等结构化事实仍由各自模块拥有。 */
  athleteMemory?: AthleteMemoryQueryService;
  /**
   * 活动只读端口（禁止 tool / action 直读 Activity 表）
   */
  activities?: ActivityReadService;
  /**
   * User 表查询口（禁止 tool 直读 t_user / UserBodyMetric / UserFitnessMetric）
   */
  users?: UserQueryService;
  /**
   * 第三方集成只读查询：返回产品能力、用户连接、权限与同步开关的规范化有效状态。
   */
  integrationStatus?: ExternalProviderStatusQueryService;
  /** 活动来源、导入、处理和同步覆盖度的只读聚合。 */
  trainingDataCoverage?: TrainingDataCoverageQueryService;
  activitySeries?: ActivitySeriesQueryService;
  workoutService: WorkoutService;
  workoutDefinitions: WorkoutDefinitionService;
  /**
   * 当前登录会话（用于拿 userId，以及权限控制）
   */
  session: UserSession;
  /**
   * 当前对话会话 sid（教练 chat 才有；用于把写动作账本归到正确的会话下）
   */
  sid?: string | null;
  /**
   * 当前计划上下文的对话分支。存在时，模型不应直接写事实，只能读数据并产出 decision draft。
   */
  branchId?: string | null;
  /**
   * 语言偏好（zh/en）
   */
  lang: string;
  /**
   * 中断信号（客户端断开 SSE 时会 abort）
   */
  signal: AbortSignal;
  onActivity?: (
    event: import('@shared/ai-coach-run-contract').CoachActivityEvent,
  ) => Promise<void>;
  /**
   * 当前执行的 OpenAI `tool_calls[].id`（orchestrator 在每次 `execute` 前浅拷贝 ctx 时写入；供 mutation 入账关联 messageId）
   */
  currentToolCallId?: string | null;
};

/**
 * 工具种类：
 * - read     ：纯查询，对外可见、可并发、无副作用
 * - draft    ：UI-only 草案展示（present_*），后端不写入；用户在 UI 二次确认后再触发 mutation
 * - mutation ：会写库的工具，必须经 mutationToolFactory 包装，落入 CoachAction 审计与撤销链路
 */
export type AiToolKind = 'read' | 'draft' | 'mutation';

/**
 * 写动作风险分级：
 * - low ：直接执行 + 客户端 30s 撤销窗口（如：加临时课、改未开始单课、活动备注、sessionRPE）
 * - high：必须先经 *.draft 草案，UI 二次确认后再 apply（如：顺延、激活/暂停/取消、删除、阈值修改）
 */
export type AiRiskTier = 'low' | 'high';

export type AiToolCheckOk = { ok: true };

export type AiToolCheckError = {
  ok: false;
  message: string;
  code?: string;
  issues?: ToolInputIssue[];
};

export type AiToolCheckResult = AiToolCheckOk | AiToolCheckError;

export type AiToolValidationResult = AiToolCheckResult;

export type AiToolPermissionResult = AiToolCheckResult;

export type AiToolModelSummaryArgs<
  Input extends object = object,
  Output = unknown,
> = {
  ctx: AiToolContext;
  input: Input;
  output: Output;
  maxChars: number;
};

export type AiToolDef<Input extends object = object, Output = unknown> = {
  /**
   * 兼容旧名字或短名字
   */
  aliases?: string[];
  /**
   * 给后续 ToolSearch / router 用的关键词提示
   */
  searchHint?: string;
  /**
   * 工具名：必须全局唯一（作为 function name 暴露给模型）
   */
  name: string;
  /**
   * 工具描述：用于帮助模型理解“何时调用该工具”
   */
  description: string;
  /**
   * 工具入参 JSON Schema（供 function calling 校验/提示）
   */
  parameters: JsonSchemaObject;
  /**
   * 成本等级：用于后续做权限/预算控制（例如高成本工具限制调用频率）
   */
  cost: 'low' | 'medium' | 'high';
  /**
   * 工具分类（read/draft/mutation）。
   * 默认推断：未声明时按 isReadOnly 推断（true → read，false → mutation）。
   */
  kind?: AiToolKind;
  /**
   * 写动作风险分级；仅 mutation 工具需要。
   * 由 mutationToolFactory 写入；read / draft 应保持 undefined。
   */
  riskTier?: AiRiskTier;
  /**
   * skill 级别白名单：声明后只在这些 skill 激活时暴露给模型。
   * 不声明 = 全 skill 可见（兼容现有工具）。
   */
  applicableSkills?: string[];
  /**
   * 是否应暴露给当前会话/上下文（默认 true）
   */
  isEnabled?: (ctx: AiToolContext) => Promise<boolean> | boolean;
  /**
   * 是否只读（默认 true）
   */
  isReadOnly?: boolean | ((input: Input) => boolean);
  /**
   * 是否允许和其他只读工具并发执行（默认继承 isReadOnly）
   */
  isConcurrencySafe?: boolean | ((input: Input) => boolean);
  /**
   * 执行前参数校验
   */
  validateInput?: (
    ctx: AiToolContext,
    input: Input,
  ) => Promise<AiToolValidationResult> | AiToolValidationResult;
  /**
   * 执行前权限判定
   */
  checkPermissions?: (
    ctx: AiToolContext,
    input: Input,
  ) => Promise<AiToolPermissionResult> | AiToolPermissionResult;
  /**
   * tool 结果回填给模型时的最大字符数预算
   */
  maxResultChars?: number;
  /**
   * 将原始结果转换成更适合模型消费的结构化摘要
   */
  summarizeForModel?: (
    args: AiToolModelSummaryArgs<Input, Output>,
  ) => Promise<unknown> | unknown;
  /**
   * 工具执行函数：在服务端执行，返回结构化结果给模型作为“可信事实”
   */
  execute: (ctx: AiToolContext, input: Input) => Promise<Output>;
};

export type AiToolCall = {
  /**
   * 由模型生成的工具调用（function calling）
   */
  name: string;
  arguments: string | Record<string, unknown>;
};

const AI_TOOL_OK: AiToolCheckOk = { ok: true };

export function aiToolOk(): AiToolCheckOk {
  return AI_TOOL_OK;
}

export function aiToolError(message: string, code?: string): AiToolCheckError {
  return { ok: false, message, code };
}

export function requireSignedInUser(
  ctx: AiToolContext,
): AiToolPermissionResult {
  if (ctx.session?.user?.id) return aiToolOk();
  return aiToolError(
    ctx.i18n.t('common.error.missing_user_id') || 'Missing user id',
    'UNAUTHORIZED',
  );
}

export function hasSignedInUser(ctx: AiToolContext): boolean {
  return Boolean(ctx.session?.user?.id);
}

export function toolMatchesName(tool: AiToolDef, name: string): boolean {
  return (
    tool.name === name ||
    toProviderToolName(tool.name) === name ||
    Boolean(
      tool.aliases?.some(
        (alias) => alias === name || toProviderToolName(alias) === name,
      ),
    )
  );
}

export function toProviderToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function findAiToolByName(
  tools: AiToolDef[],
  name: string,
): AiToolDef | undefined {
  return tools.find((tool) => toolMatchesName(tool, name));
}

export function asRecordTool(
  tool: AiToolDef,
): AiToolDef<Record<string, unknown>> {
  return tool as AiToolDef<Record<string, unknown>>;
}

export async function isAiToolEnabled<Input extends object>(
  tool: AiToolDef<Input>,
  ctx: AiToolContext,
): Promise<boolean> {
  if (!tool.isEnabled) return true;
  return Boolean(await tool.isEnabled(ctx));
}

function resolveFlag<Input extends object>(
  flag: boolean | ((input: Input) => boolean) | undefined,
  input: Input,
  fallback: boolean,
): boolean {
  if (typeof flag === 'function') return Boolean(flag(input));
  if (typeof flag === 'boolean') return flag;
  return fallback;
}

export function isAiToolReadOnly<Input extends object>(
  tool: AiToolDef<Input>,
  input: Input,
): boolean {
  return resolveFlag(tool.isReadOnly, input, true);
}

export function isAiToolConcurrencySafe<Input extends object>(
  tool: AiToolDef<Input>,
  input: Input,
): boolean {
  return resolveFlag(
    tool.isConcurrencySafe,
    input,
    isAiToolReadOnly(tool, input),
  );
}

export async function validateAiToolInput<Input extends object>(
  tool: AiToolDef<Input>,
  ctx: AiToolContext,
  input: Input,
): Promise<AiToolValidationResult> {
  const parsed = toolSchemaValidator(tool.parameters)(input);
  if (parsed.success === false)
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: parsed.error.message,
      issues: parsed.error.issues,
    };
  if (!tool.validateInput) return aiToolOk();
  return await tool.validateInput(ctx, input);
}

export async function checkAiToolPermissions<Input extends object>(
  tool: AiToolDef<Input>,
  ctx: AiToolContext,
  input: Input,
): Promise<AiToolPermissionResult> {
  if (!tool.checkPermissions) return aiToolOk();
  return await tool.checkPermissions(ctx, input);
}

export function buildAiTool<Input extends object, Output>(
  def: AiToolDef<Input, Output>,
): AiToolDef<Input, Output> {
  return {
    ...def,
    isEnabled: def.isEnabled ?? (async () => true),
    isReadOnly: def.isReadOnly ?? true,
    isConcurrencySafe:
      def.isConcurrencySafe ??
      ((input: Input) => isAiToolReadOnly(def as AiToolDef<Input>, input)),
    maxResultChars: def.maxResultChars ?? 12_000,
    validateInput: def.validateInput ?? (async () => aiToolOk()),
    checkPermissions: def.checkPermissions ?? (async () => aiToolOk()),
  };
}
