"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import uPlot from "uplot";
import UplotReact from "uplot-react";
import type { PmcProjectionResult } from "@shared/pmc-projection";
import {
  useElementSize,
  useThemeColor,
} from "@/components/charts/uplot/useElementSize";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  projectionChartPoints,
  projectionChartSeries,
} from "./pmc-projection-model";
import {
  PMC_METRIC_TOKENS,
  PMC_TSB_ZONES,
  type PmcMetric,
} from "./pmc-visuals";

type Panel = "main" | "load";

export default function PMCProjectionChart({
  result,
  refreshError = false,
  metric,
  showLoad = true,
  compact = false,
  tools,
}: {
  result: PmcProjectionResult;
  refreshError?: boolean;
  metric?: PmcMetric;
  showLoad?: boolean;
  compact?: boolean;
  tools?: React.ReactNode;
}) {
  const t = useTranslations("PmcProjection");
  const zoneText = useTranslations("dashboard.fitnessStatus.tsb.status");
  const format = useFormatter();
  const color = useThemeColor();
  const syncKey = useId();
  const main = useElementSize<HTMLDivElement>();
  const load = useElementSize<HTMLDivElement>();
  const plotRefs = useRef<uPlot[]>([]);
  const touchTooltip = useRef(false);
  const [selectedMetric, setSelectedMetric] = useState<PmcMetric>("tsb");
  const focus = metric ?? selectedMetric;
  const [selectedDate, setSelectedDate] = useState(result.today);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const points = useMemo(
    () => projectionChartPoints(result),
    [result.history, result.forecast],
  );
  const selected =
    points.find((point) => point.date === selectedDate) ?? result.current;
  const number = (value: number | null | undefined) =>
    value == null ? "—" : format.number(value, { maximumFractionDigits: 1 });
  const dateLabel = (date: string) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const data = useMemo(() => {
    const metric = projectionChartSeries(result, focus);
    const stress = projectionChartSeries(result, "load");
    return {
      main: [metric.x, metric.actual, metric.future] as uPlot.AlignedData,
      load: [
        metric.x,
        stress.actual,
        stress.future.map((v, i) =>
          points[i]?.date === result.today ? null : v,
        ),
      ] as uPlot.AlignedData,
    };
  }, [result.history, result.forecast, result.today, points, focus]);

  const options = useCallback(
    (width: number, height: number, panel: Panel): uPlot.Options => {
      const fg = color("--muted-foreground");
      const tonal = (alpha: number) =>
        `color-mix(in srgb, ${fg} ${alpha * 100}%, transparent)`;
      const metricColor = color(PMC_METRIC_TOKENS[focus]);
      const todayX = Date.parse(`${result.today}T00:00:00Z`) / 1000;
      const x = data.main[0];
      const line = (
        label: string,
        stroke: string,
        future: boolean,
        show = true,
      ): uPlot.Series => ({
        label,
        stroke,
        show,
        width: 1.8,
        dash: future ? [5, 4] : [],
        spanGaps: false,
        paths: uPlot.paths.spline!(),
        fill:
          focus !== "tsb"
            ? `color-mix(in srgb, ${stroke} 5%, transparent)`
            : undefined,
        points: { show: false },
      });
      return {
        width,
        height,
        padding: [10, 12, 4, 0],
        legend: { show: false },
        tzDate: (timestamp) =>
          uPlot.tzDate(new Date(timestamp * 1000), "Etc/UTC"),
        cursor: {
          y: false,
          drag: { x: false, y: false },
          sync: { key: syncKey },
        },
        scales: {
          x: {
            time: true,
            range: [x[0] ?? todayX, x.at(-1) ?? todayX + 28 * 86400],
          },
          y: {
            auto: true,
            range: (_u, min, max) => {
              if (!Number.isFinite(min) || !Number.isFinite(max))
                return panel === "main" && focus === "tsb" ? [-10, 10] : [0, 1];
              if (panel === "load") return [0, Math.max(1, max) * 1.15];
              const pad = Math.max(2, (max - min) * 0.14);
              return [
                focus === "tsb"
                  ? Math.min(0, min - pad)
                  : Math.max(0, min - pad),
                Math.max(0, max) + pad,
              ];
            },
          },
        },
        axes: [
          {
            show: panel === "load" || !showLoad,
            stroke: fg,
            grid: { show: false },
            space: width < 500 ? 95 : 125,
            font: "11px sans-serif",
            size: 30,
            values: (_u, ticks) =>
              ticks.map((v) =>
                dateLabel(new Date(v * 1000).toISOString().slice(0, 10)),
              ),
          },
          {
            stroke: fg,
            grid: { show: panel === "main", stroke: tonal(0.15), width: 1 },
            ticks: { show: false },
            font: "11px sans-serif",
            size: 42,
            space: panel === "main" ? 45 : 35,
            values: (_u, ticks) =>
              ticks.map((v) => format.number(v, { maximumFractionDigits: 0 })),
          },
        ],
        series:
          panel === "main"
            ? [
                {},
                line(t("actual"), metricColor, false),
                line(t("projected"), metricColor, true),
              ]
            : [
                {},
                {
                  label: t("actual"),
                  stroke: "transparent",
                  fill: tonal(0.27),
                  paths: uPlot.paths.bars!({ size: [0.65, 10] }),
                  points: { show: false },
                },
                {
                  label: t("projected"),
                  stroke: tonal(0.35),
                  fill: tonal(0.06),
                  paths: uPlot.paths.bars!({ size: [0.65, 10] }),
                  points: { show: false },
                },
              ],
        hooks: {
          setCursor: [
            (u) => {
              const index = u.cursor.idx;
              if (index != null && points[index])
                setSelectedDate(points[index].date);
              if (!touchTooltip.current) setTooltipVisible(index != null);
            },
          ],
          drawClear: [
            (u) => {
              const { ctx, bbox } = u;
              const xpos = u.valToPos(todayX, "x", true);
              ctx.save();
              if (panel === "main" && focus === "tsb") {
                const min = u.scales.y.min ?? 0,
                  max = u.scales.y.max ?? 1;
                for (const zone of PMC_TSB_ZONES) {
                  const low = Math.max(min, zone.min),
                    high = Math.min(max, zone.max);
                  if (low >= high) continue;
                  const top = u.valToPos(high, "y", true),
                    bottom = u.valToPos(low, "y", true);
                  ctx.globalAlpha = 0.065;
                  ctx.fillStyle = color(zone.token);
                  ctx.fillRect(bbox.left, top, bbox.width, bottom - top);
                  const ratio = window.devicePixelRatio || 1;
                  if (bottom - top >= 18 * ratio) {
                    ctx.globalAlpha = 1;
                    ctx.font = `${11 * ratio}px sans-serif`;
                    ctx.textAlign = "right";
                    ctx.textBaseline = "top";
                    ctx.fillStyle = color("--muted-foreground");
                    ctx.fillText(
                      zoneText(zone.label),
                      bbox.left + bbox.width - 8 * ratio,
                      top + 4 * ratio,
                    );
                  }
                }
              }
              ctx.globalAlpha = 1;
              ctx.fillStyle = tonal(0.025);
              ctx.fillRect(
                xpos,
                bbox.top,
                bbox.left + bbox.width - xpos,
                bbox.height,
              );
              ctx.restore();
            },
          ],
          draw: [
            (u) => {
              const { ctx, bbox } = u;
              const xpos = u.valToPos(todayX, "x", true);
              ctx.save();
              ctx.strokeStyle = tonal(0.5);
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 4]);
              ctx.beginPath();
              ctx.moveTo(xpos, bbox.top);
              ctx.lineTo(xpos, bbox.top + bbox.height);
              ctx.stroke();
              if (panel === "main" && focus === "tsb") {
                const zero = u.valToPos(0, "y", true);
                ctx.setLineDash([]);
                ctx.strokeStyle = tonal(0.2);
                ctx.beginPath();
                ctx.moveTo(bbox.left, zero);
                ctx.lineTo(bbox.left + bbox.width, zero);
                ctx.stroke();
              }
              ctx.restore();
            },
          ],
        },
      };
    },
    [
      color,
      data,
      result.today,
      points,
      syncKey,
      focus,
      format,
      t,
      zoneText,
      showLoad,
    ],
  );
  const mainOptions = useMemo(
    () => options(main.size.width, main.size.height, "main"),
    [options, main.size],
  );
  const loadOptions = useMemo(
    () => options(load.size.width, load.size.height, "load"),
    [options, load.size],
  );

  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t("chartTitle")}
      data-testid="pmc-projection-chart"
      data-metric={focus}
      data-forecast-end={points.at(-1)?.date}
    >
      {!compact || tools || refreshError ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {!compact ? (
              <h2 className="text-sm font-semibold">{t("chartTitle")}</h2>
            ) : null}
            {refreshError ? (
              <span
                role="status"
                data-testid="pmc-update-status"
                className="text-xs text-muted-foreground"
                title={t("updated", {
                  time: format.dateTime(new Date(result.asOf), {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: result.timezone,
                  }),
                })}
              >
                {t("updateFailedShort")}
              </span>
            ) : null}
          </div>
          {metric ? (
            tools
          ) : (
            <ToggleGroup
              type="single"
              value={focus}
              onValueChange={(value) => {
                if (value === "tsb" || value === "ctl" || value === "atl")
                  setSelectedMetric(value);
              }}
              size="sm"
              variant="outline"
              aria-label={t("metricSwitch")}
              data-testid="pmc-metric-switch"
            >
              {(["tsb", "ctl", "atl"] as const).map((metric) => (
                <ToggleGroupItem key={metric} value={metric}>
                  {t(`metricNames.${metric}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {!compact ? (
          <span className="flex items-center gap-2">
            <span
              className="w-4 border-t-2"
              style={{
                borderColor: color(PMC_METRIC_TOKENS[focus]),
              }}
            />
            {t(`metrics.${focus}`)}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          <span className="w-4 border-t border-current" />
          {t("actual")}
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 border-t border-dashed border-current" />
          {t("projected")}
        </span>
      </div>
      <div
        className="relative overflow-hidden rounded-surface bg-neutral-50/80 dark:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={0}
        role="group"
        aria-label={`${t("chartTitle")}. ${t("keyboardHint")}${focus === "tsb" ? `. ${PMC_TSB_ZONES.map((zone) => zoneText(zone.label)).join("; ")}` : ""}`}
        onFocus={() => setTooltipVisible(true)}
        onBlur={() => {
          touchTooltip.current = false;
          setTooltipVisible(false);
        }}
        onPointerLeave={() => {
          if (!touchTooltip.current) setTooltipVisible(false);
        }}
        onPointerDown={(event) => {
          touchTooltip.current = event.pointerType === "touch";
          if (touchTooltip.current)
            event.currentTarget.focus({ preventScroll: true });
          for (const plot of plotRefs.current) {
            const bounds = plot.over.getBoundingClientRect();
            if (
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom ||
              event.clientX < bounds.left ||
              event.clientX > bounds.right
            )
              continue;
            const index = plot.posToIdx(event.clientX - bounds.left);
            if (!points[index]) return;
            setSelectedDate(points[index].date);
            for (const synced of plotRefs.current)
              synced.setCursor({
                left: synced.valToPos(
                  Date.parse(`${points[index].date}T00:00:00Z`) / 1000,
                  "x",
                ),
                top: 0,
              });
            setTooltipVisible(true);
            break;
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            touchTooltip.current = false;
            setTooltipVisible(false);
            return;
          }
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const current = Math.max(
            0,
            points.findIndex((point) => point.date === selectedDate),
          );
          const next = Math.max(
            0,
            Math.min(
              points.length - 1,
              current + (event.key === "ArrowRight" ? 1 : -1),
            ),
          );
          if (!points[next]) return;
          setSelectedDate(points[next].date);
          for (const plot of plotRefs.current)
            plot?.setCursor({
              left: plot.valToPos(
                Date.parse(`${points[next].date}T00:00:00Z`) / 1000,
                "x",
              ),
              top: 0,
            });
        }}
      >
        <div className="flex justify-end px-4 pt-3 text-xs text-muted-foreground">
          <span>
            {t("today")} · {dateLabel(result.today)}
          </span>
        </div>
        <div
          ref={main.ref}
          className={
            compact
              ? "h-[220px] w-full min-w-0 md:h-[290px]"
              : "h-[260px] w-full min-w-0 md:h-[320px]"
          }
        >
          {main.size.width > 0 ? (
            <UplotReact
              options={mainOptions}
              data={data.main}
              onCreate={(plot) => {
                plotRefs.current[0] = plot;
              }}
            />
          ) : null}
        </div>
        {showLoad ? (
          <>
            <p className="px-4 pt-2 text-xs text-muted-foreground">
              {t("load")}
            </p>
            <div
              ref={load.ref}
              className="h-[105px] w-full min-w-0 md:h-[110px]"
            >
              {load.size.width > 0 ? (
                <UplotReact
                  options={loadOptions}
                  data={data.load}
                  onCreate={(plot) => {
                    plotRefs.current[1] = plot;
                  }}
                />
              ) : null}
            </div>
          </>
        ) : null}
        {tooltipVisible && selected ? (
          <div
            className="pointer-events-none absolute right-3 top-10 z-10 grid min-w-40 gap-1.5 rounded-md border border-border/50 bg-background px-3 py-2 text-xs shadow-md"
            data-testid="pmc-chart-tooltip"
            role="status"
            aria-live="polite"
          >
            <p className="font-medium">
              {dateLabel(selected.date)} ·{" "}
              {selected.basis === "ACTUAL" ? t("actual") : t("projected")}
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 tabular-nums">
              <dt className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: color("--sky-500") }}
                  aria-hidden
                />
                {t("metricNames.ctl")}
              </dt>
              <dd className="text-right">{number(selected.ctl)}</dd>
              <dt className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: color("--violet-500") }}
                  aria-hidden
                />
                {t("metricNames.atl")}
              </dt>
              <dd className="text-right">{number(selected.atl)}</dd>
              <dt>{t("metricNames.tsb")}</dt>
              <dd className="text-right">{number(selected.tsb)}</dd>
              <dt>{t("load")}</dt>
              <dd className="text-right">{number(selected.load)}</dd>
            </dl>
            {selected.basis !== "ACTUAL" ? (
              <p className="text-muted-foreground">
                {selected.ctl === null
                  ? t("noForecast")
                  : t(`basis.${selected.basis}`)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
