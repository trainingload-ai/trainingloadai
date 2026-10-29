import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MetricPageShellProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function MetricPageShell({
  eyebrow,
  title,
  description,
  icon,
  action,
  children,
  className,
}: MetricPageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col gap-3 pb-3 md:gap-4",
        className,
      )}
    >
      <header className="rounded-md border border-border/70 bg-background/95 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                {icon}
              </div>
            ) : null}
            <div className="min-w-0">
              {eyebrow ? (
                <div className="text-mobile-caption pc:text-xs text-muted-foreground">{eyebrow}</div>
              ) : null}
              <h1 className="mt-1 truncate text-xl font-semibold tracking-normal text-foreground md:text-2xl">
                {title}
              </h1>
              {description ? (
                <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </header>
      {children}
    </div>
  );
}
