"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import CalendarHeader from "./CalendarHeader";
import { CalendarStage } from "./CalendarStage";

export function CalendarMonthView({
  header,
  grid,
  compact,
  className,
}: {
  header: ComponentProps<typeof CalendarHeader>;
  grid: ComponentProps<typeof CalendarStage>;
  compact?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("@container flex min-h-0 min-w-0 flex-1 flex-col gap-3", className)}>
      <CalendarHeader {...header} />
      {compact ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain @min-[35rem]:hidden">
          {compact}
        </div>
      ) : null}
      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", compact && "hidden @min-[35rem]:flex")}>
        <CalendarStage {...grid} />
      </div>
    </div>
  );
}
