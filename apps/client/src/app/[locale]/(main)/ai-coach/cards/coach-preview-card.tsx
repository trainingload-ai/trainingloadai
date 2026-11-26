"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CoachPreviewCard({ title, subtitle, icon: Icon, actionLabel, onOpen, children, actions }: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  actionLabel?: string;
  onOpen?: () => void;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article className={cn(
      "relative w-full min-w-0 space-y-3 rounded-control bg-muted/75 p-3",
      onOpen && "hover:bg-muted",
    )}>
      <header className="flex items-start gap-2.5">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold">
            {onOpen ? (
              <button type="button" onClick={onOpen}
                className="text-start after:absolute after:inset-0 after:rounded-control focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
                {title}{actionLabel ? <span className="sr-only"> · {actionLabel}</span> : null}
              </button>
            ) : title}
          </h3>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {onOpen ? <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
      </header>
      {children}
      {actions ? <footer className="relative z-10 w-fit max-w-full">{actions}</footer> : null}
    </article>
  );
}

export function CoachPreviewMetrics({ items }: { items: readonly { label: string; value: ReactNode }[] }) {
  if (!items.length) return null;
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,5.25rem),1fr))] gap-2">
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0 rounded-control bg-background/65 px-2.5 py-2">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 break-words text-sm font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
