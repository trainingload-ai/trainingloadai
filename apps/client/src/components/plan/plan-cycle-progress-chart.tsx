"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export type PlanCycleProgressChartPoint = {
  key: string;
  label: string;
  selectionKey: string;
  completed?: number;
  missed?: number;
  skipped?: number;
  moved?: number;
  pending?: number;
};

const STATUSES = [
  "completed",
  "missed",
  "skipped",
  "moved",
  "pending",
] as const;
type Status = (typeof STATUSES)[number];

const STATUS_STYLE = {
  completed: {
    light: "#10b981",
    dark: "#34d399",
    opacity: 0.75,
    swatch: "text-[#10b981] dark:text-[#34d399]",
  },
  missed: {
    light: "#f5b619",
    dark: "#fbbf24",
    opacity: 1,
    swatch: "text-[#f5b619] dark:text-[#fbbf24]",
  },
  skipped: {
    light: "#94a3b8",
    dark: "#94a3b8",
    opacity: 0.5,
    swatch: "text-[#94a3b8]",
  },
  moved: {
    light: "#38bdf8",
    dark: "#7dd3fc",
    opacity: 0.65,
    swatch: "text-[#38bdf8] dark:text-[#7dd3fc]",
  },
  pending: {
    light: "#b8c2ce",
    dark: "#94a3b8",
    opacity: 0.18,
    swatch: "text-[#b8c2ce] dark:text-[#94a3b8]",
  },
} satisfies Record<
  Status,
  {
    light: string;
    dark: string;
    opacity: number;
    swatch: string;
  }
>;

function StatusSwatch({ status }: { status: Status }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex size-2.5 shrink-0 overflow-hidden rounded-micro",
        STATUS_STYLE[status].swatch,
      )}
    >
      <span
        className="absolute inset-0 border border-current bg-current"
        style={{
          opacity: status === "missed" ? 0.16 : STATUS_STYLE[status].opacity,
        }}
      />
      {status === "missed" && (
        <svg viewBox="0 0 10 10" className="relative size-full" fill="none">
          <path
            d="M-2 5L5-2 M0 10L10 0 M5 12L12 5"
            stroke="currentColor"
            strokeOpacity=".65"
          />
        </svg>
      )}
    </span>
  );
}

