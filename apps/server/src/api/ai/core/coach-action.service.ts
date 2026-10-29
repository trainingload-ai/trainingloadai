import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  CoachActionRiskTier,
  CoachActionType,
  type CoachAction,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emitPmcInvalidate } from '@/training-load/events/pmc.events';
import { isActivityWithinGlobalRefreshWindow } from '@/utils/activity-global-refresh-window';
import { ActivityReadService } from '@/api/activity/activity-read.service';
import { UserQueryService } from '@/api/user/user-query.service';

/**
 * AI 教练写动作账本服务
 * ============================================
 * 设计目的：为 mutation tool 提供「执行业务 → 落审计 → 可按 id 撤销」的统一闭环。
 *
 * 一次写动作的生命周期：
 *  1) `run`：包住业务执行 + 落账本，返回 actionId / undoUntil / 给 UI 的 payload。
 *  2) 客户端拿 actionId 在卡片里展示「撤销 30s」按钮（仅 LOW 风险动作有窗口）。
 *  3) `undo`：在窗口内，校验 ownership + 时窗 + handler 存在，执行 reverseData 反向操作并标 undoneAt。
 *
 * 与 Plan/Activity service 的关系：
 *  - 本服务**不持有**业务依赖。具体的 forward / reverse 实现由 mutation tool 在定义时提供。
 *  - 用 `registerUndoHandler(type, handler)` 把 type → undo 反查表注册起来；启动时由 AiModule 统一装配。
 *  - 这样可以避免本服务变成「巨型胖服务」，又能复用同一段路由 + 校验逻辑。
 */

/** 撤销窗口（毫秒）：仅 LOW 风险动作允许撤销，HIGH 风险动作不开窗口 */
const LOW_TIER_UNDO_WINDOW_MS = 30_000;

/** mutation 工具执行体的产出契约：写库结果 + 撤销快照 + 可读摘要 + 给 UI 的 payload */
export type CoachActionExecResult<UiPayload = unknown> = {
  /** 写入参数快照（落入 forwardData，仅审计用） */
  forwardData: Prisma.InputJsonValue;
  /** 撤销所需快照（落入 reverseData，由对应 undo handler 消费） */
  reverseData: Prisma.InputJsonValue;
  /** 给前端 / AI 复述的一句话摘要 */
  summary: string;
  /** 透传给前端 MutationAppliedCard 的结构化 payload */
  payloadForUi: UiPayload;
  /** 数据库事务成功提交后执行的缓存失效、事件通知等副作用。 */
  afterCommit?: () => Promise<void>;
};

/** mutation 工具撤销 handler 协议：仅消费 reverseData，不依赖 mutation tool 的入参 */
export type CoachActionUndoHandler = (args: {
  prisma: Prisma.TransactionClient;
  users: UserQueryService;
  userId: string;
  reverseData: unknown;
}) => Promise<void>;

export type RecordCoachActionInput<UiPayload> = {
  userId: string;
  type: CoachActionType;
  riskTier: CoachActionRiskTier;
  /** 可选：关联到对话消息块 id（来自 tool_use.id），便于卡片定位 */
  messageId?: string | null;
  /** 可选：教练会话 sid，便于按会话过滤「我都帮你做了什么」 */
  sid?: string | null;
  /** Optional transaction-local lock/idempotency check; never called outside this transaction. */
  replay?: (
    tx: Prisma.TransactionClient,
  ) => Promise<RecordCoachActionResult<UiPayload> | null>;
  finalize?: (
    tx: Prisma.TransactionClient,
    result: RecordCoachActionResult<UiPayload>,
  ) => Promise<void>;
  /** 业务执行体：返回 forward/reverse/summary/payloadForUi */
  exec: (
    tx: Prisma.TransactionClient,
  ) => Promise<CoachActionExecResult<UiPayload>>;
};

/** mutation tool 调 run 后回得到的执行结果 */
export type RecordCoachActionResult<UiPayload> = {
  actionId: string;
  type: CoachActionType;
  riskTier: CoachActionRiskTier;
  summary: string;
  /** 撤销窗口截止时间；HIGH 风险动作恒为 null */
  undoUntil: Date | null;
  payloadForUi: UiPayload;
  createdAt: Date;
};

