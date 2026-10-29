"use client";

import type { ComponentType, ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { DemoChartArea } from "./demo-chart-area";
import type { DemoChartPoint } from "./demo-chart-data";

export function DemoMetricChartCard({
  title,
  accentColor,
  icon: Icon,
  data,
  rangeLabel = "30d",
  comparisonColor,
  showComparison = true,
  showAverageLines = true,
  height = "min-h-0 flex-1",
  titleLeading,
  className,
  interactive = true,
}: {
  title: string;
  accentColor?: string;
  comparisonColor?: string;
  icon?: ComponentType<{ className?: string }>;
  data: DemoChartPoint[];
  rangeLabel?: string;
  showComparison?: boolean;
  showAverageLines?: boolean;
  height?: string;
  titleLeading?: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden border-border/70",
        className,
      )}
    >
      <CardContent className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5 md:gap-2 md:p-2">
        <div className="flex min-h-6 items-center justify-between gap-2 px-1 md:min-h-7 md:px-0">
          <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
            {titleLeading ? (
              titleLeading
            ) : Icon ? (
              <div
                className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-compact md:flex"
                style={{
                  backgroundColor: accentColor ? `${accentColor}14` : undefined,
                  color: accentColor,
                }}
              >
                <Icon className="h-4 w-4" />
              </div>
            ) : null}
            <span className="min-w-0 truncate text-xs font-medium leading-5 text-foreground/80 md:text-sm">
              {title}
            </span>
          </div>
          {rangeLabel ? (
            <span className="rounded-compact bg-neutral-100 px-2 py-1 text-[10px] text-muted-foreground dark:bg-muted/45">
              {rangeLabel}
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            height,
            "relative overflow-hidden rounded-compact bg-neutral-50/80 dark:bg-muted/45",
            !interactive && "pointer-events-none",
          )}
        >
          <DemoChartArea
            data={data}
            primaryColor={accentColor}
            comparisonColor={comparisonColor}
            showComparison={showComparison}
            showAverageLines={showAverageLines}
            interactive={interactive}
          />
        </div>
      </CardContent>
    </Card>
  );
}
