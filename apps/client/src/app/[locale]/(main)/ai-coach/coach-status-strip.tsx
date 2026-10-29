"use client";

import { Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CoachStatusViewState } from "./coach-status-model";

/** AI 教练 / 已就绪 状态条（放在输入框上方） */
function truncateToolName(name: string, max = 28) {
  if (name.length <= max) return name;
  return `${name.slice(0, max)}…`;
}

function formatPct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatTokenCompact(value: number, locale: string) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function getRingVisualState(args: {
  hasContext: boolean;
  usageRatio: number;
  compressed: boolean;
}) {
  if (!args.hasContext) {
    return {
      tone: "#d4d4d4",
      glow: "none",
    };
  }

  if (args.compressed) {
    return {
      tone: "#f97316",
      glow: "drop-shadow(0 0 3px rgba(249,115,22,0.32))",
    };
  }

  if (args.usageRatio >= 0.92) {
    return {
      tone: "#ef4444",
      glow: "drop-shadow(0 0 4px rgba(239,68,68,0.4))",
    };
  }

  if (args.usageRatio >= 0.82) {
    return {
      tone: "#f97316",
      glow: "drop-shadow(0 0 3px rgba(249,115,22,0.32))",
    };
  }

  if (args.usageRatio >= 0.72) {
    return {
      tone: "#f59e0b",
      glow: "drop-shadow(0 0 2px rgba(245,158,11,0.2))",
    };
  }

  return {
    tone: "#10b981",
    glow: "none",
  };
}

export function CoachStatusStrip({
  status,
  className,
}: {
  status: CoachStatusViewState;
  className?: string;
}) {
  const t = useTranslations("AiCoachPage");
  const locale = useLocale();
  const { isStreaming, streamPhase, activeToolName, contextWindow } = status;
  /** 主状态文案：工具阶段不再显示「生成中」，与 SSE phase 对齐 */
  const primaryStreamingLabel =
    streamPhase === "tool_run"
      ? t("status.phaseToolRun")
      : t("status.streaming");

  const phaseLabel =
    streamPhase === "model"
      ? t("status.phaseModel")
      : streamPhase === "tool_run"
        ? t("status.phaseToolRun")
        : null;
  const toolHint =
    isStreaming &&
    streamPhase === "tool_run" &&
    activeToolName &&
    activeToolName.trim().length > 0
      ? truncateToolName(activeToolName.trim())
      : null;
  const nf = new Intl.NumberFormat(locale);
  const inputBudgetTokens = contextWindow?.inputBudgetTokens
    ? contextWindow.inputBudgetTokens
    : contextWindow?.maxContextTokens;
  const usageRatio = contextWindow
    ? contextWindow.usageRatio ||
      contextWindow.usedInputTokens / Math.max(1, inputBudgetTokens ?? 1)
    : 0;
  const progressRatio = Math.min(1, Math.max(0, usageRatio));
  const ringVisual = getRingVisualState({
    hasContext: Boolean(contextWindow),
    usageRatio,
    compressed: Boolean(contextWindow?.compressed),
  });
  const circleTone = ringVisual.tone;
  const tooltipTitle = contextWindow
    ? t("status.contextWindow.titleActive", {
        percent: formatPct(usageRatio),
      })
    : t("status.contextWindow.titleIdle");
  const usedTokensCompact = contextWindow
    ? formatTokenCompact(contextWindow.usedInputTokens, locale)
    : null;
  const maxTokensCompact = inputBudgetTokens
    ? formatTokenCompact(inputBudgetTokens, locale)
    : null;
  const tooltipAria = contextWindow
    ? t("status.contextWindow.ariaActive", {
        percent: formatPct(usageRatio),
      })
    : t("status.contextWindow.ariaIdle");

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-mobile-caption pc:text-[11px] font-medium uppercase tracking-normal text-neutral-500 dark:text-neutral-400",
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" />
      <span>{t("pageTitle")}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={tooltipAria}
            className={cn(
              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full align-middle outline-none transition-[opacity,transform,filter] duration-200 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring",
              isStreaming && "opacity-95",
            )}
          >
            <span
              className="grid size-3.5 shrink-0 place-items-center rounded-full text-neutral-300 dark:text-neutral-700"
              style={{
                background: `conic-gradient(${circleTone} ${progressRatio * 360}deg, currentColor 0deg)`,
                filter: ringVisual.glow,
              }}
              aria-hidden="true"
            >
              <span className="size-2.5 rounded-full bg-background" />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={8}
          className="max-w-[260px] space-y-1.5 px-3 py-2 text-left"
        >
          <div className="font-medium">{tooltipTitle}</div>
          {contextWindow ? (
            <>
              <div className="text-mobile-caption pc:text-[11px] opacity-90">
                {t("status.contextWindow.usage", {
                  used: usedTokensCompact ?? "0",
                  max: maxTokensCompact ?? "0",
                })}
              </div>
              {contextWindow.compressed ? (
                <div className="text-mobile-caption pc:text-[11px] opacity-75">
                  {t("status.contextWindow.compressed", {
                    count: nf.format(contextWindow.compactedMessages),
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-mobile-caption pc:text-[11px] opacity-90">
              {t("status.contextWindow.idleDescription")}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
      <span className="text-neutral-300 dark:text-neutral-700">/</span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5",
          isStreaming
            ? "text-foreground"
            : "text-neutral-500 dark:text-neutral-400",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isStreaming ? "bg-primary" : "bg-neutral-300 dark:bg-neutral-600",
          )}
        />
        {isStreaming ? primaryStreamingLabel : t("status.ready")}
        {isStreaming && streamPhase === "model" && phaseLabel ? (
          <>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <span className="text-mobile-caption pc:text-[11px] font-medium normal-case tracking-normal text-neutral-600 dark:text-neutral-300">
              {phaseLabel}
            </span>
          </>
        ) : null}
        {isStreaming && streamPhase === "tool_run" && toolHint ? (
          <>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <span
              className="max-w-[min(200px,40vw)] truncate font-mono normal-case tracking-normal text-mobile-unit pc:text-[10px] text-neutral-500 dark:text-neutral-400"
              title={activeToolName ?? undefined}
            >
              {toolHint}
            </span>
          </>
        ) : null}
      </span>
    </div>
  );
}
