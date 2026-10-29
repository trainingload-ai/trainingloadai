"use client";

import React from "react";
import { GripHorizontal, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { DashboardOverviewMetricKey } from "@/hooks/useDashboardOverviewConfig";

export function SortableOverviewStat({
  metricKey,
  children,
  onRemove,
}: {
  metricKey: DashboardOverviewMetricKey;
  children: React.ReactNode;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: metricKey,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      <div className="absolute top-1 right-1 z-20 flex items-center gap-1">
        <button
          type="button"
          className="flex items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 p-1 backdrop-blur-sm hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <X className="h-3.5 w-3.5 text-destructive" />
        </button>
        <button
          type="button"
          className="flex cursor-grab items-center justify-center rounded-md border border-border/60 bg-background/90 p-1 backdrop-blur-sm hover:bg-neutral-200 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-muted"
          {...attributes}
          {...listeners}
          onClick={(event) => event.stopPropagation()}
        >
          <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className={cn(isDragging && "opacity-60")}>{children}</div>
    </div>
  );
}
