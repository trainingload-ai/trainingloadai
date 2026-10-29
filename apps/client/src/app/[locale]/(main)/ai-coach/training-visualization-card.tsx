"use client";

import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  isTrainingVisualizationV1,
  type TrainingAnalysisMeasure,
  type TrainingVisualizationSeries,
  type TrainingVisualizationV1,
} from "@shared/training-visualization";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { getMetricColor, getMetricColorRule } from "@/lib/chart-data-utils";
import { CoachCard } from "./cards/CoachCard";
import { isTrainingVisualizationV2 } from "@shared/training-exploration";
import { TrainingExplorationCard } from "./training-exploration-card";

const TRAINING_MEASURE_METRIC_KEYS: Record<
  Exclude<
    TrainingAnalysisMeasure,
    "RUNNING_LOAD" | "CYCLING_LOAD" | "SWIMMING_LOAD" | "OTHER_LOAD"
  >,
  string
> = {
  ACTIVITY_COUNT: "count",
  DURATION_MIN: "duration",
  DISTANCE_KM: "distance",
  AVG_SPEED_KMH: "speed",
  AVG_HEART_RATE: "heartRate",
  AVG_POWER: "power",
  DAILY_LOAD: "atl",
  ATL: "atl",
  CTL: "ctl",
  TSB: "tsb",
  CP: "cp",
  W_PRIME: "power",
  FTP: "ftp",
  MAX_HR: "maxHr",
  RESTING_HR: "restingHr",
  LTHR: "lthr",
  AET_HR: "heartRate",
  CS: "speed",
  TP: "pace",
  AET_PACE: "pace",
  VO2_MAX: "vo2Max",
  P_MAX: "power",
  WEIGHT: "neutral",
  HEIGHT: "distance",
};

function trainingMeasureTheme(key: TrainingAnalysisMeasure) {
  switch (key) {
    case "RUNNING_LOAD":
      return { light: "#10b981", dark: "#34d399" };
    case "CYCLING_LOAD":
      return { light: "#f97316", dark: "#fb923c" };
    case "SWIMMING_LOAD":
      return { light: "#06b6d4", dark: "#22d3ee" };
    case "OTHER_LOAD":
      return { light: "#f43f5e", dark: "#fb7185" };
    default: {
      const rule = getMetricColorRule(TRAINING_MEASURE_METRIC_KEYS[key]);
      return { light: rule.color, dark: rule.comparisonColor };
    }
  }
}

function trainingMeasureColor(key: TrainingAnalysisMeasure) {
  return trainingMeasureTheme(key).light;
}

function chartSeriesColor(key: TrainingAnalysisMeasure) {
  return `var(--color-${key})`;
}

function TrainingSeriesDot({ measure }: { measure: TrainingAnalysisMeasure }) {
  const theme = trainingMeasureTheme(measure);
  return (
    <span aria-hidden className="relative h-2 w-2 shrink-0">
      <span
        className="absolute inset-0 rounded-full dark:hidden"
        style={{ backgroundColor: theme.light }}
      />
      <span
        className="absolute inset-0 hidden rounded-full dark:block"
        style={{ backgroundColor: theme.dark }}
      />
    </span>
  );
}

const MAX_LINE_CHART_ROWS = 160;
const MAX_BAR_CHART_ROWS = 80;

function sampleChartRows(
  rows: TrainingVisualizationV1["rows"],
  maxRows: number,
) {
  if (rows.length <= maxRows) return rows;
  return Array.from(
    { length: maxRows },
    (_, index) => rows[Math.round((index * (rows.length - 1)) / (maxRows - 1))],
  );
}

function toChartRows(rows: TrainingVisualizationV1["rows"]) {
  return rows.map((row) => ({
    label: row.label,
    ...row.values,
  }));
}

