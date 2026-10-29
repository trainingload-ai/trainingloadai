"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { TrainingPlanDetail } from "@/api/plans";
import {
  buildPlanLoadPoints,
  localDateKey,
  normalizeDay,
  planLoadAxisMax,
  type PlanLoadPoint,
} from "./mobile-plan-load-model";

const CHART_HEIGHT = 168;
const CTL_COLOR = "#0ea5e9";
const ATL_COLOR = "#8b5cf6";
const LOAD_COLOR = "#16a34a";

function formatPointDate(key: string, locale: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function chartPath(
  points: PlanLoadPoint[],
  valueKey: "ctl" | "atl",
  dayWidth: number,
  yMax: number,
  plotHeight: number,
  topPad: number,
) {
  return points
    .map((point, index) => {
      const x = index * dayWidth + dayWidth / 2;
      const y = topPad + ((yMax - point[valueKey]) / yMax) * plotHeight;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function LegendItem({
  color,
  label,
  striped = false,
}: {
  color: string;
  label: string;
  striped?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        className="size-3.5 shrink-0 rounded-micro"
        style={{
          background: striped
            ? `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 5px)`
            : color,
          border: striped ? `1px solid ${color}55` : undefined,
        }}
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  );
}

export function MobilePlanLoadChart({ plan }: { plan: TrainingPlanDetail }) {
  const t = useTranslations("V2PlanDetailPage.mobile");
  const locale = useLocale();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(336);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const points = useMemo(() => buildPlanLoadPoints(plan), [plan]);
  const todayKey = localDateKey(normalizeDay(new Date()));
  const todayIndex = points.findIndex((point) => point.key === todayKey);
  const firstFutureIndex = points.findIndex((point) => point.key > todayKey);
  const focusIndex = Math.max(
    0,
    todayIndex >= 0
      ? todayIndex
      : firstFutureIndex >= 0
        ? firstFutureIndex
        : points.length - 1,
  );
  const resolvedSelectedIndex = points.length
    ? Math.max(0, Math.min(points.length - 1, selectedIndex ?? focusIndex))
    : 0;
  const selectedPoint = points[resolvedSelectedIndex];
  const dayWidth = Math.max(44, viewportWidth / 7);
  const dataWidth = points.length * dayWidth;
  const contentWidth = Math.max(
    viewportWidth,
    dataWidth + Math.max(0, viewportWidth - dayWidth),
  );
  const topPad = 12;
  const bottomPad = 36;
  const plotHeight = CHART_HEIGHT - topPad - bottomPad;
  const yMax = planLoadAxisMax(points);
  const yTicks = [yMax, (yMax / 3) * 2, yMax / 3, 0];

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateWidth = () => {
      if (viewport.clientWidth > 0) setViewportWidth(viewport.clientWidth);
    };
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maxScroll = Math.max(0, contentWidth - viewportWidth);
    viewport.scrollLeft = Math.min(maxScroll, focusIndex * dayWidth);
  }, [contentWidth, dayWidth, focusIndex, viewportWidth]);

  return (
    <section className="space-y-2" aria-labelledby="mobile-plan-load-title">
      <h2
        id="mobile-plan-load-title"
        className="px-1 text-sm font-semibold text-foreground"
      >
        {t("loadChart.title")}
      </h2>
      <div className="overflow-hidden rounded-surface bg-neutral-100/80 px-3 pb-3 pt-3 dark:bg-muted/45">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-mobile-caption text-muted-foreground pc:text-xs">
          <LegendItem
            color={LOAD_COLOR}
            label={t("loadChart.plannedLoad")}
            striped
          />
          <LegendItem color={CTL_COLOR} label={t("loadChart.fitness")} />
          <LegendItem color={ATL_COLOR} label={t("loadChart.fatigue")} />
        </div>
        {selectedPoint ? (
          <div className="mb-2 flex items-center justify-between gap-3 text-mobile-caption pc:text-xs">
            <span className="font-medium text-muted-foreground">
              {selectedPoint.key}
            </span>
            <span className="flex flex-wrap justify-end gap-3 tabular-nums">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-600" />
                {Math.round(selectedPoint.load)}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-sky-500" />
                <span className="text-muted-foreground">
                  {t("loadChart.fitness")} (CTL)
                </span>
                {Math.round(selectedPoint.ctl)}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-violet-500" />
                <span className="text-muted-foreground">
                  {t("loadChart.fatigue")} (ATL)
                </span>
                {Math.round(selectedPoint.atl)}
              </span>
            </span>
          </div>
        ) : null}
        <div className="relative">
          <div
            ref={viewportRef}
            className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <svg
              width={contentWidth}
              height={CHART_HEIGHT}
              viewBox={`0 0 ${contentWidth} ${CHART_HEIGHT}`}
              role="img"
              aria-label={t("loadChart.title")}
            >
              <defs>
                <pattern
                  id="mobile-plan-load-stripes"
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width="2" height="6" fill={LOAD_COLOR} opacity="0.58" />
                </pattern>
              </defs>
              {yTicks.map((tick) => {
                const y = topPad + ((yMax - tick) / yMax) * plotHeight;
                return (
                  <line
                    key={`grid-${tick}`}
                    x1="0"
                    x2={contentWidth}
                    y1={y}
                    y2={y}
                    className="stroke-border/70"
                  />
                );
              })}
              {todayIndex >= 0 ? (
                <rect
                  x={todayIndex * dayWidth + 4}
                  y="0"
                  width={Math.max(1, dayWidth - 8)}
                  height={CHART_HEIGHT - bottomPad + 4}
                  rx="16"
                  className="fill-emerald-500/10"
                />
              ) : null}
              {points.map((point, index) => {
                const height = Math.max(
                  point.load > 0 ? 2 : 0,
                  (point.load / yMax) * plotHeight,
                );
                const width = Math.max(6, Math.min(14, dayWidth * 0.34));
                return (
                  <rect
                    key={`load-${point.key}`}
                    x={index * dayWidth + dayWidth / 2 - width / 2}
                    y={topPad + plotHeight - height}
                    width={width}
                    height={height}
                    rx="2"
                    fill="url(#mobile-plan-load-stripes)"
                    stroke={LOAD_COLOR}
                    strokeOpacity="0.35"
                  />
                );
              })}
              {points.length > 1 ? (
                <>
                  <path
                    d={chartPath(
                      points,
                      "ctl",
                      dayWidth,
                      yMax,
                      plotHeight,
                      topPad,
                    )}
                    fill="none"
                    stroke={CTL_COLOR}
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d={chartPath(
                      points,
                      "atl",
                      dayWidth,
                      yMax,
                      plotHeight,
                      topPad,
                    )}
                    fill="none"
                    stroke={ATL_COLOR}
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </>
              ) : null}
              {points.flatMap((point, index) =>
                (["ctl", "atl"] as const).map((valueKey) => {
                  const color = valueKey === "ctl" ? CTL_COLOR : ATL_COLOR;
                  return (
                    <circle
                      key={`${valueKey}-${point.key}`}
                      cx={index * dayWidth + dayWidth / 2}
                      cy={
                        topPad + ((yMax - point[valueKey]) / yMax) * plotHeight
                      }
                      r="2.5"
                      fill={color}
                    />
                  );
                }),
              )}
              {selectedPoint ? (
                <line
                  x1={resolvedSelectedIndex * dayWidth + dayWidth / 2}
                  x2={resolvedSelectedIndex * dayWidth + dayWidth / 2}
                  y1={topPad}
                  y2={topPad + plotHeight}
                  className="stroke-muted-foreground/40"
                />
              ) : null}
              {points.map((point, index) => {
                const isToday = point.key === todayKey;
                return (
                  <g key={`label-${point.key}`}>
                    <text
                      x={index * dayWidth + dayWidth / 2}
                      y={CHART_HEIGHT - 15}
                      textAnchor="middle"
                      fontSize="10"
                      className={
                        isToday
                          ? "fill-foreground font-medium"
                          : "fill-muted-foreground"
                      }
                    >
                      {isToday
                        ? t("today")
                        : formatPointDate(point.key, locale)}
                    </text>
                    <circle
                      cx={index * dayWidth + dayWidth / 2}
                      cy={CHART_HEIGHT - 4}
                      r="2"
                      className={
                        point.load > 0 ? "fill-emerald-600" : "fill-border"
                      }
                    />
                    <rect
                      x={index * dayWidth}
                      y="0"
                      width={dayWidth}
                      height={CHART_HEIGHT - bottomPad}
                      fill="transparent"
                      role="button"
                      tabIndex={0}
                      aria-label={`${point.key}, ${t("loadChart.plannedLoad")} ${Math.round(point.load)}, CTL ${Math.round(point.ctl)}, ATL ${Math.round(point.atl)}`}
                      onClick={() => setSelectedIndex(index)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedIndex(index);
                        }
                      }}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-9 bg-gradient-to-l from-neutral-100 via-neutral-100/85 to-transparent dark:from-muted dark:via-muted/85">
            {yTicks.map((tick) => {
              const y = topPad + ((yMax - tick) / yMax) * plotHeight;
              return (
                <span
                  key={`axis-${tick}`}
                  className="absolute right-0 w-8 text-right text-[10px] tabular-nums text-muted-foreground/70"
                  style={{ top: y - 7 }}
                >
                  {Math.round(tick)}
                </span>
              );
            })}
            <span className="absolute bottom-0 right-0 text-[10px] font-medium text-muted-foreground/70">
              TSS
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