export function PlanCycleProgressChart({
  data,
  labels,
  ariaLabel,
  currentKey,
  selectedKey,
  onPointSelect,
  action,
  className,
}: {
  data: PlanCycleProgressChartPoint[];
  labels: Record<Status, string>;
  ariaLabel: string;
  currentKey?: string;
  selectedKey: string;
  onPointSelect: (key: string) => void;
  action?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("V2PlanPage.weekStrip");
  const tSummary = useTranslations("PlanSummary");
  const patternId = `cycle-missed-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const viewportRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const totals = Object.fromEntries(
    STATUSES.map((status) => [
      status,
      data.reduce((sum, point) => sum + (point[status] ?? 0), 0),
    ]),
  ) as Record<Status, number>;
  const total = STATUSES.reduce((sum, status) => sum + totals[status], 0);
  const maxTotal = Math.max(
    1,
    ...data.map((point) =>
      STATUSES.reduce((sum, status) => sum + (point[status] ?? 0), 0),
    ),
  );
  const tickStep = Math.max(1, Math.ceil(maxTotal / 3));
  const axisMax = Math.ceil(maxTotal / tickStep) * tickStep;
  const ticks = Array.from(
    { length: axisMax / tickStep + 1 },
    (_, index) => index * tickStep,
  );
  const currentPoint = data.find((point) => point.selectionKey === currentKey);
  const selectedPoint = data.find(
    (point) => point.selectionKey === selectedKey,
  );
  const weekWidth = Math.max(
    72,
    ...data.map((point) => point.label.length * 7 + 24),
  );
  const config = Object.fromEntries(
    STATUSES.map((status) => [
      status,
      {
        label: labels[status],
        theme: {
          light: STATUS_STYLE[status].light,
          dark: STATUS_STYLE[status].dark,
        },
      },
    ]),
  ) satisfies ChartConfig;

  useEffect(() => {
    const viewport = viewportRef.current;
    const button = selectedRef.current;
    if (!viewport || !button) return;
    const revealSelection = () => {
      const viewportBounds = viewport.getBoundingClientRect();
      const buttonBounds = button.getBoundingClientRect();
      if (
        buttonBounds.left < viewportBounds.left ||
        buttonBounds.right > viewportBounds.right
      ) {
        viewport.scrollLeft +=
          buttonBounds.left -
          viewportBounds.left -
          (viewport.clientWidth - buttonBounds.width) / 2;
      }
    };
    revealSelection();
    const observer = new ResizeObserver(revealSelection);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [selectedKey, data.length]);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex flex-col gap-2 tabular-nums", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <h2 className="text-sm font-semibold text-foreground">{ariaLabel}</h2>
          <span>
            {tSummary("completionHint", { done: totals.completed, total })}
          </span>
          {currentPoint && (
            <button
              type="button"
              onClick={() => onPointSelect(currentPoint.selectionKey)}
              className="inline-flex items-center gap-1.5 rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("viewWeek", { week: currentPoint.selectionKey })}
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-[#7c3aed] dark:bg-[#a78bfa]"
              />
              {t("currentPosition", {
                current: currentPoint.selectionKey,
                total: data.length,
              })}
            </button>
          )}
        </div>
        {action}
      </div>
      <div className="overflow-hidden rounded-xl bg-neutral-100 dark:bg-muted/45">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pt-3 text-[11px] text-muted-foreground">
          {STATUSES.filter((status) => totals[status] > 0).map((status) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <StatusSwatch status={status} />
              {labels[status]}
              <span className="text-foreground">{totals[status]}</span>
            </span>
          ))}
          <span className="ml-auto hidden sm:inline">{t("sessionsUnit")}</span>
        </div>
        <div ref={viewportRef} className="overflow-x-auto overscroll-x-contain">
          <div
            style={{ minWidth: Math.max(280, data.length * weekWidth + 56) }}
          >
            <ChartContainer
              config={config}
              className="aspect-auto h-[128px] w-full rounded-none bg-transparent dark:bg-transparent [&_.recharts-wrapper]:cursor-pointer"
            >
              <BarChart
                data={data.map((point) => ({
                  ...point,
                  ...Object.fromEntries(
                    STATUSES.map((status) => [status, point[status] ?? 0]),
                  ),
                }))}
                margin={{ top: 12, right: 8, bottom: 1, left: 12 }}
                maxBarSize={22}
                onClick={(state) => {
                  const point = state.activePayload?.[0]?.payload as
                    | PlanCycleProgressChartPoint
                    | undefined;
                  if (point) onPointSelect(point.selectionKey);
                }}
              >
                <defs>
                  <pattern
                    id={patternId}
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                  >
                    <rect
                      width="6"
                      height="6"
                      fill="var(--color-missed)"
                      fillOpacity={0.1}
                    />
                    <path
                      d="M-1 1L1-1 M0 6L6 0 M5 7L7 5"
                      stroke="var(--color-missed)"
                      strokeWidth={1.5}
                      strokeOpacity={0.42}
                    />
                  </pattern>
                </defs>
                <CartesianGrid vertical={false} strokeOpacity={0.45} />
                <XAxis dataKey="selectionKey" hide />
                <YAxis
                  orientation="right"
                  width={36}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  allowDecimals={false}
                  domain={[0, axisMax]}
                  ticks={ticks}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltip
                  cursor={{
                    fill: "var(--muted-foreground)",
                    fillOpacity: 0.04,
                  }}
                  content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as
                      | PlanCycleProgressChartPoint
                      | undefined;
                    if (!active || !point) return null;
                    return (
                      <div className="min-w-36 rounded-lg border border-border/60 bg-background px-3 py-2.5 text-xs shadow-sm">
                        <div className="mb-2 flex items-center justify-between gap-4 font-medium">
                          {point.label}
                          {point.selectionKey === currentKey && (
                            <span className="font-normal text-muted-foreground">
                              {t("state.current")}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {STATUSES.filter(
                            (status) => (point[status] ?? 0) > 0,
                          ).map((status) => (
                            <div
                              key={status}
                              className="flex items-center justify-between gap-6"
                            >
                              <span className="inline-flex items-center gap-2 text-muted-foreground">
                                <StatusSwatch status={status} />
                                {labels[status]}
                              </span>
                              <span className="font-medium">
                                {point[status]}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                />
                {STATUSES.map((status) => (
                  <Bar
                    key={status}
                    dataKey={status}
                    stackId="status"
                    fill={`var(--color-${status})`}
                    isAnimationActive={false}
                    shape={(props: unknown) => {
                      const { x, y, width, height, payload } = props as {
                        x: number;
                        y: number;
                        width: number;
                        height: number;
                        payload: PlanCycleProgressChartPoint;
                      };
                      if (!height || !width) return <g />;
                      const topStatus = [...STATUSES]
                        .reverse()
                        .find((key) => (payload[key] ?? 0) > 0);
                      return (
                        <Rectangle
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill={
                            status === "missed"
                              ? `url(#${patternId})`
                              : `var(--color-${status})`
                          }
                          fillOpacity={STATUS_STYLE[status].opacity}
                          stroke={`var(--color-${status})`}
                          strokeOpacity={0.25}
                          strokeWidth={0.75}
                          radius={status === topStatus ? [2, 2, 0, 0] : 0}
                        />
                      );
                    }}
                  />
                ))}
              </BarChart>
            </ChartContainer>
            <div
              className="grid pb-1 pl-3 pr-11"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, data.length)}, minmax(0, 1fr))`,
              }}
            >
              {data.map((point) => {
                const isCurrent = point.selectionKey === currentKey;
                const isSelected = point.selectionKey === selectedKey;
                return (
                  <button
                    key={point.selectionKey}
                    ref={isSelected ? selectedRef : undefined}
                    type="button"
                    aria-label={t("viewWeek", { week: point.selectionKey })}
                    aria-current={isCurrent ? "step" : undefined}
                    aria-pressed={isSelected}
                    onClick={() => onPointSelect(point.selectionKey)}
                    className="flex min-h-10 min-w-0 flex-col items-center rounded-md pt-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "whitespace-nowrap rounded px-2 py-1 transition-colors",
                        isSelected
                          ? "bg-background font-medium text-foreground"
                          : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                        isCurrent && "text-[#7c3aed] dark:text-[#a78bfa]",
                      )}
                    >
                      {point.label}
                    </span>
                    <span
                      className={cn(
                        "h-3 text-[10px] leading-3",
                        isCurrent
                          ? "text-[#7c3aed] dark:text-[#a78bfa]"
                          : "invisible",
                      )}
                    >
                      {t("state.current")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {selectedPoint &&
          `${selectedPoint.label}：${STATUSES.map((status) => `${labels[status]} ${selectedPoint[status] ?? 0}`).join("，")}`}
      </p>
    </div>
  );
}
