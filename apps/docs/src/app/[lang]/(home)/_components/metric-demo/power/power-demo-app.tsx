"use client";

import dayjs from "dayjs";
import { memo, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import { useTheme } from "next-themes";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useUplotDomTooltip } from "@/components/charts/uplot/useUplotDomTooltip";
import { createInnerYAxisTickDesign } from "@/components/charts/uplot/uPlotPlugins";
import {
  DEFAULT_LEGEND,
  DEFAULT_PADDING,
} from "@/components/charts/uplot/uPlotConfig";
import { useElementSize } from "@/components/charts/uplot/useElementSize";
import { resolveDemoCopy } from "@/lib/demo-i18n";
import { cn } from "@/lib/utils";

import { metricDemoCopy } from "../copy";
import {
  DEMO_POWER_MAXIMUM,
  DEMO_POWER_PROFILE,
  DEMO_POWER_ROWS,
  DEMO_POWER_ZONES,
} from "../demo-fixtures";
import { DemoChartContainer } from "../shared/demo-chart-container";
import { DemoDurationTable } from "../shared/demo-duration-table";
import { DemoIndexedCurveChart } from "../shared/demo-indexed-curve-chart";
import { DemoPowerPageLayout } from "../shared/demo-page-layouts";
import { DemoZonesChart } from "../shared/demo-zones-chart";
import { useDemoFilters } from "../shared/demo-sub-header";
import {
  DEMO_UPLOT_CURSOR,
  renderDemoTooltipHtml,
} from "../shared/demo-uplot-interactive";
import {
  CHART_SERIES_COLORS,
  POWER_DURATION_KEYS,
  type DemoTimeKey,
} from "../shared/demo-types";

const MemoUplotReact = memo(UplotReact);

function PowerMaximumChart({
  title,
  data,
  bucketLabels,
}: {
  title: string;
  data: Array<{ time: string; value: number }>;
  bucketLabels: { day: string; week: string; month: string };
}) {
  const [bucket, setBucket] = useState<"day" | "week" | "month">("week");
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const filteredPoints = useMemo(() => {
    return bucket === "month"
      ? data.filter((_, index) => index % 4 === 0)
      : bucket === "day"
        ? data.slice(-14)
        : data;
  }, [bucket, data]);

  const plotData = useMemo(() => {
    return [
      filteredPoints.map((point) => dayjs(point.time).unix()),
      filteredPoints.map((point) => point.value),
    ] as uPlot.AlignedData;
  }, [filteredPoints]);

  const { plugin: tooltipPlugin, tooltip } = useUplotDomTooltip({
    wrapperRef: chartWrapperRef,
    render: ({ idx, contentEl }) => {
      const point = filteredPoints[idx];
      if (!point) return;
      contentEl.innerHTML = renderDemoTooltipHtml(
        dayjs(point.time).format("YYYY-MM-DD"),
        [
          {
            label: title,
            color: CHART_SERIES_COLORS[0],
            value: `${Math.round(point.value)} W`,
          },
        ],
      );
    },
  });

  const options = useMemo((): uPlot.Options | null => {
    if (size.width <= 0 || size.height <= 0) return null;
    const { axes, plugins } = createInnerYAxisTickDesign({
      axisStroke: isDark ? "#a3a3a3" : "#737373",
      gridStroke: isDark ? "#404040" : "#e5e5e5",
      tickCount: 4,
      fontSizePx: 12,
      formatXValue: (value) => dayjs(value * 1000).format("MM-DD"),
      formatYValue: (value) => `${Math.round(value)} W`,
    });
    return {
      width: size.width,
      height: size.height,
      padding: DEFAULT_PADDING,
      plugins: [...plugins, tooltipPlugin],
      axes,
      series: [
        {},
        {
          stroke: CHART_SERIES_COLORS[0],
          width: 2,
          paths: uPlot.paths.spline!(),
        },
      ],
      cursor: DEMO_UPLOT_CURSOR,
      legend: DEFAULT_LEGEND,
    };
  }, [size, isDark, tooltipPlugin]);

  return (
    <DemoChartContainer
      title={title}
      tools={
        <div className="flex gap-1">
          {(["day", "week", "month"] as const).map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={bucket === key ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setBucket(key)}
            >
              {bucketLabels[key]}
            </Button>
          ))}
        </div>
      }
    >
      <div ref={containerRef} className="relative h-full w-full">
        <div ref={chartWrapperRef} className="relative h-full w-full">
          {options ? (
            <MemoUplotReact options={options} data={plotData} />
          ) : null}
          {tooltip}
        </div>
      </div>
    </DemoChartContainer>
  );
}

