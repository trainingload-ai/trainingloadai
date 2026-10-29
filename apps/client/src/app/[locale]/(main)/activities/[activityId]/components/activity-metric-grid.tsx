import React from "react";
import { cn } from "@/lib/utils";

interface ActivityMetricGridProps {
  children: React.ReactNode;
  desktopColumns: 3 | 4 | 5 | 6;
  className?: string;
  variant?: "divided" | "cards";
}

const desktopColumnClasses = {
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
  6: "md:grid-cols-6",
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
    <div
      className={cn(
        "grid grid-cols-2 items-stretch",
        variant === "divided" ? "overflow-hidden" : "gap-0 overflow-visible",
        variant === "cards"
          ? "overflow-hidden rounded-md bg-muted/55 md:grid-cols-3 xl:grid-cols-6"
          : desktopColumnClasses[desktopColumns],
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
              variant === "cards"
                ? "overflow-hidden bg-transparent"
                : [
                    "border-b border-r border-neutral-200/70 bg-card dark:border-neutral-800",
                    isMobileRowEnd && "border-r-0",
                    isLastRow(index, items.length, 2) && "border-b-0",
                    isDesktopRowEnd ? "md:border-r-0" : "md:border-r",
                    isLastRow(index, items.length, desktopColumns)
                      ? "md:border-b-0"
                      : "md:border-b",
                  ],
            )}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}
