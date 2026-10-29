"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { useStore } from "@/lib/store";
import type { OverviewSummaryKey } from "./overview-model";
import {
  bucketAdditiveComparisonPoints,
  comparisonDelta,
  isAdditiveSummaryMetric,
  summarizeComparisonSeries,
  type SummaryComparisonPoint,
} from "./summary-comparison-model";

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateRange(
  start: string,
  end: string | undefined,
  locale: string,
) {
  const startLabel = formatDate(start, locale);
  if (!end || end === start) return startLabel;
  return `${startLabel}–${formatDate(end, locale)}`;
}

function formatMetric(
  metricKey: OverviewSummaryKey,
  value: number,
  systemUnit: "metric" | "imperial",
) {
  return {
    value: formatValue(value, metricKey, systemUnit),
    unit: getUnit(metricKey, systemUnit),
  };
}

function formatDelta(
  metricKey: OverviewSummaryKey,
  delta: number,
  systemUnit: "metric" | "imperial",
) {
  const formatted = formatMetric(metricKey, Math.abs(delta), systemUnit);
  const sign = Math.abs(delta) < Number.EPSILON ? "±" : delta > 0 ? "+" : "−";
  return `${sign}${formatted.value}${formatted.unit ? ` ${formatted.unit}` : ""}`;
}