function PowerProfilePanel({ copy }: { copy: (typeof metricDemoCopy)["en"] }) {
  const grid = [
    [14.5, 10.8, 7.2, 5.8],
    [12.8, 9.6, 6.4, 5.1],
    [11.2, 8.4, 5.6, 4.5],
    [9.8, 7.3, 4.9, 3.9],
    [8.5, 6.3, 4.2, 3.4],
    [7.2, 5.4, 3.6, 2.9],
    [6.0, 4.5, 3.0, 2.4],
    [4.8, 3.6, 2.4, 1.9],
    [3.6, 2.7, 1.8, 1.4],
  ];
  const durations = ["5s", "1m", "5m", "FTP"] as const;
  const user = DEMO_POWER_PROFILE.userWkg;

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        {copy.power.profile.riderType}: {DEMO_POWER_PROFILE.riderType}
      </div>
      <div className="overflow-hidden rounded-compact border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              {durations.map((duration) => (
                <TableHead key={duration}>
                  {copy.power.profile.durations[duration]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {grid.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                <TableCell className="font-medium">
                  {copy.power.profile.levels[rowIndex]}
                </TableCell>
                {row.map((value, colIndex) => {
                  const duration = durations[colIndex]!;
                  const userValue = user[duration];
                  const highlight =
                    userValue != null && Math.abs(userValue - value) < 0.6;
                  return (
                    <TableCell
                      key={`${rowIndex}-${colIndex}`}
                      className={cn(
                        "font-mono tabular-nums",
                        highlight &&
                          "bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300",
                      )}
                    >
                      {value.toFixed(1)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function PowerDemoApp({ lang }: { lang: string }) {
  const copy = resolveDemoCopy(metricDemoCopy, lang);
  const filters = useDemoFilters({ sportType: "all" });
  const [activeTab, setActiveTab] = useState("curve");

  const timeLabels = Object.fromEntries(
    copy.timeOptions.map((option) => [option.key, option.label]),
  ) as Record<DemoTimeKey, string>;

  const activeRows = DEMO_POWER_ROWS.filter((row) =>
    filters.times.includes(row.timeKey),
  );

  const segmentLabels = POWER_DURATION_KEYS.map((key) => ({
    key,
    label:
      copy.power.table[
        key === "5s"
          ? "fiveSeconds"
          : key === "30s"
            ? "thirtySeconds"
            : key === "1m"
              ? "oneMinute"
              : key === "3m"
                ? "threeMinutes"
                : key === "5m"
                  ? "fiveMinutes"
                  : key === "20m"
                    ? "twentyMinutes"
                    : key === "60m"
                      ? "sixtyMinutes"
                      : key === "2h"
                        ? "twoHours"
                        : "threeHours"
      ],
  }));

  const chartSeries = activeRows.map((row, index) => ({
    key: row.timeKey,
    label: timeLabels[row.timeKey],
    color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]!,
    values: POWER_DURATION_KEYS.map((key) => row[key]),
  }));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 pb-2 md:gap-3">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <DemoPowerPageLayout
          activeTab={activeTab}
          sportType={filters.sportType}
          sportOptions={copy.sportOptions}
          onSportChange={filters.setSportType}
          times={filters.times}
          timeOptions={copy.timeOptions}
          onToggleTime={filters.toggleTime}
          tabs={[
            { value: "curve", label: copy.power.tabs.curve },
            { value: "maximum", label: copy.power.tabs.maximum },
            { value: "zones", label: copy.power.tabs.zones },
            { value: "profile", label: copy.power.tabs.profile },
          ]}
        >
          <TabsContent value="curve">
            <div className="grid grid-cols-1 gap-6">
              <DemoDurationTable
                segmentLabels={segmentLabels}
                timeLabels={timeLabels}
                rowsByTime={activeRows}
                unit="W"
              />
              <DemoIndexedCurveChart
                title={copy.power.chartTitle}
                labels={segmentLabels.map((segment) => segment.label)}
                series={chartSeries}
                formatYValue={(value) => `${Math.round(value)} W`}
                referenceLines={[
                  {
                    value: DEMO_POWER_PROFILE.ftp,
                    color: "#3b82f6",
                    label: copy.power.ftp,
                  },
                  {
                    value: DEMO_POWER_PROFILE.cp,
                    color: "#9333ea",
                    label: copy.power.cp,
                  },
                ]}
                noDataLabel={copy.power.noData}
              />
            </div>
          </TabsContent>
          <TabsContent value="maximum">
            <PowerMaximumChart
              title={copy.power.maximumTitle}
              data={DEMO_POWER_MAXIMUM}
              bucketLabels={{
                day: copy.power.maximum.bucketDay,
                week: copy.power.maximum.bucketWeek,
                month: copy.power.maximum.bucketMonth,
              }}
            />
          </TabsContent>
          <TabsContent value="zones">
            <DemoZonesChart
              title={copy.power.zonesTitle}
              rows={DEMO_POWER_ZONES}
              timeLabels={timeLabels}
              activeTimes={filters.times}
              noDataLabel={copy.power.noData}
            />
          </TabsContent>
          <TabsContent value="profile">
            <DemoChartContainer title={copy.power.profileTitle}>
              <div className="h-full overflow-y-auto p-3">
                <PowerProfilePanel copy={copy} />
              </div>
            </DemoChartContainer>
          </TabsContent>
        </DemoPowerPageLayout>
      </Tabs>
    </div>
  );
}
