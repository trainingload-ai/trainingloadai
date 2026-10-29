"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ActualLoadSource,
  PlanLoadSource,
  PlanWorkoutLink,
} from "@/api/plans";

/**
 * 期望负荷 / 实际负荷 / 差额徽章
 * - DRAFT 期 estimatedLoad 为 null：直接不渲染
 * - 有 PRIMARY link 的 actualLoad：再加「→ 实际 Y（±Z%）」与跨轨道提示
 * - estimatedLoadSource = NONE：用 needThresholdsTip 提示
 */
export interface WorkoutLoadBadgeProps {
  estimatedLoad: number | null | undefined;
  estimatedLoadSource: PlanLoadSource | null | undefined;
  links?: PlanWorkoutLink[] | null;
  /** 主导轨道与次席接近时由 server 标 mixedSource */
  mixedSource?: boolean;
  /** 任一步骤为 partialEstimate 时由 server 标 partialEstimate */
  partialEstimate?: boolean;
  className?: string;
}

const ESTIMATED_BUCKET_TO_SOURCE: Record<PlanLoadSource, string> = {
  POWER: "POWER",
  HR: "HR",
  PACE: "PACE",
  RPE: "RPE",
  SESSION_RPE: "RPE",
  NONE: "NONE",
};

const ACTUAL_TO_BUCKET: Record<
  ActualLoadSource,
  "POWER" | "HR" | "PACE" | "RPE"
> = {
  POWER: "POWER",
  HEART_RATE: "HR",
  PACE: "PACE",
  SESSIONRPE: "RPE",
};

function formatLoad(value: number): string {
  return Math.round(value).toString();
}

function pickPrimaryLinkActual(
  links: PlanWorkoutLink[] | null | undefined,
): { actualLoad: number; actualLoadSource: ActualLoadSource | null } | null {
  if (!Array.isArray(links)) return null;
  for (const link of links) {
    if (link.role !== "PRIMARY") continue;
    if (link.unlinkedAt) continue;
    if (typeof link.actualLoad !== "number" || link.actualLoad <= 0) continue;
    return {
      actualLoad: link.actualLoad,
      actualLoadSource: link.actualLoadSource ?? null,
    };
  }
  return null;
}

export const WorkoutLoadBadge: React.FC<WorkoutLoadBadgeProps> = ({
  estimatedLoad,
  estimatedLoadSource,
  links,
  mixedSource,
  partialEstimate,
  className,
}) => {
  const t = useTranslations("WorkoutLoadEstimate");

  if (estimatedLoad == null) return null;

  const sourceKey = estimatedLoadSource ?? "NONE";
  const sourceLabel =
    sourceKey === "NONE"
      ? ""
      : t(
          `source.${ESTIMATED_BUCKET_TO_SOURCE[sourceKey] as "POWER" | "HR" | "PACE" | "RPE"}` as const,
        );

  const actual = pickPrimaryLinkActual(links);
  const expectedText = t("expected", { value: formatLoad(estimatedLoad) });

  const hasCrossSource =
    actual?.actualLoadSource &&
    sourceKey !== "NONE" &&
    sourceKey !== "RPE" &&
    ACTUAL_TO_BUCKET[actual.actualLoadSource] !== sourceKey;

  let deltaText: string | null = null;
  if (actual && estimatedLoad > 0) {
    const diffPct = Math.round(
      ((actual.actualLoad - estimatedLoad) / estimatedLoad) * 100,
    );
    const absPct = Math.abs(diffPct);
    deltaText =
      diffPct >= 0
        ? t("deltaAbove", { pct: absPct })
        : t("deltaBelow", { pct: absPct });
  }

  const needThreshold = sourceKey === "NONE";
  const tooltipParts: string[] = [];
  if (needThreshold) tooltipParts.push(t("needThresholdsTip"));
  if (partialEstimate) tooltipParts.push(t("partialEstimateTip"));
  if (mixedSource) tooltipParts.push(t("mixedSourceTip"));
  if (hasCrossSource && actual?.actualLoadSource) {
    tooltipParts.push(
      t("crossSourceTip", {
        expected: sourceLabel,
        actual: t(
          `source.${ACTUAL_TO_BUCKET[actual.actualLoadSource]}` as const,
        ),
      }),
    );
  }
  const tooltip = tooltipParts.join("\n");

  const badgeBody = (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-0.5 text-mobile-unit pc:text-[10px] font-medium text-muted-foreground dark:bg-muted/45 ${
        className ?? ""
      }`}
    >
      <span>{expectedText}</span>
      {sourceKey !== "NONE" ? (
        <span className="text-mobile-micro uppercase tracking-wide text-muted-foreground/80 pc:text-[9px]">
          {sourceLabel}
        </span>
      ) : null}
      {actual ? (
        <>
          <span className="text-muted-foreground/60">·</span>
          <span>{t("actual", { value: formatLoad(actual.actualLoad) })}</span>
          {deltaText ? (
            <span
              className={
                deltaText.startsWith("+") || deltaText.includes("+")
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }
            >
              {deltaText}
            </span>
          ) : null}
        </>
      ) : null}
      {tooltip ? <Info className="h-3 w-3 text-muted-foreground/70" /> : null}
    </span>
  );

  if (!tooltip) return badgeBody;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{badgeBody}</TooltipTrigger>
        <TooltipContent className="max-w-xs whitespace-pre-line text-mobile-caption pc:text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
