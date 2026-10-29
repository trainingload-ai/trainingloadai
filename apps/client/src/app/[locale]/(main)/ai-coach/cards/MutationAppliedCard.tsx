"use client";

import * as React from "react";
import { CheckCircle2, RotateCcw, ShieldAlert, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  type CoachActionRiskTier,
  type CoachActionType,
  undoCoachAction,
} from "@/api/ai-coach";
import { CoachCard } from "./CoachCard";

/**
 * MutationAppliedCard
 * ============================================
 * 渲染一次「教练已替你完成」的写动作回执。
 *
 * 数据来源：mutation tool 通过 SSE 流回的 tool_result.content（见 apps/server/src/api/ai/core/mutation-tool.factory.ts）：
 *   { kind: 'mutation_applied', actionId, summary, undoUntil, riskTier, type, payload }
 *
 * 行为：
 * - LOW 风险：展示 30s 倒计时撤销按钮；窗口过期后按钮自动消失
 * - HIGH 风险：不展示撤销按钮；附 ShieldAlert 标识「已确认变更」
 * - 已撤销：展示「已撤销」标签 + 灰底
 *
 * 注意：本卡片**不**关心具体业务（是新增 workout 还是改阈值），它只渲染服务端已落账的总结；
 *       特定卡（如「已加临时课」要展示 dayIndex / DSL 缩略）应组合本卡 + 自身扩展，
 *       但 Phase 0 提供这一通用形态作为兜底。
 */

type MutationAppliedToolResult = {
  kind: "mutation_applied";
  ok: true;
  actionId: string;
  type: CoachActionType;
  riskTier: CoachActionRiskTier;
  summary: string;
  /** ISO；HIGH 风险动作恒为 null */
  undoUntil: string | null;
  payload: unknown;
};

export type MutationAppliedCardProps = {
  /** 服务端回执（即 SSE tool_result.content） */
  result: MutationAppliedToolResult;
  /** 撤销成功后的回调（用于 invalidate plan/activity 缓存） */
  onUndone?: (actionId: string) => void;
  /** 标题（不传则按 type 用默认 i18n key） */
  title?: React.ReactNode;
  /** 副标题（不传则用 result.summary 作为正文摘要） */
  subtitle?: React.ReactNode;
  /** 自定义正文（如展示加的课次 DSL 缩略），不传则用 summary 作为唯一行 */
  children?: React.ReactNode;
  /** 是否 dense（嵌在多卡片里） */
  dense?: boolean;
};

/**
 * 计算撤销窗口剩余秒数；过期返回 0。
 * 内部用 Date.now() 而不是 useState 上初值，避免 SSR/hydration 与时区漂移。
 */
function useUndoCountdown(undoUntilIso: string | null): number {
  const target = React.useMemo(() => {
    if (!undoUntilIso) return null;
    const t = Date.parse(undoUntilIso);
    return Number.isFinite(t) ? t : null;
  }, [undoUntilIso]);

  const [remaining, setRemaining] = React.useState(() => {
    if (target == null) return 0;
    return Math.max(0, Math.ceil((target - Date.now()) / 1000));
  });

  React.useEffect(() => {
    if (target == null) {
      setRemaining(0);
      return;
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const next = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0 && timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };
    tick();
    timer = setInterval(tick, 250);
    return () => {
      if (timer != null) clearInterval(timer);
    };
  }, [target]);

  return remaining;
}

export function MutationAppliedCard({
  result,
  onUndone,
  title,
  subtitle,
  children,
  dense,
}: MutationAppliedCardProps) {
  const t = useTranslations("AiCoachPage.mutationApplied");
  const remaining = useUndoCountdown(result.undoUntil);
  const [isUndone, setIsUndone] = React.useState(false);
  const [isUndoing, setIsUndoing] = React.useState(false);

  const isHighRisk = result.riskTier === "HIGH";
  const canUndo = !isHighRisk && !isUndone && remaining > 0;
  const lifecycle = getLifecycleReceipt(result);
  const competitionTitle = getCompetitionReceiptTitle(result);
  const summary = lifecycle
    ? [t(`lifecycle.${lifecycle.action}`), lifecycle.title]
        .filter(Boolean)
        .join(" · ")
    : (competitionTitle ?? result.summary);

  const handleUndo = React.useCallback(async () => {
    if (!canUndo) return;
    setIsUndoing(true);
    try {
      await undoCoachAction(result.actionId);
      setIsUndone(true);
      onUndone?.(result.actionId);
      toast.success(t("undoSuccess"));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("undoFailed");
      toast.error(message);
    } finally {
      setIsUndoing(false);
    }
  }, [canUndo, onUndone, result.actionId, t]);

  const tone = isUndone ? "neutral" : isHighRisk ? "info" : "success";
  const icon = isUndone ? (
    <RotateCcw className="h-4 w-4" />
  ) : isHighRisk ? (
    <ShieldAlert className="h-4 w-4" />
  ) : (
    <CheckCircle2 className="h-4 w-4" />
  );

  const headerRight = canUndo ? (
    <span className="text-xs tabular-nums text-muted-foreground">
      {t("undoCountdown", { seconds: remaining })}
    </span>
  ) : isUndone ? (
    <span className="rounded-md bg-muted/60 px-2 py-0.5 text-mobile-caption pc:text-[11px] font-medium text-muted-foreground">
      {t("undoneTag")}
    </span>
  ) : null;

  return (
    <CoachCard
      tone={tone}
      icon={icon}
      title={title ?? t(`title.${result.type}`)}
      subtitle={subtitle ?? summary}
      headerRight={headerRight}
      dense={dense}
      footer={
        canUndo ? (
          <Button
            type="button"
            variant="ghost"
            className="bg-background/80 dark:bg-background/45"
            size="sm"
            disabled={isUndoing}
            onClick={handleUndo}
          >
            {isUndoing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isUndoing ? t("undoing") : t("undoButton")}
          </Button>
        ) : null
      }
    >
      {children}
    </CoachCard>
  );
}

export type { MutationAppliedToolResult };

/** Translate structured receipts at render time, including persisted history. */
export function getLifecycleReceipt(
  result: Pick<MutationAppliedToolResult, "type" | "payload">,
) {
  if (
    result.type !== "PLAN_LIFECYCLE" ||
    !result.payload ||
    typeof result.payload !== "object"
  )
    return null;
  const { action, title } = result.payload as Record<string, unknown>;
  if (
    action !== "activate" &&
    action !== "pause" &&
    action !== "complete" &&
    action !== "cancel"
  )
    return null;
  return { action, title: typeof title === "string" ? title : "" };
}

/** Competition receipts already have an action-specific localized heading. */
export function getCompetitionReceiptTitle(
  result: Pick<MutationAppliedToolResult, "type" | "payload" | "summary">,
) {
  if (result.type !== "COMPETITION_EVENT_MUTATION") return null;
  if (result.payload && typeof result.payload === "object") {
    const event = (result.payload as Record<string, unknown>).event;
    if (event && typeof event === "object") {
      const title = (event as Record<string, unknown>).title;
      if (typeof title === "string" && title.trim()) return title.trim();
    }
  }
  return (
    result.summary
      .trim()
      .match(
        /^(?:create|update|cancel|restore|delete)\s+competition\s+event\s+(.+)$/i,
      )?.[1]
      ?.trim() || null
  );
}
