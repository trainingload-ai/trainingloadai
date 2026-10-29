"use client";

import type { ReactNode } from "react";
import { GripHorizontal, Minus, Plus, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  HomeOverviewChartSpan,
  HomeOverviewLayoutItem,
} from "@/hooks/useHomeMetricOverviewConfig";
import { cn } from "@/lib/utils";

export function homeOverviewSpanClass(span: HomeOverviewChartSpan) {
  return span === 2 ? "col-span-1 sm:col-span-2" : "col-span-1";
}

export function SortableHomeOverviewCard({
  item,
  labels,
  onRemove,
  onSpanChange,
  children,
}: {
  item: HomeOverviewLayoutItem;
  labels: { remove: string; expand: string; shrink: string };
  onRemove: () => void;
  onSpanChange: (span: HomeOverviewChartSpan) => void;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key });
  const transformWithoutScale = transform
    ? { ...transform, scaleX: 1, scaleY: 1 }
    : null;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transformWithoutScale),
        transition: isDragging ? undefined : transition,
      }}
      className={cn(
        "group relative cursor-move touch-none select-none overflow-visible",
        homeOverviewSpanClass(item.span),
        isDragging && "opacity-70",
      )}
      {...attributes}
      {...listeners}
    >
      <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex h-5 items-center rounded-md border border-border/60 bg-background/90 px-1.5 backdrop-blur-sm">
          <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
      <button
        type="button"
        disabled={item.span === 1}
        aria-label={labels.shrink}
        className="absolute -left-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-control border border-border/60 bg-background/90 opacity-0 backdrop-blur-sm transition-opacity hover:bg-muted disabled:pointer-events-none disabled:opacity-0 group-hover:opacity-100"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onSpanChange(1);
        }}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={item.span === 2}
        aria-label={labels.expand}
        className="absolute -right-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-control border border-border/60 bg-background/90 opacity-0 backdrop-blur-sm transition-opacity hover:bg-muted disabled:pointer-events-none disabled:opacity-0 group-hover:opacity-100"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onSpanChange(2);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label={labels.remove}
        className="absolute right-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 opacity-0 backdrop-blur-sm transition-opacity hover:bg-destructive/15 group-hover:opacity-100"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        <X className="h-3.5 w-3.5 text-destructive" />
      </button>
      {children}
    </div>
  );
}
