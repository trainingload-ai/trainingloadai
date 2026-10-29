"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import type { PlanWorkoutDisplayKind } from "@/components/plan/detail/plan-detail-utils";
import { getWeekWorkoutCardChrome } from "@/components/plan/detail/plan-detail-utils";
import {
  getLocalizedActivityTitle,
  getLocalizedDemoWorkoutNote,
} from "@/lib/activity-title";
import { cn } from "@/lib/utils";

export type PlanWorkoutRowSport = "run" | "bike" | "swim" | "other";

export type PlanWorkoutFocusMetric = {
  label: string;
  value: ReactNode;
};

export function planWorkoutRowSport(
  sportType: string | null | undefined,
): PlanWorkoutRowSport {
  switch (String(sportType ?? "").toUpperCase()) {
    case "CYCLING":
      return "bike";
    case "SWIM":
      return "swim";
    case "RUN":
      return "run";
    default:
      return "other";
  }
}

function statusPillClassName(displayKind: PlanWorkoutDisplayKind) {
  if (displayKind === "done") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/35 dark:text-emerald-200";
  }
  if (displayKind === "incomplete") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  }
  if (displayKind === "inProgress") {
    return "bg-sky-100 text-sky-800 dark:bg-sky-900/35 dark:text-sky-200";
  }
  if (displayKind === "moved") {
    return "bg-violet-100 text-violet-700 dark:bg-violet-900/35 dark:text-violet-200";
  }
  return "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300";
}

/**
 * iOS WorkoutFocusRow 在 Web 的共用壳层。
 * 首页、计划和日历只负责准备各自的数据，信息层级和状态表现保持一致。
 */
export function PlanWorkoutListRow({
  ariaLabel,
  chart,
  dateLabel,
  dayLabel,
  displayKind,
  footerActions,
  footerLeading,
  footerVisibility = "always",
  loadBadge,
  meta,
  metrics,
  onOpen,
  sessionLabel,
  statusLabel,
  subtitle,
  title,
}: {
  ariaLabel?: string;
  chart?: ReactNode;
  dateLabel?: string;
  dayLabel?: string;
  displayKind: PlanWorkoutDisplayKind;
  footerActions?: ReactNode;
  footerLeading?: ReactNode;
  /** iOS 首页卡片把训练操作收进详情 Sheet；桌面端仍可保留快捷操作。 */
  footerVisibility?: "always" | "desktop";
  loadBadge?: ReactNode;
  meta?: string | null;
  metrics?: readonly PlanWorkoutFocusMetric[];
  onOpen?: () => void;
  sessionLabel?: string;
  statusLabel?: string;
  subtitle?: string | null;
  title: string;
}) {
  const tActivityTitle = useTranslations("ActivityTitle");
  const localizedTitle = getLocalizedActivityTitle(
    { title },
    tActivityTitle,
    title,
  );
  const localizedSubtitle = getLocalizedDemoWorkoutNote(
    subtitle,
    tActivityTitle,
  );
  const showDate = Boolean(dayLabel || dateLabel);
  const showFooter = Boolean(footerLeading || footerActions);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-surface p-3 text-left transition-colors pc:p-2.5",
        getWeekWorkoutCardChrome(displayKind),
      )}
    >
      <button
        type="button"
        disabled={!onOpen}
        aria-label={ariaLabel ?? localizedTitle}
        onClick={onOpen}
        className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default"
      />

      <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-3 pc:gap-2.5">
        {showDate ? (
          <div className="flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-control-lg bg-background/70 dark:bg-black/20 pc:h-12 pc:w-14 pc:rounded-control">
            <span className="whitespace-nowrap px-1 text-[10px] font-medium uppercase text-muted-foreground">
              {dayLabel}
            </span>
            <span className="whitespace-nowrap px-1 text-base font-semibold tabular-nums text-foreground pc:text-[13px]">
              {dateLabel ?? "--"}
            </span>
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base font-semibold leading-5 text-foreground pc:text-sm">
              {localizedTitle}
            </h3>
            {sessionLabel ? (
              <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                {sessionLabel}
              </span>
            ) : null}
          </div>
          {localizedSubtitle ? (
            <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-muted-foreground pc:line-clamp-1 pc:text-xs">
              {localizedSubtitle}
            </p>
          ) : null}
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
              {meta}
            </span>
            {loadBadge ? <span className="shrink-0">{loadBadge}</span> : null}
            {statusLabel ? (
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  statusPillClassName(displayKind),
                )}
              >
                {statusLabel}
              </span>
            ) : null}
          </div>
        </div>

        {chart ? <div className="shrink-0">{chart}</div> : null}
      </div>

      {metrics?.length ? (
        <div className="pointer-events-none relative z-10 mt-3 grid grid-cols-3 divide-x divide-border/60 overflow-hidden rounded-control bg-background/70 dark:bg-black/20 pc:mt-2">
          {metrics.slice(0, 3).map((metric) => (
            <div
              key={metric.label}
              className="min-w-0 px-2 py-2 text-center pc:py-1.5"
            >
              <div className="truncate text-[10px] text-muted-foreground">
                {metric.label}
              </div>
              <div className="mt-0.5 truncate text-[13px] font-semibold tabular-nums text-foreground pc:text-xs">
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {showFooter ? (
        <div
          className={cn(
            "pointer-events-none relative z-10 mt-2 min-w-0 items-center gap-2 border-t border-border/50 pt-2",
            footerVisibility === "desktop" ? "hidden pc:flex" : "flex",
          )}
        >
          <div className="min-w-0 flex-1">{footerLeading}</div>
          <div className="ml-auto flex shrink-0 items-center justify-end gap-1">
            {footerActions}
          </div>
        </div>
      ) : null}
    </article>
  );
}
