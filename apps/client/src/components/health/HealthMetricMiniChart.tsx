"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthIntradayResponse } from "@/api/health-data";
import type { HealthRangeDays } from "@/components/metrics/metric-chart-policy";
import {
  getMetricColor,
  getMetricComparisonColor,
} from "@/lib/chart-data-utils";
import {
  getHealthBaselineStatus,
  type HealthBaseline,
  type HealthChartPoint,
  type HealthOverviewCard,
} from "./health-overview-model";

type ComparisonPoint = HealthChartPoint & {
  comparisonValue?: number;
  comparisonMin?: number;
  comparisonMax?: number;
};

function formatDate(value: string, locale: string, includeYear = false) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    ...(includeYear ? { year: "numeric" as const } : {}),
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTime(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(seconds: number, locale: string) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return locale.startsWith("zh")
    ? `${hours}小时${rest}分`
    : `${hours}h ${rest}m`;
}

function formatPointValue(
  card: HealthOverviewCard,
  value: number,
  locale: string,
) {
  if (card.key === "sleep") return formatDuration(value, locale);
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: card.key === "spo2" ? 1 : 0,
  }).format(value);
  return card.latestUnit ? `${formatted} ${card.latestUnit}` : formatted;
}

function formatAxisValue(
  card: HealthOverviewCard,
  value: number,
  locale: string,
) {
  if (!Number.isFinite(value)) return "";
  if (card.key === "sleep") return `${Math.round(value / 3600)}h`;
  return new Intl.NumberFormat(locale, {
    notation: Math.abs(value) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: card.key === "spo2" ? 1 : 0,
  }).format(value);
}

