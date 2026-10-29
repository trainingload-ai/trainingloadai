"use client";

import * as React from "react";
import { Tool, ToolHeader, ToolContent } from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";

/** The execution row owns disclosure; its result must not add another toggle. */
export const CoachCardDetailsContext = React.createContext(false);

export type CoachCardTone =
  | "neutral"
  | "success"
  | "info"
  | "warning"
  | "danger";

type CoachCardProps = {
  tone?: CoachCardTone;
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  dense?: boolean;
  /** Existing chart compatibility; semantic icons replace decorative edges. */
  showAccent?: boolean;
  appearance?: "card" | "strip";
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  toggleAriaLabel?: string;
  /** Omit redundant headings when the Timeline row and body already label it. */
  hideDetailsHeader?: boolean;
  className?: string;
  contentClassName?: string;
};

/** AI Elements Tool surface; business actions remain in their domain cards. */
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
  hideDetailsHeader = false,
  className,
  contentClassName,
}: CoachCardProps) {
  const detailsOnly = React.useContext(CoachCardDetailsContext);
  const compact = dense || appearance === "strip";
  const titleBlock = (
    <>
      {icon ? (
        <span
          aria-hidden
          className={cn(
            "shrink-0 self-start pt-0.5 text-muted-foreground [&_svg]:size-4",
            tone === "danger" && "text-destructive",
            tone === "warning" && "text-amber-700 dark:text-amber-400",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className={cn("min-w-0 text-left", !collapsible && "flex-1")}>
        <span
          className={cn(
            "block break-words text-sm leading-5",
            collapsible
              ? "font-normal text-muted-foreground"
              : "font-medium text-foreground",
          )}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );
  const footerNode = footer ? (
    <footer
      className={cn(
        "flex flex-wrap items-center justify-end gap-2",
        children != null && "pt-1",
      )}
    >
      {footer}
    </footer>
  ) : null;
  const panel = (
    <>
      {children}
      {footerNode}
    </>
  );
  const header = (
    <header className="flex min-w-0 items-start gap-2">
      {collapsible ? (
        <ToolHeader aria-label={toggleAriaLabel}>{titleBlock}</ToolHeader>
      ) : (
        <div
          className={cn(
            "flex min-w-0 flex-1 items-start gap-2.5",
            compact ? "p-3" : "p-4",
          )}
        >
          {titleBlock}
        </div>
      )}
      {headerRight ? (
        <div className="flex max-w-[40%] shrink-0 flex-wrap items-center justify-end gap-1.5 py-3 pr-3 text-xs">
          {headerRight}
        </div>
      ) : null}
    </header>
  );
  const hasPanel = children != null || Boolean(footer);
  if (detailsOnly)
    return (
      <section
        data-coach-card="details"
        aria-label={
          hideDetailsHeader && typeof title === "string" ? title : undefined
        }
        className={cn(
          "not-prose min-w-0 space-y-3 rounded-md bg-neutral-100 p-3 text-foreground dark:bg-muted/45",
          className,
        )}
      >
        {!hideDetailsHeader ? (
          <header className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {title}
              {subtitle ? <span className="mt-1 block">{subtitle}</span> : null}
            </span>
            {headerRight}
          </header>
        ) : null}
        <div className={cn("space-y-3", contentClassName)}>{panel}</div>
      </section>
    );
  if (collapsible)
    return (
      <Tool asChild defaultOpen={!defaultCollapsed} className={className}>
        <section data-coach-card="collapsible">
          {header}
          {hasPanel ? (
            <ToolContent className={contentClassName}>{panel}</ToolContent>
          ) : null}
        </section>
      </Tool>
    );
  return (
    <section
      data-coach-card="result"
      className={cn(
        "not-prose w-full min-w-0 overflow-hidden rounded-md bg-neutral-100 dark:bg-muted/45",
        className,
      )}
    >
      {header}
      {hasPanel ? (
        <div
          className={cn(
            "space-y-4",
            compact ? "px-3 pb-3" : "px-4 pb-4",
            contentClassName,
          )}
        >
          {panel}
        </div>
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
      <span className="min-w-0 flex-1 break-words text-right text-foreground">
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
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3",
        className,
      )}
    >
      {items.map((item, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs leading-5 text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
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
