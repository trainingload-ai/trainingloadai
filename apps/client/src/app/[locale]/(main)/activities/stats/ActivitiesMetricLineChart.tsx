"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useActivityMetricSummary } from "@/api/charts";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { dayjs } from "@/lib/dayjs-tz";
import { useStore } from "@/lib/store";
import {
  activitiesStatsChartConfig,
  formatActivityTooltipValue,
  formatActivityYAxisTick,
  isAverageMetric,
  toActivityChartValue,
  type SupportedMetricKey,
} from "../components/ActivitiesStats/activities-stats-model";

export type ChartGranularity = "day" | "week" | "month";

function formatChartPeriodLabel({
  date,
  granularity,
  locale,
}: {
  date: dayjs.Dayjs;
  granularity: ChartGranularity;
  locale: string;
}) {
  if (granularity === "month") {
    return locale === "zh" ? date.format("M月") : date.format("MMM");
  }
  return locale === "zh" ? date.format("M/D") : date.format("MMM D");
}

function getChartBucketStart(date: dayjs.Dayjs, granularity: ChartGranularity) {
  if (granularity === "month") return date.startOf("month");
  if (granularity === "week") return date.startOf("week");
  return date.startOf("day");
}

export function buildActivityMetricChartRows({
  rows,
  granularity,
  metricKey,
  systemUnit,
  locale,
}: {
  rows: Array<{ time: string; value: number }> | undefined;
  granularity: ChartGranularity;
  metricKey: SupportedMetricKey;
  systemUnit: "metric" | "imperial";
  locale: string;
}) {
  const byPeriod = new Map<
    string,
    { date: dayjs.Dayjs; sum: number; count: number }
  >();

  for (const row of rows ?? []) {
    const date = dayjs(row.time);
    if (!date.isValid()) continue;
    const bucketStart = getChartBucketStart(date, granularity);
    const key = bucketStart.format("YYYY-MM-DD");
    const current = byPeriod.get(key) ?? {
      date: bucketStart,
      sum: 0,
      count: 0,
    };
    current.sum += row.value;
    if (row.value > 0) current.count += 1;
    byPeriod.set(key, current);
  }

  return Array.from(byPeriod.values())
    .sort((a, b) => a.date.valueOf() - b.date.valueOf())
    .map((aggregate) => {
      const raw = isAverageMetric(metricKey)
        ? aggregate.count > 0
          ? aggregate.sum / aggregate.count
          : 0
        : aggregate.sum;

      return {
        period: formatChartPeriodLabel({
          date: aggregate.date,
          granularity,
          locale,
        }),
        [metricKey]: toActivityChartValue(raw, metricKey, systemUnit),
      };
    });
}

export function ActivitiesMetricLineChart({
  granularity,
  metricKey,
  year,
}: {
  granularity: ChartGranularity;
  metricKey: SupportedMetricKey;
  year: number;
}) {
  const locale = useLocale();
  const { activitiesFilters, systemUnit } = useStore();
  const selectedSportType = activitiesFilters.selectedSportType;
  const start = React.useMemo(
    () => dayjs(`${year}-01-01`).startOf("day"),
    [year],
  );
  const end = React.useMemo(() => {
    const yearEnd = dayjs(`${year}-12-31`).endOf("day");
    const today = dayjs().endOf("day");
    return yearEnd.isAfter(today) ? today : yearEnd;
  }, [year]);
  const { data, isLoading } = useActivityMetricSummary(metricKey, {
    start: start.toISOString(),
    end: end.toISOString(),
    sportType: selectedSportType,
    mode: "range",
  });
  const chartRows = React.useMemo(
    () =>
      buildActivityMetricChartRows({
        rows: data?.rows,
        granularity,
        metricKey,
        systemUnit,
        locale,
      }),
    [data?.rows, granularity, locale, metricKey, systemUnit],
  );

  return (
    <Card className="rounded-surface border-0 bg-muted pc:border pc:border-border/70 pc:bg-card">
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[260px] w-full animate-none rounded-md bg-neutral-100 dark:bg-muted/45" />
        ) : (
          <ChartContainer
            config={activitiesStatsChartConfig}
            className="h-[260px] w-full"
          >
            <LineChart
              data={chartRows}
              margin={{ top: 14, right: 16, left: -16, bottom: 16 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                className="stroke-muted"
              />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={24}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  formatActivityYAxisTick(value, metricKey)
                }
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) =>
                      formatActivityTooltipValue(value, metricKey, systemUnit)
                    }
                  />
                }
              />
              <Line
                type="monotone"
                dataKey={metricKey}
                stroke={`var(--color-${metricKey})`}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
