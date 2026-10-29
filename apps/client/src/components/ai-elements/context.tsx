"use client";

// AI Elements Context composition, adapted for the product. See NOTICE.
// Popover (instead of hover-only content) supports touch, Enter and Escape.
// Only measured/estimated values supplied by the caller are shown; no cost model.
import { createContext, useContext, useMemo, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const UsageContext = createContext<{
  usedTokens: number;
  maxTokens: number;
} | null>(null);

export function Context({
  usedTokens,
  maxTokens,
  ...props
}: ComponentProps<typeof Popover> & {
  usedTokens: number;
  maxTokens: number;
}) {
  const value = useMemo(
    () => ({ usedTokens, maxTokens }),
    [usedTokens, maxTokens],
  );
  return (
    <UsageContext.Provider value={value}>
      <Popover {...props} />
    </UsageContext.Provider>
  );
}

function useUsage() {
  const value = useContext(UsageContext);
  if (!value) throw new Error("Context components require Context");
  const ratio = value.maxTokens > 0 ? value.usedTokens / value.maxTokens : 0;
  return {
    ...value,
    percent: Number.isFinite(ratio)
      ? Math.min(100, Math.max(0, ratio * 100))
      : 0,
  };
}

export function ContextTrigger({
  children,
  className,
  ...props
}: ComponentProps<typeof Button>) {
  const { percent } = useUsage();
  return (
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="compact"
        className={cn("gap-1.5 text-muted-foreground", className)}
        {...props}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="size-3.5 -rotate-90"
        >
          <circle
            cx="10"
            cy="10"
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity=".2"
          />
          <circle
            cx="10"
            cy="10"
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            pathLength="100"
            strokeDasharray={`${percent} 100`}
          />
        </svg>
        {children ?? `${Math.round(percent)}%`}
      </Button>
    </PopoverTrigger>
  );
}

export function ContextContent({
  className,
  ...props
}: ComponentProps<typeof PopoverContent>) {
  return (
    <PopoverContent
      side="top"
      align="end"
      collisionPadding={12}
      className={cn(
        "w-80 max-w-[calc(100vw-24px)] overflow-hidden rounded-overlay pc:rounded-xs border-0 p-0 shadow-md ring-1 ring-border/40",
        className,
      )}
      {...props}
    />
  );
}

export function ContextContentHeader({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div className={cn("space-y-2 p-4 pb-3", className)} {...props}>
      {children}
    </div>
  );
}

export function ContextUsageBar(props: ComponentProps<"div">) {
  const { percent } = useUsage();
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      {...props}
      className={cn(
        "h-1.5 overflow-hidden rounded-full bg-muted",
        props.className,
      )}
    >
      <div
        className="h-full bg-foreground/65"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function ContextContentBody({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div className={cn("space-y-2 px-4 pb-4 text-xs", className)} {...props} />
  );
}

export function ContextContentFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-muted/60 px-4 py-3 text-xs leading-5 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
