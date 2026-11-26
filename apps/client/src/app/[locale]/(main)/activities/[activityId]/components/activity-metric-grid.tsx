import React from "react";
import { cn } from "@/lib/utils";

interface ActivityMetricGridProps {
  children: React.ReactNode;
  desktopColumns: 3 | 4 | 5 | 6;
  className?: string;
  variant?: "divided" | "cards";
}

const desktopColumnClasses = {
  3: "@min-[42rem]/activity-metrics:grid-cols-3",
  4: "@min-[42rem]/activity-metrics:grid-cols-4",
  5: "@min-[42rem]/activity-metrics:grid-cols-5",
  6: "@min-[42rem]/activity-metrics:grid-cols-6",
} as const;

const isLastRow = (index: number, itemCount: number, columns: number) =>
  index >= Math.floor((itemCount - 1) / columns) * columns;

/**
 * Keeps metric-card separators aligned when cards wrap or are conditionally hidden.
 */
export function ActivityMetricGrid({
  children,
  desktopColumns,
  className,
  variant = "divided",
}: ActivityMetricGridProps) {
  const items = React.Children.toArray(children);

  return (
    <div className="@container/activity-metrics w-full min-w-0">
      <div
        className={cn(
          "grid grid-cols-2 items-stretch",
          variant === "cards"
            ? "rounded-md bg-muted/55 @min-[28rem]/activity-metrics:grid-cols-3 @min-[44rem]/activity-metrics:grid-cols-6"
            : ["overflow-hidden", desktopColumnClasses[desktopColumns]],
          className,
        )}
      >
        {items.map((item, index) => {
          const isMobileRowEnd = (index + 1) % 2 === 0;
          const isDesktopRowEnd = (index + 1) % desktopColumns === 0;
          const itemKey = React.isValidElement(item) ? item.key : null;

          return (
            <div
              key={itemKey ?? index}
              className={cn(
                "min-w-0",
                variant === "divided" && [
                  "border-b border-r border-neutral-200/70 bg-card dark:border-neutral-800",
                  isMobileRowEnd && "border-r-0",
                  isLastRow(index, items.length, 2) && "border-b-0",
                  isDesktopRowEnd
                    ? "@min-[42rem]/activity-metrics:border-r-0"
                    : "@min-[42rem]/activity-metrics:border-r",
                  isLastRow(index, items.length, desktopColumns)
                    ? "@min-[42rem]/activity-metrics:border-b-0"
                    : "@min-[42rem]/activity-metrics:border-b",
                ],
              )}
            >
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
}
