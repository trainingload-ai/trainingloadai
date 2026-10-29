"use client";

import { Activity, ChevronRight, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DemoMetricChartCard } from "@/components/charts/demo-metric-chart-card";
import { getMetricChartComparisonColor } from "@/lib/metric-chart-colors";

import type { DashboardDemoCopy, DashboardDemoStat } from "./types";

/** 镜像 client FitnessStatusStatCard */
export function DashboardDemoStatCard({
  stat,
  interactive,
  onOpen,
}: {
  stat: DashboardDemoStat;
  interactive?: boolean;
  onOpen?: () => void;
}) {
  const Icon = stat.icon;
  const cardClassName = cn(
    "relative overflow-hidden border-0 bg-neutral-100 p-2 shadow-none dark:bg-muted/45",
    interactive &&
      "cursor-pointer transition-colors hover:bg-neutral-200 dark:hover:bg-muted",
  );

  const content = (
    <>
      <div className="flex flex-row items-center justify-between space-y-0 p-2">
        <div className="text-sm font-medium">{stat.title}</div>
        <div className={cn("rounded-full p-1.5", stat.bgColor)}>
          <Icon className={cn("h-4 w-4", stat.color)} />
        </div>
      </div>
      <CardContent className="lg:p-2">
        <div className="mt-2 sm:mt-6">
          <div className="text-2xl font-bold">
            {stat.value}
            {stat.unit ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {stat.unit}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{stat.detail}</span>
            {interactive ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            ) : null}
          </div>
        </div>
      </CardContent>
    </>
  );

  if (interactive && onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn(cardClassName, "w-full text-left")}
      >
        {content}
      </button>
    );
  }

  return <Card className={cardClassName}>{content}</Card>;
}

/** 镜像 client ChartContainer + OverviewMetricChart 静态版 */
export function DashboardDemoChartCard({
  title,
  accentColor,
  icon,
  data,
  id,
  interactive = false,
  onOpen,
}: DashboardDemoCopy["payload"]["charts"][number] & {
  interactive?: boolean;
  onOpen?: () => void;
}) {
  const chart = (
    <DemoMetricChartCard
      className="h-[260px] md:h-[290px]"
      title={title}
      accentColor={accentColor}
      comparisonColor={getMetricChartComparisonColor(id)}
      icon={icon}
      data={data}
      interactive={interactive}
    />
  );

  if (interactive && onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="w-full cursor-pointer text-left transition-opacity hover:opacity-95"
      >
        {chart}
      </button>
    );
  }

  return chart;
}

export function DashboardDemoSubHeader({ copy }: { copy: DashboardDemoCopy }) {
  const { sportFilter, editLabel } = copy.payload;
  return (
    <div className="mb-1">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-compact bg-neutral-100 px-2.5 py-2 dark:bg-muted/45">
        <div className="inline-flex h-8 items-center gap-2 rounded-compact bg-background px-3 text-xs font-medium">
          <Activity className="size-3.5 text-muted-foreground" />
          {sportFilter}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className="inline-flex h-8 gap-1.5 px-3 text-xs font-medium"
        >
          <SlidersHorizontal className="size-3.5" />
          {editLabel}
        </Button>
      </div>
    </div>
  );
}

export function DashboardDemoFitnessGrid({
  copy,
  interactive,
  onOpenStat,
}: {
  copy: DashboardDemoCopy;
  interactive?: boolean;
  onOpenStat?: (stat: DashboardDemoStat) => void;
}) {
  return (
    <section className="mb-6">
      <div className="grid grid-cols-4 gap-4">
        {copy.payload.stats.map((stat) => (
          <DashboardDemoStatCard
            key={stat.key}
            stat={stat}
            interactive={interactive}
            onOpen={
              interactive && onOpenStat ? () => onOpenStat(stat) : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

export function DashboardDemoOverviewGrid({
  copy,
  interactive = false,
  onOpenChart,
}: {
  copy: DashboardDemoCopy;
  interactive?: boolean;
  onOpenChart?: (chartId: string) => void;
}) {
  return (
    <section className="min-h-0 flex-1">
      <div className="mb-3 flex flex-row items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {copy.overview.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            {copy.overview.recent30Days}
          </p>
        </div>
      </div>
      <div className="grid min-h-0 grid-cols-2 gap-3">
        {copy.payload.charts.map((chart) => (
          <DashboardDemoChartCard
            key={chart.id}
            {...chart}
            interactive={interactive}
            onOpen={
              interactive && onOpenChart
                ? () => onOpenChart(chart.id)
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