function formatValue(value: unknown, unit: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const digits = Number.isInteger(value) ? 0 : value < 10 ? 2 : 1;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits })}${
    unit === "count" || unit === "load" ? "" : ` ${unit}`
  }`;
}

export function TrainingVisualizationContent({
  value,
}: {
  value: TrainingVisualizationV1;
}) {
  const t = useTranslations("AiCoachPage.trainingVisualization");
  const reduceMotion = useReducedMotion();
  const animateCharts = !reduceMotion && process.env.NODE_ENV !== "test";
  const areaGradientPrefix = `training-area-${useId().replace(/:/g, "")}`;
  const measureLabel = (measure: TrainingAnalysisMeasure) => {
    switch (measure) {
      case "ACTIVITY_COUNT":
        return t("measures.ACTIVITY_COUNT");
      case "DURATION_MIN":
        return t("measures.DURATION_MIN");
      case "DISTANCE_KM":
        return t("measures.DISTANCE_KM");
      case "AVG_SPEED_KMH":
        return t("measures.AVG_SPEED_KMH");
      case "AVG_HEART_RATE":
        return t("measures.AVG_HEART_RATE");
      case "AVG_POWER":
        return t("measures.AVG_POWER");
      case "DAILY_LOAD":
        return t("measures.DAILY_LOAD");
      case "ATL":
        return "ATL";
      case "CTL":
        return "CTL";
      case "TSB":
        return "TSB";
      case "RUNNING_LOAD":
        return t("measures.RUNNING_LOAD");
      case "CYCLING_LOAD":
        return t("measures.CYCLING_LOAD");
      case "SWIMMING_LOAD":
        return t("measures.SWIMMING_LOAD");
      case "OTHER_LOAD":
        return t("measures.OTHER_LOAD");
      default:
        return t(`measures.${measure}`);
    }
  };
  const series = value.series.map((item) => ({
    ...item,
    label: item.label || measureLabel(item.key),
  }));
  const config = Object.fromEntries(
    series.map((item) => [
      item.key,
      {
        label: item.label,
        theme: trainingMeasureTheme(item.key),
      },
    ]),
  ) satisfies ChartConfig;
  const maxChartRows =
    value.view === "BAR" || value.view === "STACKED_BAR"
      ? MAX_BAR_CHART_ROWS
      : MAX_LINE_CHART_ROWS;
  const chartRows = sampleChartRows(value.rows, maxChartRows);
  const data = toChartRows(chartRows);
  // History curves show changes in a state (weight, threshold…), unlike bars
  // whose lengths need a zero baseline. Keep the actual scale visible on Y.
  const historyDomain =
    value.provenance.source === "METRICS"
      ? ([min, max]: [number, number]): [number, number] => {
          const padding = Math.max(
            (max - min) * 0.2,
            Math.abs(max) * 0.005,
            0.1,
          );
          return [Math.max(0, min - padding), max + padding];
        }
      : undefined;
  const historyTick = historyDomain
    ? (number: number) => Number(number.toFixed(2)).toString()
    : undefined;
  const tooltipFormatter = (
    raw: unknown,
    name: unknown,
    item: { color?: string; dataKey?: string | number },
    index: number,
  ) => {
    const matchedSeries = series.find(
      (candidate) =>
        candidate.key === item.dataKey ||
        candidate.label === name ||
        candidate.key === name,
    );
    const label = matchedSeries?.label ?? String(name);
    const fallbackKey = matchedSeries?.key ?? series[index]?.key;
    const color =
      item.color ??
      (fallbackKey
        ? trainingMeasureColor(fallbackKey)
        : getMetricColor("neutral"));

    return (
      <div className="flex min-w-40 flex-1 items-center gap-2">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto pl-3 font-mono font-medium tabular-nums text-foreground">
          {formatValue(Number(raw), matchedSeries?.unit ?? "")}
        </span>
      </div>
    );
  };

  if (value.view === "METRIC_STRIP") {
    return (
      <CoachCard.StatGrid
        items={series.map((item) => ({
          label: item.label,
          value: formatValue(value.summary[item.key], item.unit),
        }))}
      />
    );
  }

  if (value.view === "TABLE" || data.length === 0) {
    return <TrainingVisualizationTable value={value} series={series} />;
  }

  const chart = (() => {
    if (value.view === "BAR" || value.view === "STACKED_BAR") {
      return (
        <BarChart
          accessibilityLayer
          data={data}
          margin={{ top: 12, right: 12, left: -8, bottom: 8 }}
          barCategoryGap="24%"
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            strokeOpacity={0.45}
            className="stroke-muted"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={20}
            tickMargin={8}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={38}
            tickCount={5}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <ChartTooltip
            cursor={{
              fill: "var(--muted-foreground)",
              fillOpacity: 0.05,
              radius: 6,
            }}
            content={
              <ChartTooltipContent
                formatter={tooltipFormatter}
                className="border-0 bg-background shadow-none backdrop-blur-none"
              />
            }
          />
          {series.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.label}
              fill={chartSeriesColor(item.key)}
              fillOpacity={0.68}
              activeBar={{ fillOpacity: 0.9, strokeWidth: 0 }}
              isAnimationActive={animateCharts}
              animationBegin={index * 70}
              animationDuration={680}
              animationEasing="ease-out"
              maxBarSize={34}
              stackId={value.view === "STACKED_BAR" ? "total" : undefined}
              radius={
                value.view === "STACKED_BAR" && index < series.length - 1
                  ? 0
                  : [4, 4, 0, 0]
              }
            />
          ))}
        </BarChart>
      );
    }
    if (value.view === "AREA") {
      return (
        <AreaChart
          accessibilityLayer
          data={data}
          margin={{ top: 12, right: 12, left: -8, bottom: 8 }}
        >
          <defs>
            {series.map((item) => (
              <linearGradient
                key={item.key}
                id={`${areaGradientPrefix}-${item.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor={chartSeriesColor(item.key)}
                  stopOpacity={0.2}
                />
                <stop
                  offset="95%"
                  stopColor={chartSeriesColor(item.key)}
                  stopOpacity={0}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            strokeOpacity={0.45}
            className="stroke-muted"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={20}
            tickMargin={8}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis
            domain={historyDomain}
            tickFormatter={historyTick}
            tickLine={false}
            axisLine={false}
            width={historyDomain ? 56 : 38}
            tickCount={5}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <ChartTooltip
            cursor={{
              stroke: "var(--muted-foreground)",
              strokeDasharray: "2 2",
              strokeOpacity: 0.7,
              strokeWidth: 2,
            }}
            content={
              <ChartTooltipContent
                formatter={tooltipFormatter}
                className="border-0 bg-background shadow-none backdrop-blur-none"
              />
            }
          />
          {series.map((item, index) => (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={chartSeriesColor(item.key)}
              fill={`url(#${areaGradientPrefix}-${item.key})`}
              fillOpacity={1}
              isAnimationActive={animateCharts}
              animationBegin={index * 80}
              animationDuration={880}
              animationEasing="ease-out"
              strokeWidth={index === 0 ? 2.5 : 2}
              strokeOpacity={index === 0 ? 0.92 : 0.76}
              strokeLinecap="round"
              strokeLinejoin="round"
              activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
              connectNulls={false}
            />
          ))}
        </AreaChart>
      );
    }
    return (
      <LineChart
        accessibilityLayer
        data={data}
        margin={{ top: 12, right: 12, left: -8, bottom: 8 }}
      >
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          strokeOpacity={0.45}
          className="stroke-muted"
        />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={20}
          tickMargin={8}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <YAxis
          domain={historyDomain}
          tickFormatter={historyTick}
          tickLine={false}
          axisLine={false}
          width={historyDomain ? 56 : 38}
          tickCount={5}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <ChartTooltip
          cursor={{
            stroke: "var(--muted-foreground)",
            strokeDasharray: "2 2",
            strokeOpacity: 0.7,
            strokeWidth: 2,
          }}
          content={
            <ChartTooltipContent
              formatter={tooltipFormatter}
              className="border-0 bg-background shadow-none backdrop-blur-none"
            />
          }
        />
        {series.map((item, index) => (
          <Line
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.label}
            stroke={chartSeriesColor(item.key)}
            strokeWidth={index === 0 ? 2.5 : 2}
            strokeOpacity={index === 0 ? 0.92 : 0.76}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            isAnimationActive={animateCharts}
            animationBegin={index * 80}
            animationDuration={880}
            animationEasing="ease-out"
            activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    );
  })();

  return (
    <motion.div
      className="min-w-0 space-y-2"
      initial={animateCharts ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      {value.view !== "SMALL_MULTIPLES" && series.length > 1 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-0.5 text-xs text-muted-foreground">
          {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <TrainingSeriesDot measure={item.key} />
              {item.label}
              {item.unit !== "load" && item.unit !== "count"
                ? ` (${item.unit})`
                : ""}
            </span>
          ))}
        </div>
      ) : null}
      {value.view === "SMALL_MULTIPLES" ? (
        <div className="grid min-w-0 gap-x-6 gap-y-4 md:grid-cols-2">
          {series.map((item, index) => (
            <div key={item.key} className="pt-2">
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                {item.label}
              </div>
              <ChartContainer
                config={config}
                role="img"
                aria-label={`${value.title} · ${item.label}`}
                className="h-[140px] w-full rounded-none bg-transparent dark:bg-transparent"
              >
                <LineChart
                  accessibilityLayer
                  data={data}
                  margin={{ top: 8, right: 8, left: -14, bottom: 4 }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    strokeOpacity={0.45}
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={18}
                    tick={{
                      fill: "var(--muted-foreground)",
                      fontSize: 10,
                    }}
                  />
                  <YAxis
                    domain={historyDomain}
                    tickFormatter={historyTick}
                    tickLine={false}
                    axisLine={false}
                    width={historyDomain ? 56 : 34}
                    tickCount={4}
                    tick={{
                      fill: "var(--muted-foreground)",
                      fontSize: 10,
                    }}
                  />
                  <ChartTooltip
                    cursor={{
                      stroke: "var(--muted-foreground)",
                      strokeDasharray: "2 2",
                      strokeOpacity: 0.7,
                      strokeWidth: 2,
                    }}
                    content={
                      <ChartTooltipContent
                        formatter={tooltipFormatter}
                        className="border-0 bg-background shadow-none backdrop-blur-none"
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey={item.key}
                    stroke={chartSeriesColor(item.key)}
                    strokeWidth={2.25}
                    strokeOpacity={0.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    isAnimationActive={animateCharts}
                    animationBegin={index * 70}
                    animationDuration={760}
                    animationEasing="ease-out"
                    activeDot={{
                      r: 5,
                      stroke: "var(--card)",
                      strokeWidth: 2,
                    }}
                    connectNulls={false}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          ))}
        </div>
      ) : (
        <ChartContainer
          config={config}
          role="img"
          aria-label={value.title}
          className="h-[220px] w-full rounded-none bg-transparent dark:bg-transparent"
        >
          {chart}
        </ChartContainer>
      )}
      {chartRows.length < value.rows.length ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {t("sampledData", {
            shown: chartRows.length,
            total: value.rows.length,
          })}
        </p>
      ) : null}
      <details className="pt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("showData")}
        </summary>
        <TrainingVisualizationTable value={value} series={series} />
      </details>
    </motion.div>
  );
}

