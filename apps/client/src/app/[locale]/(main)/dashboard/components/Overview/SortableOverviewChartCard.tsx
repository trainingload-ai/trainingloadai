"use client";

import React from "react";
import { GripHorizontal, Minus, Plus, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslations } from "next-intl";
import type {
  DashboardOverviewChartSpan,
  DashboardOverviewMetricKey,
} from "@/hooks/useDashboardOverviewConfig";
import { getOverviewChartSpanClass } from "./overview-model";

function increaseSpan(
  span: DashboardOverviewChartSpan,
): DashboardOverviewChartSpan {
  return span === 1 ? 2 : 2;
}

function decreaseSpan(
  span: DashboardOverviewChartSpan,
): DashboardOverviewChartSpan {
  return span === 2 ? 1 : 1;
}

export function SortableOverviewChartCard({
  metricKey,
  span,
  onSpanChange,
  onRemove,
  children,
}: {
  metricKey: DashboardOverviewMetricKey;
  span: DashboardOverviewChartSpan;
  onSpanChange: (span: DashboardOverviewChartSpan) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("dashboard.overview");
  const isMobile = useIsMobile();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: metricKey });

  const transformNoScale = transform
    ? { ...transform, scaleX: 1, scaleY: 1 }
    : null;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transformNoScale),
    transition: isDragging ? undefined : transition,
  };

  const hoverRevealClass = isMobile
    ? "opacity-100 scale-100"
    : "opacity-0 group-hover:opacity-100 transition-all duration-150 group-hover:scale-100 scale-95";

  const hoverRevealOpacityClass = isMobile
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100 transition-opacity";

  const canDecrease = span > 1;
  const canIncrease = span < 2;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative overflow-visible select-none group cursor-move touch-none will-change-transform",
        getOverviewChartSpanClass(span),
        isDragging && "opacity-70",
      )}
      {...attributes}
      {...listeners}
    >
      <div
        className={cn(
          "absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none",
          hoverRevealOpacityClass,
        )}
      >
        <div className="flex h-5 items-center rounded-md border border-border/60 bg-background/90 px-1.5 backdrop-blur-sm">
          <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      <button
        type="button"
        className={cn(
          "absolute -left-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-border/60 bg-background/90 backdrop-blur-sm hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-muted",
          hoverRevealClass,
        )}
        disabled={!canDecrease}
        onClick={(e) => {
          e.stopPropagation();
          onSpanChange(decreaseSpan(span));
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        aria-label={t("shrinkChart")}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        className={cn(
          "absolute -right-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-border/60 bg-background/90 backdrop-blur-sm hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-muted",
          hoverRevealClass,
        )}
        disabled={!canIncrease}
        onClick={(e) => {
          e.stopPropagation();
          onSpanChange(increaseSpan(span));
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        aria-label={t("expandChart")}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        className={cn(
          "absolute right-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 backdrop-blur-sm hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          hoverRevealOpacityClass,
        )}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        aria-label={t("removeChart")}
      >
        <X className="h-3.5 w-3.5 text-destructive" />
      </button>

      {children}
    </div>
  );
}
