"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type CoachCardTone =
  | "neutral"
  | "success"
  | "info"
  | "warning"
  | "danger";

const TONE_ACCENT: Record<CoachCardTone, string> = {
  neutral: "bg-foreground/15",
  success: "bg-emerald-500/70 dark:bg-emerald-400/70",
  info: "bg-sky-500/70 dark:bg-sky-400/70",
  warning: "bg-amber-500/80 dark:bg-amber-400/80",
  danger: "bg-rose-500/70 dark:bg-rose-400/70",
};

const TONE_ICON_BG: Record<CoachCardTone, string> = {
  neutral: "bg-background text-foreground/70",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  danger: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

type CoachCardProps = {
  tone?: CoachCardTone;
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  dense?: boolean;
  appearance?: "card" | "strip";
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  toggleAriaLabel?: string;
  className?: string;
};

function CoachCardRoot({
  tone = "neutral",
  icon,
  title,
  subtitle,
  headerRight,
  children,
  footer,
  dense = false,
  appearance = "card",
  collapsible = false,
  defaultCollapsed = false,
  toggleAriaLabel,
  className,
}: CoachCardProps) {
  const panelId = React.useId();
  const [expanded, setExpanded] = React.useState(!defaultCollapsed);
  const showPanel = !collapsible || expanded;
  const isStrip = appearance === "strip";

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-compact",
        isStrip
          ? "border border-border/50 bg-neutral-50/55 px-3 py-2 dark:bg-muted/20"
          : "bg-neutral-100 dark:bg-muted/45",
        !isStrip && (dense ? "p-2.5 sm:p-3" : "p-2 sm:p-3"),
        className,
      )}
    >
      {!isStrip ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-0.5",
            TONE_ACCENT[tone],
          )}
        />
      ) : null}
      <header
        className={cn(
          "flex items-center",
          isStrip ? "gap-2" : "gap-3",
          collapsible &&
            cn(
              "cursor-pointer rounded-compact transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isStrip ? "hover:bg-background/35" : "hover:bg-background/45",
            ),
        )}
        role={collapsible ? "button" : undefined}
        tabIndex={collapsible ? 0 : undefined}
        aria-expanded={collapsible ? expanded : undefined}
        aria-controls={collapsible ? panelId : undefined}
        onClick={
          collapsible
            ? () => {
                setExpanded((v) => !v);
              }
            : undefined
        }
        onKeyDown={
          collapsible
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setExpanded((v) => !v);
                }
              }
            : undefined
        }
      >
        {icon ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-compact",
              isStrip
                ? "h-5 w-5 text-muted-foreground/90 [&_svg]:h-3 [&_svg]:w-3"
                : "h-7 w-7",
              !isStrip && TONE_ICON_BG[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3
              className={cn(
                "min-w-0 flex-1 text-foreground",
                isStrip
                  ? "text-[11px] font-medium text-muted-foreground/90"
                  : "text-sm sm:text-[15px]",
              )}
            >
              {title}
            </h3>
            <div className="flex shrink-0 items-center gap-1.5">
              {headerRight}
              {collapsible ? (
                <button
                  type="button"
                  className={cn(
                    "inline-flex shrink-0 items-center justify-center rounded-compact",
                    isStrip ? "h-5 w-5" : "h-7 w-7",
                    "text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  )}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  aria-label={toggleAriaLabel ?? "Show or hide card details"}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpanded((v) => !v);
                  }}
                >
                  <ChevronDown
                    className={cn(
                      "transition-transform duration-200",
                      isStrip ? "h-3 w-3" : "h-4 w-4",
                      isStrip
                        ? expanded
                          ? "rotate-180"
                          : "rotate-0"
                        : expanded
                          ? "rotate-0"
                          : "-rotate-90",
                    )}
                    aria-hidden
                  />
                </button>
              ) : null}
            </div>
          </div>
          {subtitle ? (
            <p
              className={cn(
                "mt-0.5 text-xs leading-5 text-muted-foreground",
                isStrip && "text-[11px] leading-4 text-muted-foreground/80",
              )}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      </header>

      {showPanel && children !== undefined && children !== null ? (
        <div
          id={collapsible ? panelId : undefined}
          className={cn(isStrip ? "mt-2" : dense ? "mt-2" : "mt-3")}
        >
          {children}
        </div>
      ) : null}

      {showPanel && footer ? (
        <footer
          className={cn(
            "mt-3 flex flex-col-reverse gap-2 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:justify-end",
          )}
        >
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

function CoachCardMetaRow({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 text-xs leading-5",
        className,
      )}
    >
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-foreground">
        {children}
      </span>
    </div>
  );
}

function CoachCardStatGrid({
  items,
  className,
}: {
  items: Array<{ label: React.ReactNode; value: React.ReactNode }>;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3", className)}>
      {items.map((it, i) => (
        <div
          key={i}
          className="rounded-compact bg-background/70 px-2.5 py-2 dark:bg-background/40"
        >
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {it.label}
          </div>
          <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function CoachCardSectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-xs font-medium text-muted-foreground", className)}>
      {children}
    </div>
  );
}

export const CoachCard = Object.assign(CoachCardRoot, {
  MetaRow: CoachCardMetaRow,
  StatGrid: CoachCardStatGrid,
  SectionTitle: CoachCardSectionTitle,
});
