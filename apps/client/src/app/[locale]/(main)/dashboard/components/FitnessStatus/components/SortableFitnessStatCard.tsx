"use client";

import React from "react";
import { ChevronRight, GripHorizontal, Minus, Plus, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslations } from "next-intl";
import type {
  FitnessStatusMetricKey,
  FitnessStatusMetricSpan,
} from "@/hooks/useFitnessStatusConfig";
import { FitnessStatusStatCard } from "./FitnessStatusStatCard";
import { clampSpan, getSpanClass } from "../fitness-status-layout";

export { clampSpan, getSpanClass } from "../fitness-status-layout";

export type FitnessStatCard = {
  key: FitnessStatusMetricKey;
  title: string;
  value: string;
  secondaryValue?: string;
  unit: string;
  description: string;
  details: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  onClick?: () => void;
};

function increaseSpan(span: FitnessStatusMetricSpan): FitnessStatusMetricSpan {
  if (span === 1) return 2;
  if (span === 2) return 4;
  return 4;
}

function decreaseSpan(span: FitnessStatusMetricSpan): FitnessStatusMetricSpan {
  if (span === 4) return 2;
  if (span === 2) return 1;
  return 1;
}

export function SortableFitnessStatCard({
  stat,
  span,
  onSpanChange,
  onRemove,
  subContent,
  showSpanControls = true,
}: {
  stat: FitnessStatCard;
  span: FitnessStatusMetricSpan;
  onSpanChange: (span: FitnessStatusMetricSpan) => void;
  onRemove?: () => void;
  subContent: React.ReactNode;
  /** 为 false 时隐藏宽度 ± 按钮（仅竖向单列布局时使用） */
  showSpanControls?: boolean;
}) {
  const t = useTranslations("dashboard.fitnessStatus");
  const isMobile = useIsMobile();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stat.key });

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative overflow-visible select-none group cursor-move touch-none will-change-transform",
        getSpanClass(clampSpan(span, 4)),
        isDragging && "opacity-70",
      )}
      {...attributes}
      {...listeners}
    >
      {/* 拖拽按钮 */}
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
      {showSpanControls ? (
        <>
          {/* 改变大小操作 */}
          <button
            type="button"
            className={cn(
              "absolute -left-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-border/60 bg-background/90 backdrop-blur-sm hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-muted",
              hoverRevealClass,
            )}
            onClick={(e) => {
              e.stopPropagation();
              onSpanChange(decreaseSpan(span));
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cn(
              "absolute -right-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-border/60 bg-background/90 backdrop-blur-sm hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-muted",
              hoverRevealClass,
            )}
            onClick={(e) => {
              e.stopPropagation();
              onSpanChange(increaseSpan(span));
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}
      {/* 移除按钮 */}
      {onRemove ? (
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
          aria-label={t("remove")}
        >
          <X className="h-3.5 w-3.5 text-destructive" />
        </button>
      ) : null}

      <FitnessStatusStatCard
        stat={stat}
        subContent={subContent}
        rightAccessory={
          <button
            type="button"
            className="text-muted-foreground p-1 rounded-full opacity-0 pointer-events-none"
            tabIndex={-1}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        }
      />
    </div>
  );
}