function SummaryTooltip({
  active,
  payload,
  metricKey,
  locale,
  systemUnit,
  primaryColor,
  comparisonColor,
  currentLabel,
  comparisonLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SummaryComparisonPoint }>;
  metricKey: OverviewSummaryKey;
  locale: string;
  systemUnit: "metric" | "imperial";
  primaryColor: string;
  comparisonColor: string;
  currentLabel: string;
  comparisonLabel: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  const rows = [
    {
      color: primaryColor,
      date: formatDateRange(point.time, point.timeEnd, locale),
      label: currentLabel,
      value: point.current,
    },
    {
      color: comparisonColor,
      date: formatDateRange(point.previousTime, point.previousTimeEnd, locale),
      label: comparisonLabel,
      value: point.previous,
    },
  ];

  return (
    <div className="grid min-w-40 gap-1.5 rounded-md border border-border/70 bg-card/95 px-2.5 py-1.5 text-mobile-caption shadow-xl backdrop-blur pc:text-xs">
      {rows.map((row) => {
        const formatted =
          row.value == null
            ? null
            : formatMetric(metricKey, row.value, systemUnit);
        return (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-micro"
                style={{ backgroundColor: row.color }}
              />
              <span className="truncate">
                {row.label} · {row.date}
              </span>
            </span>
            <span className="shrink-0 font-mono font-medium tabular-nums text-foreground">
              {formatted
                ? `${formatted.value}${formatted.unit ? ` ${formatted.unit}` : ""}`
                : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function SummaryMetricComparisonChart({
  data,
  metricKey,
  primaryColor,
  comparisonColor,
}: {
  data: SummaryComparisonPoint[];
  metricKey: OverviewSummaryKey;
  primaryColor: string;
  comparisonColor: string;
}) {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const { systemUnit } = useStore();
  const additive = isAdditiveSummaryMetric(metricKey);
  const chartData = additive ? bucketAdditiveComparisonPoints(data) : data;
  const currentSummary = summarizeComparisonSeries(
    metricKey,
    data.map((point) => point.current),
  );
  const previousSummary = summarizeComparisonSeries(
    metricKey,
    data.map((point) => point.previous),
  );
  const delta = comparisonDelta(currentSummary, previousSummary);
  const currentFormatted =
    currentSummary == null
      ? null
      : formatMetric(metricKey, currentSummary, systemUnit);
  const previousFormatted =
    previousSummary == null
      ? null
      : formatMetric(metricKey, previousSummary, systemUnit);
  const ariaLabel = [
    `${t("current")}: ${currentFormatted?.value ?? "—"} ${currentFormatted?.unit ?? ""}`,
    `${t("comparison")}: ${previousFormatted?.value ?? "—"} ${previousFormatted?.unit ?? ""}`,
    delta == null ? null : formatDelta(metricKey, delta, systemUnit),
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <div className="flex h-full flex-col px-1 pb-1 pt-0.5">
      <div className="flex min-h-12 items-end justify-between gap-3 px-2 pb-1">
        <div className="min-w-0">
          <div className="text-mobile-unit font-medium text-muted-foreground pc:text-[10px]">
            {t("current")}
            {!additive ? ` · ${t("average")}` : ""}
          </div>
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate font-mono text-xl font-semibold tabular-nums text-foreground md:text-2xl">
              {currentFormatted?.value ?? "—"}
            </span>
            {currentFormatted?.unit ? (
              <span className="shrink-0 text-mobile-caption text-muted-foreground pc:text-xs">
                {currentFormatted.unit}
              </span>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 pb-0.5 text-right text-mobile-unit text-muted-foreground pc:text-[10px]">
          <div className="truncate">
            {t("comparison")}{" "}
            <span className="font-mono tabular-nums text-foreground/75">
              {previousFormatted?.value ?? "—"}
              {previousFormatted?.unit ? ` ${previousFormatted.unit}` : ""}
            </span>
          </div>
          {delta == null ? null : (
            <div className="mt-0.5 font-mono font-medium tabular-nums text-foreground/80">
              {formatDelta(metricKey, delta, systemUnit)}
            </div>
          )}
        </div>
      </div>
      <div
        className="relative min-h-0 flex-1"
        role="img"
        aria-label={ariaLabel}
      >
        <ResponsiveContainer width="100%" height="100%">
          {additive ? (
            <BarChart
              accessibilityLayer
              data={chartData}
              barCategoryGap="30%"
              barGap={3}
              margin={{ top: 8, right: 8, bottom: 4, left: 2 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                height={28}
                interval={0}
                tickFormatter={(value: string) => formatDate(value, locale)}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={44}
                domain={[0, "auto"]}
                tickFormatter={(value: number) =>
                  formatValue(value, metricKey, systemUnit)
                }
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", fillOpacity: 0.35 }}
                content={({ active, payload }) => (
                  <SummaryTooltip
                    active={active}
                    payload={
                      payload as Array<{ payload?: SummaryComparisonPoint }>
                    }
                    metricKey={metricKey}
                    locale={locale}
                    systemUnit={systemUnit}
                    primaryColor={primaryColor}
                    comparisonColor={comparisonColor}
                    currentLabel={t("current")}
                    comparisonLabel={t("comparison")}
                  />
                )}
              />
              <Bar
                dataKey="previous"
                fill={comparisonColor}
                fillOpacity={0.32}
                maxBarSize={12}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="current"
                fill={primaryColor}
                maxBarSize={12}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          ) : (
            <ComposedChart
              accessibilityLayer
              data={chartData}
              margin={{ top: 8, right: 8, bottom: 4, left: 2 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                height={28}
                interval={0}
                tickFormatter={(value: string) => formatDate(value, locale)}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={44}
                domain={["auto", "auto"]}
                tickFormatter={(value: number) =>
                  formatValue(value, metricKey, systemUnit)
                }
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <Tooltip
                cursor={{
                  stroke: "var(--border)",
                  strokeDasharray: "3 3",
                  strokeOpacity: 0.9,
                }}
                content={({ active, payload }) => (
                  <SummaryTooltip
                    active={active}
                    payload={
                      payload as Array<{ payload?: SummaryComparisonPoint }>
                    }
                    metricKey={metricKey}
                    locale={locale}
                    systemUnit={systemUnit}
                    primaryColor={primaryColor}
                    comparisonColor={comparisonColor}
                    currentLabel={t("current")}
                    comparisonLabel={t("comparison")}
                  />
                )}
              />
              {previousSummary == null ? null : (
                <ReferenceLine
                  y={previousSummary}
                  stroke={comparisonColor}
                  strokeDasharray="5 4"
                  strokeOpacity={0.85}
                  ifOverflow="extendDomain"
                />
              )}
              <Line
                type="linear"
                dataKey="current"
                stroke="transparent"
                strokeWidth={0}
                dot={{
                  r: 3.5,
                  fill: primaryColor,
                  stroke: "var(--card)",
                  strokeWidth: 1.5,
                }}
                activeDot={{ r: 5, fill: primaryColor, strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="previous"
                stroke="transparent"
                strokeWidth={0}
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
