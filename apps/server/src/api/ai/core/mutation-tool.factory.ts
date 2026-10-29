import type { CoachActionRiskTier, CoachActionType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { CoachActionRiskTier as RiskTierEnum } from '@prisma/client';
import {
  buildAiTool,
  type AiRiskTier,
  type AiToolContext,
  type AiToolDef,
  type JsonSchemaObject,
} from './tool.types';
import type {
  CoachActionExecResult,
  CoachActionUndoHandler,
} from './coach-action.service';

/**
 * mutationToolFactory：mutation tool 的统一入口
 * ============================================
 * 目标：让所有写动作走同一段路（落审计、写撤销快照、回执给模型与前端）。
 *
 * 工厂内部职责：
 *  1) 接收业务 `exec(ctx, input)`：返回 forwardData / reverseData / summary / payloadForUi
 *  2) 通过 `ctx.coachActions.run(...)` 执行 + 落账本，得到 actionId / undoUntil
 *  3) 把 `{ ok, kind: 'mutation_applied', actionId, summary, undoUntil, payload }` 作为模型读到的结果
 *     —— 该 JSON 同时是 SSE tool_result.content，前端通过 `kind === 'mutation_applied'` 渲染卡片
 *  4) 暴露 `undoHandler`（type + handler）给 AiModule 启动期注册到 CoachActionService
 *
 * 契约：
 *  - mutation tool 不允许被并发执行（factory 强制设置 isConcurrencySafe = false）
 *  - mutation tool **不会**有别的对外副作用，所有写都通过 `exec` 一次完成；多步写入务必放进同一个 prisma 事务里
 */

/** mutation tool 执行时收到的额外上下文（messageId 来自 SSE 流式工具调用 id） */
export type MutationToolRuntimeContext = {
  /** 来自 OpenAI tool_call.id（也是 SSE 中 tool_use.id），便于把审计行挂到对应消息块上 */
  messageId?: string | null;
};

export type MutationToolExec<Input extends object, UiPayload> = (
  ctx: AiToolContext,
  input: Input,
  runtime: MutationToolRuntimeContext,
  tx: Prisma.TransactionClient,
) => Promise<CoachActionExecResult<UiPayload>>;

export type MutationToolDef<
  Input extends object = object,
  UiPayload = unknown,
> = {
  /** 写工具名（建议带 `mutation_` 前缀，便于模型与前端识别） */
  name: string;
  /** 工具描述（给模型读的） */
  description: string;
  /** 给后续 ToolSearch / router 用的关键词提示 */
  searchHint?: string;
  /** 兼容旧名字或短名字 */
  aliases?: string[];
  /** 入参 schema（按 OpenAI function calling 形态） */
  parameters: JsonSchemaObject;
  /** 命中哪些 skill 时才暴露此工具（兜底：全 skill 可见） */
  applicableSkills?: string[];
  /** 成本等级（同 read 工具） */
  cost?: 'low' | 'medium' | 'high';
  /** 对应的 CoachActionType（落账本时写入） */
  type: CoachActionType;
  /** 风险分级；low → 30s 撤销，high → 须先草案确认 */
  riskTier: AiRiskTier;
  /** 业务执行体：写库 + 返回 forward/reverse/summary/payloadForUi */
  exec: MutationToolExec<Input, UiPayload>;
  /** 撤销实现：仅消费 reverseData。HIGH 风险动作可只做记录（抛 NotImplemented） */
  undo: CoachActionUndoHandler;
  /** 可选：执行前权限校验 */
  checkPermissions?: AiToolDef<Input>['checkPermissions'];
  /** 可选：执行前参数校验 */
  validateInput?: AiToolDef<Input>['validateInput'];
};

/** mutation tool 给模型/前端的统一回执；前端按 kind 路由到 MutationAppliedCard */
export type MutationAppliedToolResult<UiPayload = unknown> = {
  kind: 'mutation_applied';
  ok: true;
  actionId: string;
  type: CoachActionType;
  riskTier: CoachActionRiskTier;
  summary: string;
  /** 撤销窗口 ISO 字符串；HIGH 风险动作恒为 null */
  undoUntil: string | null;
  payload: UiPayload;
};

/**
 * 可撤销（LOW）mutation 的工厂产物；启动期注册表见 `coach-mutation-undo-bundles.ts`。
 */
export type MutationToolBundle<Input extends object = object, UiPayload = unknown> = {
  tool: AiToolDef<Input, MutationAppliedToolResult<UiPayload>>;
  type: CoachActionType;
  undoHandler: CoachActionUndoHandler;
};

function toRiskTierEnum(tier: AiRiskTier): CoachActionRiskTier {
  return tier === 'low' ? RiskTierEnum.LOW : RiskTierEnum.HIGH;
}

/**
 * mutationToolFactory
 *
 * 用法示例：
 * ```ts
 * export const planWorkoutAddBundle = mutationToolFactory<Input, UiPayload>({
 *   name: 'mutation_plan_workout_add',
 *   description: 'Add a single training session into an existing plan...',
 *   parameters: { ... },
 *   type: CoachActionType.PLAN_WORKOUT_ADD,
 *   riskTier: 'low',
 *   async exec(ctx, input) { ... },
 *   async undo({ prisma, reverseData }) { ... },
 * });
 * ```
 */
export function mutationToolFactory<
  Input extends object = object,
  UiPayload = unknown,
>(
  def: MutationToolDef<Input, UiPayload>,
): MutationToolBundle<Input, UiPayload> {
  const tool = buildAiTool<Input, MutationAppliedToolResult<UiPayload>>({
    name: def.name,
    description: def.description,
    aliases: def.aliases,
    searchHint: def.searchHint,
    parameters: def.parameters,
    cost: def.cost ?? 'medium',
    kind: 'mutation',
    riskTier: def.riskTier,
    applicableSkills: def.applicableSkills,
    isReadOnly: false,
    isConcurrencySafe: false,
    checkPermissions: def.checkPermissions,
    validateInput: def.validateInput,
    async execute(ctx, input) {
      const session = ctx.session;
      const userId = session?.user?.id;
      if (!userId) {
        throw new Error('Mutation tool requires signed-in user');
      }

      const result = await ctx.coachActions.run<UiPayload>({
        userId,
        type: def.type,
        riskTier: toRiskTierEnum(def.riskTier),
        sid: ctx.sid ?? null,
        messageId: ctx.currentToolCallId ?? null,
        exec: (tx) =>
          def.exec(ctx, input, {
            messageId: ctx.currentToolCallId ?? null,
          }, tx),
      });

      const payload: MutationAppliedToolResult<UiPayload> = {
        kind: 'mutation_applied',
        ok: true,
        actionId: result.actionId,
        type: result.type,
        riskTier: result.riskTier,
        summary: result.summary,
        undoUntil: result.undoUntil ? result.undoUntil.toISOString() : null,
        payload: result.payloadForUi,
      };
      return payload;
    },
  });

  return {
    tool,
    type: def.type,
    undoHandler: def.undo,
  };
}