function TrainingVisualizationTable({
  value,
  series,
}: {
  value: TrainingVisualizationV1;
  series: TrainingVisualizationSeries[];
}) {
  const t = useTranslations("AiCoachPage.trainingVisualization");
  const pageSize = 20;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(value.rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const startIndex = safePage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, value.rows.length);
  const visibleRows = value.rows.slice(startIndex, endIndex);

  return (
    <div className="w-full min-w-0 max-w-full space-y-2 pt-1">
      <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-md bg-background/60">
        <table className="w-full min-w-[360px] text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-2.5 py-2 font-medium">
                {value.x.label || t("bucket")}
              </th>
              {series.map((item) => (
                <th
                  key={item.key}
                  className="px-2.5 py-2 text-right font-medium"
                >
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.key} className="even:bg-muted/40">
                <td className="max-w-[220px] truncate px-2.5 py-2">
                  {row.label}
                </td>
                {series.map((item) => (
                  <td
                    key={item.key}
                    className="px-2.5 py-2 text-right tabular-nums"
                  >
                    {formatValue(row.values[item.key], item.unit)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {value.rows.length > pageSize ? (
        <div className="flex items-center justify-between gap-3 px-0.5">
          <span className="tabular-nums text-muted-foreground">
            {t("rowsRange", {
              start: startIndex + 1,
              end: endIndex,
              total: value.rows.length,
            })}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t("previousPage")}
              disabled={safePage === 0}
              onClick={() => setPage(Math.max(0, safePage - 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/70 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={t("nextPage")}
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/70 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TrainingVisualizationCoverageNote({
  value,
}: {
  value: TrainingVisualizationV1;
}) {
  const t = useTranslations("AiCoachPage.trainingVisualization");
  if (value.provenance.complete && !value.provenance.truncated) return null;
  return (
    <p className="pt-2 text-xs leading-5 text-muted-foreground">
      {t("partialData")}
    </p>
  );
}

export function TrainingVisualizationCard({ payload }: { payload: unknown }) {
  const t = useTranslations("AiCoachPage.trainingVisualization");
  if (isTrainingVisualizationV2(payload))
    return <TrainingExplorationCard value={payload} />;
  if (!isTrainingVisualizationV1(payload)) return null;
  const range = `${payload.provenance.from} → ${payload.provenance.to}`;
  const sourceLabel = payload.provenance.metricSource
    ? t(`sources.${payload.provenance.metricSource}`)
    : undefined;
  return (
    <CoachCard
      tone="neutral"
      icon={<BarChart3 className="h-4 w-4" />}
      title={payload.title}
      subtitle={[payload.subtitle, range, sourceLabel]
        .filter(Boolean)
        .join(" · ")}
      dense
      showAccent={false}
      className="w-full min-w-0 max-w-full"
    >
      <TrainingVisualizationContent value={payload} />
      <TrainingVisualizationCoverageNote value={payload} />
    </CoachCard>
  );
}