export type CoachActionListItem = Pick<
  CoachAction,
  | 'id'
  | 'type'
  | 'riskTier'
  | 'summary'
  | 'createdAt'
  | 'undoUntil'
  | 'undoneAt'
  | 'messageId'
  | 'sid'
>;

@Injectable()
export class CoachActionService {
  private readonly logger = new Logger(CoachActionService.name);

  /** type → undo handler 反查表；由 AiModule 启动时装配 */
  private readonly undoHandlers = new Map<
    CoachActionType,
    CoachActionUndoHandler
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityRead: ActivityReadService,
    private readonly users: UserQueryService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  /**
   * 由 mutation tool 在定义阶段调用，把对应 type 的 undo 实现注册到反查表。
   * 重复注册会以最后一次为准（便于热更新与单测）。
   */
  registerUndoHandler(type: CoachActionType, handler: CoachActionUndoHandler) {
    this.undoHandlers.set(type, handler);
  }

  /**
   * 执行 mutation 业务 + 落账本。失败时不会落任何审计行（exec 抛错原样上抛）。
   */
  async run<UiPayload = unknown>(
    input: RecordCoachActionInput<UiPayload>,
  ): Promise<RecordCoachActionResult<UiPayload>> {
    const undoUntil =
      input.riskTier === CoachActionRiskTier.LOW
        ? new Date(Date.now() + LOW_TIER_UNDO_WINDOW_MS)
        : null;

    const transaction = await this.prisma.$transaction(
      async (tx) => {
        const replay = await input.replay?.(tx);
        if (replay) return { replay, action: null, exec: null };
        const exec = await input.exec(tx);
        const action = await tx.coachAction.create({
          data: {
            userId: input.userId,
            type: input.type,
            riskTier: input.riskTier,
            summary: exec.summary,
            forwardData: exec.forwardData,
            reverseData: exec.reverseData,
            messageId: input.messageId ?? null,
            sid: input.sid ?? null,
            undoUntil,
          },
        });
        await input.finalize?.(tx, {
          actionId: action.id,
          type: action.type,
          riskTier: action.riskTier,
          summary: action.summary,
          undoUntil: action.undoUntil,
          payloadForUi: exec.payloadForUi,
          createdAt: action.createdAt,
        });
        return { action, exec, replay: null };
      },
      { timeout: 60_000 },
    );

    if (transaction.replay) return transaction.replay;
    const { action, exec } = transaction;

    if (input.type === CoachActionType.ACTIVITY_SESSION_RPE) {
      await this.awaitPmcRecalculateForActivity(
        input.userId,
        this.activityIdFromReverseData(exec.reverseData),
      );
    }
    if (exec.afterCommit) {
      try {
        await exec.afterCommit();
      } catch (error) {
        this.logger.warn(
          `[CoachAction] afterCommit failed actionId=${action.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      actionId: action.id,
      type: action.type,
      riskTier: action.riskTier,
      summary: action.summary,
      undoUntil: action.undoUntil,
      payloadForUi: exec.payloadForUi,
      createdAt: action.createdAt,
    };
  }

  /**
   * 撤销已执行的写动作。
   *
   * 失败约束：
   * - action 不存在 / 不属于当前用户 → NOT_FOUND
   * - 已撤销 → ALREADY_UNDONE
   * - 不在撤销窗口内（HIGH 风险或窗口过期） → WINDOW_CLOSED
   * - 没有注册对应 type 的 undo handler → HANDLER_MISSING
   *
   * 业务反向执行失败时会上抛，不会标 undoneAt，便于前端展示「撤销失败，请稍后重试」。
   */
  async undo(args: { userId: string; id: string }) {
    const now = new Date();
    const { action, undoneAt } = await this.prisma.$transaction(
      async (tx) => {
        const action = await tx.coachAction.findUnique({
          where: { id: args.id },
        });
        if (!action || action.userId !== args.userId) {
          throw new CoachActionUndoError('NOT_FOUND', 'Coach action not found');
        }
        if (action.undoneAt) {
          throw new CoachActionUndoError(
            'ALREADY_UNDONE',
            'Coach action already undone',
          );
        }
        if (!action.undoUntil || action.undoUntil.getTime() <= now.getTime()) {
          throw new CoachActionUndoError(
            'WINDOW_CLOSED',
            'Coach action undo window closed',
          );
        }
        const handler = this.undoHandlers.get(action.type);
        if (!handler) {
          throw new CoachActionUndoError(
            'HANDLER_MISSING',
            `No undo handler for ${action.type}`,
          );
        }
        const claimed = await tx.coachAction.updateMany({
          where: {
            id: action.id,
            userId: args.userId,
            undoneAt: null,
            undoUntil: { gt: now },
          },
          data: { undoneAt: now },
        });
        if (claimed.count !== 1) {
          const current = await tx.coachAction.findUnique({
            where: { id: action.id },
            select: { undoneAt: true, undoUntil: true },
          });
          if (current?.undoneAt) {
            throw new CoachActionUndoError(
              'ALREADY_UNDONE',
              'Coach action already undone',
            );
          }
          throw new CoachActionUndoError(
            'WINDOW_CLOSED',
            'Coach action undo window closed',
          );
        }
        await handler({
          prisma: tx,
          users: this.users,
          userId: action.userId,
          reverseData: action.reverseData,
        });
        return { action, undoneAt: now };
      },
      { timeout: 60_000 },
    );

    if (action.type === CoachActionType.ACTIVITY_SESSION_RPE) {
      await this.awaitPmcRecalculateForActivity(
        action.userId,
        this.activityIdFromReverseData(action.reverseData),
      );
    }

    this.logger.log(
      `[AI][教练][撤销] 用户ID=${args.userId} actionId=${action.id} type=${action.type}`,
    );

    return {
      id: action.id,
      undoneAt,
    };
  }

  /**
   * Session RPE 变更后刷新 PMC；失败仅记录日志（与 activity.service await 路径一致，避免客户端抢先 refetch 读到旧数据）。
   */
  private activityIdFromReverseData(reverseData: unknown): number | null {
    if (!reverseData || typeof reverseData !== 'object') return null;
    const value = (reverseData as { activityId?: unknown }).activityId;
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
      ? value
      : null;
  }

  private async awaitPmcRecalculateForActivity(
    userId: string,
    activityId: number | null,
  ): Promise<void> {
    if (!activityId) return;
    try {
      const activity = await this.activityRead.findFirst({
        where: { id: activityId, userId },
        select: { startTime: true },
      });
      if (!isActivityWithinGlobalRefreshWindow(activity?.startTime)) return;
      await emitPmcInvalidate(this.events, userId);
    } catch (e) {
      this.logger.warn(
        `[CoachAction] PMC recalculate failed userId=${userId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  /**
   * 查询某用户最近的 CoachAction（默认 20 条），用于「我都帮你做了什么」复盘卡片。
   */
  async list(args: {
    userId: string;
    sid?: string | null;
    take?: number;
  }): Promise<CoachActionListItem[]> {
    const take = Math.min(Math.max(args.take ?? 20, 1), 100);
    const rows = await this.prisma.coachAction.findMany({
      where: {
        userId: args.userId,
        ...(args.sid ? { sid: args.sid } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        riskTier: true,
        summary: true,
        createdAt: true,
        undoUntil: true,
        undoneAt: true,
        messageId: true,
        sid: true,
      },
    });
    return rows;
  }
}

/** 撤销失败的代码，便于 controller 把它映射成具体的 BusinessException 文案 */
export type CoachActionUndoErrorCode =
  | 'NOT_FOUND'
  | 'ALREADY_UNDONE'
  | 'WINDOW_CLOSED'
  | 'HANDLER_MISSING';

/** 撤销路径上的可控错误（与底层 packages/prisma/业务错误区分） */
export class CoachActionUndoError extends Error {
  readonly code: CoachActionUndoErrorCode;

  constructor(code: CoachActionUndoErrorCode, message: string) {
    super(message);
    this.name = 'CoachActionUndoError';
    this.code = code;
  }
}