function HealthTooltip({
  active,
  card,
  locale,
  point,
  intraday,
  baseline,
}: {
  active?: boolean;
  card: HealthOverviewCard;
  locale: string;
  point?: ComparisonPoint & { time?: string };
  intraday?: boolean;
  baseline?: HealthBaseline | null;
}) {
  if (!active || !point) return null;
  const labels = locale.startsWith("zh")
    ? {
        current: "本期",
        previous: "上期",
        range: "范围",
        baseline: "个人基线",
        totalSleep: "睡眠时长",
        core: "核心睡眠",
        deep: "深睡",
        rem: "REM",
        awake: "清醒",
      }
    : {
        current: "Current",
        previous: "Previous",
        range: "Range",
        baseline: "Personal baseline",
        totalSleep: "Sleep duration",
        core: "Core",
        deep: "Deep",
        rem: "REM",
        awake: "Awake",
      };
  const rows: Array<{ color: string; label: string; value: string }> = [];
  const accentColor = getMetricColor(card.key);
  const comparisonColor = getMetricComparisonColor(card.key);

  if (card.chartKind === "sleep") {
    if (point.value != null) {
      rows.push({
        color: accentColor,
        label: labels.totalSleep,
        value: formatDuration(point.value, locale),
      });
    }
    if (point.comparisonValue != null) {
      rows.push({
        color: comparisonColor,
        label: labels.previous,
        value: formatDuration(point.comparisonValue, locale),
      });
    }
    const stages = [
      ["core", point.core, "#60a5fa"],
      ["deep", point.deep, "#6366f1"],
      ["rem", point.rem, "#a78bfa"],
      ["awake", point.awake, "#fbbf24"],
    ] as const;
    for (const [key, value, color] of stages) {
      if (value == null) continue;
      rows.push({
        color,
        label: labels[key],
        value: formatDuration(value, locale),
      });
    }
  } else {
    if (point.value != null) {
      rows.push({
        color: accentColor,
        label: labels.current,
        value: formatPointValue(card, point.value, locale),
      });
    }
    if (point.comparisonValue != null) {
      rows.push({
        color: comparisonColor,
        label: labels.previous,
        value: formatPointValue(card, point.comparisonValue, locale),
      });
    }
    if (card.chartKind === "range" && point.min != null && point.max != null) {
      rows.push({
        color: accentColor,
        label: labels.range,
        value: `${formatPointValue(card, point.min, locale)} – ${formatPointValue(card, point.max, locale)}`,
      });
    }
  }

  if (baseline) {
    rows.push({
      color: comparisonColor,
      label: labels.baseline,
      value: `${formatPointValue(card, baseline.lower, locale)} – ${formatPointValue(card, baseline.upper, locale)}`,
    });
  }

  if (rows.length === 0) return null;
  return (
    <div className="grid min-w-32 gap-1.5 rounded-md border border-border/70 bg-card/95 px-2.5 py-1.5 text-mobile-caption pc:text-xs shadow-xl backdrop-blur">
      <div className="font-medium">
        {intraday && point.time
          ? formatTime(point.time, locale)
          : formatDate(point.date, locale, true)}
      </div>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-4"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <span
              className="h-2.5 w-2.5 rounded-micro"
              style={{ backgroundColor: row.color }}
            />
            {row.label}
          </span>
          <span className="font-mono font-medium tabular-nums text-foreground">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function alignDailyPoints(
  currentPoints: HealthChartPoint[],
  previousPoints: HealthChartPoint[],
): ComparisonPoint[] {
  return currentPoints.map((point, index) => {
    const previous = previousPoints[index];
    return {
      ...point,
      comparisonValue: previous?.value,
      comparisonMin: previous?.min,
      comparisonMax: previous?.max,
    };
  });
}

function alignIntradayPoints(intraday: HealthIntradayResponse) {
  const length = Math.max(intraday.current.length, intraday.previous.length);
  if (length === 0) return [];
  return Array.from({ length }, (_, index) => {
    const currentIndex =
      length === 1
        ? 0
        : Math.round((index / (length - 1)) * (intraday.current.length - 1));
    const previousIndex =
      length === 1
        ? 0
        : Math.round((index / (length - 1)) * (intraday.previous.length - 1));
    const current = intraday.current[currentIndex];
    const previous = intraday.previous[previousIndex];
    return {
      date: intraday.currentDate,
      time: current?.time ?? previous?.time ?? intraday.currentDate,
      value: current?.value,
      comparisonValue: previous?.value,
    };
  });
}

const SLEEP_STAGE_COLORS: Record<string, string> = {
  awake: "#fbbf24",
  rem: "#a78bfa",
  deep: "#6366f1",
  core: "#60a5fa",
  light: "#60a5fa",
  sleep: "#60a5fa",
};

function SleepIntradayTimeline({
  intraday,
  locale,
}: {
  intraday: HealthIntradayResponse;
  locale: string;
}) {
  const points = intraday.current;
  const [hoveredSegment, setHoveredSegment] = useState<{
    key: string;
    point: HealthIntradayResponse["current"][number];
    left: number;
  } | null>(null);
  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-mobile-caption pc:text-xs text-muted-foreground">
        {locale.startsWith("zh") ? "当天暂无明细数据" : "No intraday details"}
      </div>
    );
  }
  const start = Math.min(
    ...points.map((point) => new Date(point.time).getTime()),
  );
  const end = Math.max(
    ...points.map((point) => new Date(point.endTime ?? point.time).getTime()),
  );
  const span = Math.max(end - start, 1);
  const stageLabel = (stage?: string) => {
    const normalized = (stage ?? "sleep").toLowerCase();
    if (!locale.startsWith("zh")) return normalized;
    return (
      {
        awake: "清醒",
        rem: "REM",
        deep: "深睡",
        core: "核心睡眠",
        light: "浅睡",
        sleep: "睡眠",
        unmeasurable: "无法测量",
      }[normalized] ??
      stage ??
      "睡眠"
    );
  };
  const stageIndex = (stage?: string) => {
    const normalized = (stage ?? "sleep").toLowerCase();
    if (normalized === "awake") return 0;
    if (normalized === "rem") return 1;
    if (["core", "light", "sleep", "unmeasurable"].includes(normalized)) {
      return 2;
    }
    if (normalized === "deep") return 3;
    return 2;
  };
  const stageRows = locale.startsWith("zh")
    ? ["清醒", "REM", "浅睡", "深睡"]
    : ["Awake", "REM", "Light", "Deep"];
  const axisTicks = [start, start + span / 2, end];
  return (
    <div className="relative flex h-full flex-col px-3 pb-3 pt-4">
      {hoveredSegment ? (
        <div
          className="pointer-events-none absolute top-2 z-20 min-w-36 -translate-x-1/2 rounded-md border border-border/70 bg-card/95 px-2.5 py-1.5 text-mobile-caption pc:text-xs shadow-xl backdrop-blur"
          style={{ left: `${hoveredSegment.left}%` }}
        >
          <div className="font-medium">
            {formatDate(
              (intraday.current.length > 0
                ? intraday.currentDate
                : intraday.previousDate
              ).slice(0, 10),
              locale,
              true,
            )}
          </div>
          <div className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
            <span>{stageLabel(hoveredSegment.point.stage)}</span>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {formatDuration(hoveredSegment.point.value, locale)}
            </span>
          </div>
          <div className="mt-0.5 text-mobile-unit pc:text-[10px] text-muted-foreground">
            {formatTime(hoveredSegment.point.time, locale)} –{" "}
            {formatTime(
              hoveredSegment.point.endTime ?? hoveredSegment.point.time,
              locale,
            )}
          </div>
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-[3.5rem_1fr] gap-2">
        <div className="relative">
          {stageRows.map((label, index) => (
            <span
              key={label}
              className="absolute right-0 -translate-y-1/2 text-mobile-unit pc:text-[10px] text-muted-foreground md:text-mobile-caption"
              style={{ top: `${(index + 0.5) * 25}%` }}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="relative overflow-hidden rounded-xs border-l border-border/80 bg-muted/30">
          {stageRows.map((label, index) => (
            <span
              key={label}
              className="pointer-events-none absolute inset-x-0 border-t border-border/55"
              style={{ top: `${index * 25}%` }}
            />
          ))}
          {points.map((point, index) => {
            const pointStart = new Date(point.time).getTime();
            const pointEnd = new Date(point.endTime ?? point.time).getTime();
            const left = ((pointStart - start) / span) * 100;
            const width = Math.max(((pointEnd - pointStart) / span) * 100, 0.7);
            const key = `${point.time}-${index}`;
            const ariaLabel = `${stageLabel(point.stage)} ${formatTime(point.time, locale)} ${formatDuration(point.value, locale)}`;
            return (
              <button
                type="button"
                key={key}
                aria-label={ariaLabel}
                className="absolute cursor-crosshair border-r border-card/40 transition-[filter,box-shadow] hover:z-10 hover:brightness-110 hover:ring-2 hover:ring-foreground/30 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onMouseEnter={() =>
                  setHoveredSegment({
                    key,
                    point,
                    left: Math.min(84, Math.max(16, left + width / 2)),
                  })
                }
                onMouseLeave={() =>
                  setHoveredSegment((current) =>
                    current?.key === key ? null : current,
                  )
                }
                onFocus={() =>
                  setHoveredSegment({
                    key,
                    point,
                    left: Math.min(84, Math.max(16, left + width / 2)),
                  })
                }
                onBlur={() => setHoveredSegment(null)}
                style={{
                  left: `${left}%`,
                  top: `${stageIndex(point.stage) * 25 + 3}%`,
                  width: `${width}%`,
                  height: "19%",
                  backgroundColor:
                    SLEEP_STAGE_COLORS[
                      (point.stage ?? "sleep").toLowerCase()
                    ] ?? "#94a3b8",
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="relative ml-[4rem] h-5 border-t border-border/80 text-mobile-unit pc:text-[10px] text-muted-foreground">
        {axisTicks.map((tick, index) => (
          <span
            key={`${tick}-${index}`}
            className="absolute top-1 -translate-x-1/2 tabular-nums before:absolute before:-top-1 before:left-1/2 before:h-1 before:border-l before:border-border/80"
            style={{ left: `${index * 50}%` }}
          >
            {formatTime(new Date(tick).toISOString(), locale)}
          </span>
        ))}
      </div>
    </div>
  );
}

function averagePointValue(values: Array<number | undefined>) {
  let total = 0;
  let count = 0;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    total += value;
    count += 1;
  }
  return count > 0 ? total / count : undefined;
}

function OneDayValueSummary({
  card,
  locale,
  currentPoints,
  previousPoints,
  intraday,
}: {
  card: HealthOverviewCard;
  locale: string;
  currentPoints: HealthChartPoint[];
  previousPoints: HealthChartPoint[];
  intraday?: HealthIntradayResponse;
}) {
  const current =
    averagePointValue(intraday?.current.map((point) => point.value) ?? []) ??
    averagePointValue(currentPoints.map((point) => point.value));
  const previous =
    averagePointValue(intraday?.previous.map((point) => point.value) ?? []) ??
    averagePointValue(previousPoints.map((point) => point.value));
  const delta = current != null && previous != null ? current - previous : null;
  const arrow =
    delta == null || Math.abs(delta) < 0.05 ? "→" : delta > 0 ? "↑" : "↓";
  const date = intraday?.currentDate ?? currentPoints.at(-1)?.date;
  const comparisonLabel = locale.startsWith("zh") ? "环比" : "vs prior";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-4xl font-semibold tabular-nums text-foreground">
          {current == null
            ? "—"
            : new Intl.NumberFormat(locale, {
                maximumFractionDigits: 0,
              }).format(current)}
        </span>
        <span className="text-sm text-muted-foreground">{card.latestUnit}</span>
      </div>
      <div className="flex items-center gap-2 text-mobile-caption pc:text-xs text-muted-foreground">
        <span
          className="inline-flex min-w-7 items-center justify-center rounded-full bg-muted px-2 py-0.5 font-mono text-sm font-semibold text-foreground"
          aria-hidden="true"
        >
          {arrow}
        </span>
        <span>
          {delta == null
            ? locale.startsWith("zh")
              ? "暂无前一天数据"
              : "No previous-day data"
            : `${comparisonLabel} ${Math.abs(delta).toFixed(Math.abs(delta) >= 10 ? 0 : 1)} ${card.latestUnit}`}
        </span>
      </div>
      {date ? (
        <span className="text-mobile-caption pc:text-[11px] text-muted-foreground/80">
          {formatDate(date.slice(0, 10), locale, true)}
        </span>
      ) : null}
    </div>
  );
}

function BaselineDot({
  cx,
  cy,
  value,
  baseline,
  accentColor,
}: {
  cx?: number;
  cy?: number;
  value?: number;
  baseline?: HealthBaseline | null;
  accentColor: string;
}) {
  if (cx == null || cy == null || value == null) return null;
  const status = baseline ? getHealthBaselineStatus(value, baseline) : null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.75}
      fill={status === "within" ? accentColor : "hsl(var(--amber-500))"}
      stroke="var(--card)"
      strokeWidth={1.5}
    />
  );
}

export function HealthMetricMiniChart({
  card,
  locale,
  rangeDays,
  currentPoints,
  previousPoints,
  baseline,
  intraday,
}: {
  card: HealthOverviewCard;
  locale: string;
  rangeDays: HealthRangeDays;
  currentPoints: HealthChartPoint[];
  previousPoints: HealthChartPoint[];
  baseline?: HealthBaseline | null;
  intraday?: HealthIntradayResponse;
}) {
  const hasIntraday = intraday != null && intraday.current.length > 0;
  if (rangeDays === "1" && card.key === "sleep" && hasIntraday) {
    return <SleepIntradayTimeline intraday={intraday!} locale={locale} />;
  }
  if (
    rangeDays === "1" &&
    (card.key === "hrv" || card.key === "restingHeartRate")
  ) {
    return (
      <OneDayValueSummary
        card={card}
        locale={locale}
        currentPoints={currentPoints}
        previousPoints={previousPoints}
        intraday={intraday}
      />
    );
  }

  const isIntraday = rangeDays === "1" && hasIntraday;
  const usesPersonalBaseline =
    rangeDays !== "1" &&
    (card.key === "hrv" || card.key === "restingHeartRate");
  const data = usesPersonalBaseline
    ? currentPoints
    : isIntraday
      ? alignIntradayPoints(intraday!)
      : alignDailyPoints(currentPoints, previousPoints);
  const accentColor = getMetricColor(card.key);
  const comparisonColor = getMetricComparisonColor(card.key);
  const yDomain: [number | "auto", number | "auto"] =
    card.chartKind === "bar" || card.chartKind === "sleep"
      ? [0, "auto"]
      : ["auto", "auto"];
  const common = {
    data,
    margin: { top: 12, right: 12, bottom: 8, left: 8 },
  };
  const axis = [
    <CartesianGrid
      key="grid"
      vertical={false}
      stroke="var(--border)"
      strokeDasharray="3 3"
      strokeOpacity={0.55}
    />,
    <XAxis
      key="x-axis"
      dataKey={isIntraday ? "time" : "date"}
      axisLine={{ stroke: "var(--border)", strokeOpacity: 0.9 }}
      tickLine={{ stroke: "var(--border)", strokeOpacity: 0.9 }}
      tickMargin={7}
      height={28}
      minTickGap={28}
      tickFormatter={(value: string) =>
        isIntraday ? formatTime(value, locale) : formatDate(value, locale)
      }
      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
    />,
    <YAxis
      key="y-axis"
      axisLine={{ stroke: "var(--border)", strokeOpacity: 0.9 }}
      tickLine={{ stroke: "var(--border)", strokeOpacity: 0.9 }}
      tickMargin={5}
      width={38}
      domain={yDomain}
      tickFormatter={(value: number) => formatAxisValue(card, value, locale)}
      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
    />,
  ];
  const tooltip = (
    <Tooltip
      cursor={{
        stroke: "var(--muted-foreground)",
        strokeDasharray: "3 3",
        strokeOpacity: 0.45,
      }}
      content={({ active, payload }) => (
        <HealthTooltip
          active={active}
          card={card}
          locale={locale}
          point={payload?.[0]?.payload as ComparisonPoint | undefined}
          intraday={isIntraday}
          baseline={usesPersonalBaseline ? baseline : undefined}
        />
      )}
    />
  );
  const comparisonLine = (
    <Line
      type="monotone"
      dataKey="comparisonValue"
      stroke={comparisonColor}
      strokeWidth={1.5}
      strokeDasharray="5 4"
      dot={data.length === 1 ? { r: 3, fill: comparisonColor } : false}
      activeDot={{ r: 4, strokeWidth: 2 }}
      connectNulls={false}
      isAnimationActive={false}
    />
  );

  if (card.chartKind === "sleep" && rangeDays === "1") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart {...common} barCategoryGap="24%">
          {axis}
          {tooltip}
          <Bar
            dataKey="comparisonValue"
            fill={comparisonColor}
            radius={[3, 3, 0, 0]}
          />
          <Bar dataKey="core" stackId="sleep" fill="#60a5fa" />
          <Bar dataKey="deep" stackId="sleep" fill="#6366f1" />
          <Bar dataKey="rem" stackId="sleep" fill="#a78bfa" />
          <Bar
            dataKey="awake"
            stackId="sleep"
            fill="#fbbf24"
            radius={[3, 3, 0, 0]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (usesPersonalBaseline) {
    const latestValue = currentPoints.at(-1)?.value;
    const status =
      latestValue == null || baseline == null
        ? null
        : getHealthBaselineStatus(latestValue, baseline);
    const statusLabel =
      baseline == null
        ? locale.startsWith("zh")
          ? "正在建立个人基线"
          : "Building personal baseline"
        : status === "within"
          ? locale.startsWith("zh")
            ? "当前读数位于个人基线内"
            : "Current reading is within the personal baseline"
          : status === "above"
            ? locale.startsWith("zh")
              ? "当前读数高于个人基线"
              : "Current reading is above the personal baseline"
            : locale.startsWith("zh")
              ? "当前读数低于个人基线"
              : "Current reading is below the personal baseline";
    return (
      <div className="h-full" role="img" aria-label={statusLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart {...common}>
            {axis}
            {tooltip}
            {baseline ? (
              <ReferenceArea
                y1={baseline.lower}
                y2={baseline.upper}
                fill={accentColor}
                fillOpacity={0.1}
                strokeOpacity={0}
                ifOverflow="extendDomain"
              />
            ) : null}
            {baseline ? (
              <ReferenceLine
                y={baseline.center}
                stroke={accentColor}
                strokeDasharray="4 4"
                strokeOpacity={0.55}
                ifOverflow="extendDomain"
              />
            ) : null}
            <Line
              type="linear"
              dataKey="value"
              stroke="transparent"
              strokeWidth={0}
              dot={(props) => (
                <BaselineDot
                  cx={props.cx}
                  cy={props.cy}
                  value={props.payload?.value}
                  baseline={baseline}
                  accentColor={accentColor}
                />
              )}
              activeDot={{ r: 5, fill: accentColor, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (card.chartKind === "range") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart {...common} barCategoryGap="45%">
          {axis}
          {tooltip}
          <Bar
            dataKey="range"
            fill={`${accentColor}35`}
            radius={[4, 4, 4, 4]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={accentColor}
            strokeWidth={2}
            dot={data.length === 1 ? { r: 3, fill: accentColor } : false}
            activeDot={{ r: 4, strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          {comparisonLine}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (card.chartKind === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart {...common} barCategoryGap="25%">
          {axis}
          {tooltip}
          <Bar
            dataKey="comparisonValue"
            fill={comparisonColor}
            radius={[3, 3, 0, 0]}
          />
          <Bar dataKey="value" fill={accentColor} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart {...common}>
        {axis}
        {tooltip}
        <Line
          type="monotone"
          dataKey="value"
          stroke={accentColor}
          strokeWidth={2}
          dot={data.length === 1 ? { r: 3, fill: accentColor } : false}
          activeDot={{ r: 4, strokeWidth: 2 }}
          connectNulls={false}
          isAnimationActive={false}
        />
        {comparisonLine}
      </LineChart>
    </ResponsiveContainer>
  );
}
