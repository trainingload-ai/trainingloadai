"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import type {
  ExplorationAxis,
  ExplorationPanel,
  ExplorationSeries,
  TrainingVisualizationV2,
} from "@shared/training-exploration";
import {
  explorationGeometry,
  explorationDisplayUnit,
  explorationReadout,
  explorationSeriesAxis,
  combineExplorationAxes,
  separateExplorationAxes,
  formatExplorationValue,
  nearestExplorationPoint,
} from "@shared/training-chart-model";
import { CoachCard } from "./cards/CoachCard";

function useExplorationLabels() {
  const t = useTranslations("AiCoachPage.trainingVisualization.exploration");
  const locale = useLocale();
  return {
    t,
    locale,
    axis: (a: ExplorationAxis) =>
      [
        a.measure ? t(`measures.${a.measure}`) : t(`axes.${a.kind}`),
        explorationDisplayUnit(a),
      ]
        .filter(Boolean)
        .join(" · "),
    series: (s: ExplorationSeries) =>
      s.role
        ? t(s.role)
        : [
            s.label,
            s.measure ? t(`measures.${s.measure}`) : undefined,
            s.axisIndex !== undefined ? `Y${s.axisIndex + 1}` : undefined,
          ]
            .filter(Boolean)
            .join(" · ") || t("seriesDefault"),
    format: (value: number | null, a: ExplorationAxis) =>
      formatExplorationValue(value, a, locale),
  };
}

function ExplorationPlot({ panel }: { panel: ExplorationPanel }) {
  const { t, axis, series: seriesLabel, format } = useExplorationLabels();
  const container = useRef<HTMLDivElement>(null);
  const [containerWidth, setWidth] = useState(600);
  const [selected, setSelected] = useState<{
    seriesIndex: number;
    pointIndex: number;
  }>();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const width = Math.max(
    containerWidth,
    panel.view === "BAR"
      ? (panel.x.categories?.length ?? 0) * 76 + 70
      : 280 + (panel.extraY?.length ?? 0) * 56,
  );
  const geometry = useMemo(
    () => explorationGeometry(panel, width),
    [panel, width],
  );
  const point = selected
    ? geometry.series[selected.seriesIndex]?.points[selected.pointIndex]
    : undefined;
  const active = point ? panel.series[point.seriesIndex] : undefined;
  const activeAxis = active ? explorationSeriesAxis(panel, active) : panel.y;
  const validPoints = geometry.series.flatMap((s) =>
    s.points.filter((p) => p.py !== null),
  );
  return (
    <div
      ref={container}
      className="relative min-w-0"
      data-testid="exploration-plot"
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {geometry.axes.map(({ axis: a, index }) => (
          <span key={index} className="font-medium text-foreground">
            {panel.extraY ? `Y${index + 1} · ` : ""}
            {axis(a)}
          </span>
        ))}
        {geometry.series.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: s.color }}
            />
            {seriesLabel(s)}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto overscroll-x-contain rounded-md">
        <motion.svg
          width={width}
          height={240}
          role="img"
          aria-label={`${axis(panel.y)} / ${axis(panel.x)}. ${t("interact")}`}
          tabIndex={0}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="block touch-pan-y text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setSelected(
              nearestExplorationPoint(
                geometry,
                event.clientX - rect.left,
                event.clientY - rect.top,
                panel.view === "SCATTER",
              ),
            );
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setSelected(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSelected(undefined);
              return;
            }
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const index = validPoints.findIndex(
              (p) =>
                p.pointIndex === point?.pointIndex &&
                p.seriesIndex === point?.seriesIndex,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? validPoints.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        validPoints.length - 1,
                        index + (event.key === "ArrowLeft" ? -1 : 1),
                      ),
                    );
            setSelected(validPoints[next]);
          }}
        >
          {geometry.yTicks.map((v) => (
            <g key={v}>
              <line
                x1={geometry.bounds.left}
                x2={geometry.bounds.right}
                y1={geometry.y(v)}
                y2={geometry.y(v)}
                className="stroke-border/50"
                strokeDasharray="2 4"
              />
              <text
                x={geometry.bounds.left - 8}
                y={geometry.y(v) + 3}
                textAnchor="end"
                fill="currentColor"
                fontSize={10}
              >
                {format(v, panel.y)}
              </text>
            </g>
          ))}
          {geometry.axes.map(({ axis: a, index, tickX, scale, ticks }) => (
            <g key={`axis-${index}`}>
              {panel.extraY?.length ? (
                <text
                  x={tickX}
                  y={12}
                  textAnchor={index === 0 ? "end" : "start"}
                  fill="currentColor"
                  fontSize={10}
                >{`Y${index + 1}`}</text>
              ) : null}
              {index > 0 &&
                ticks.map((v) => (
                  <text
                    key={v}
                    x={tickX}
                    y={scale(v) + 3}
                    fill="currentColor"
                    textAnchor="start"
                    fontSize={10}
                  >
                    {format(v, a)}
                  </text>
                ))}
            </g>
          ))}
          {geometry.xTicks.map((v) => (
            <text
              key={v}
              x={geometry.x(v)}
              y={geometry.bounds.bottom + 20}
              textAnchor="middle"
              fill="currentColor"
              fontSize={10}
            >
              <title>{format(v, panel.x)}</title>
              {panel.x.kind === "CATEGORY" && format(v, panel.x).length > 12
                ? `${format(v, panel.x).slice(0, 11)}…`
                : format(v, panel.x)}
            </text>
          ))}
          {geometry.series.map((s) => (
            <g key={s.id}>
              {panel.view === "LINE" &&
                s.paths.map((path, i) => (
                  <motion.path
                    key={i}
                    d={path}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={1.8}
                    strokeLinejoin="round"
                    strokeDasharray={s.dash}
                    initial={
                      reduced || panel.extraY ? false : { pathLength: 0 }
                    }
                    animate={panel.extraY ? undefined : { pathLength: 1 }}
                    transition={{ duration: 0.55 }}
                  />
                ))}
              {s.points.map((p, i) =>
                p.py === null ? null : panel.view === "BAR" ? (
                  <rect
                    key={i}
                    x={p.barX + 1}
                    y={Math.min(p.py, geometry.y(0))}
                    width={Math.max(2, geometry.barWidth - 3)}
                    height={Math.max(0, Math.abs(geometry.y(0) - p.py))}
                    rx={2}
                    fill={s.color}
                    opacity={s.role === "PLANNED" ? 0.45 : 0.85}
                  />
                ) : panel.view === "SCATTER" ||
                  s.points.length < 20 ||
                  s.points[i - 1]?.y == null ||
                  s.points[i + 1]?.y == null ? (
                  <circle
                    key={i}
                    cx={p.px}
                    cy={p.py}
                    r={panel.view === "SCATTER" ? 3.5 : 2}
                    fill={s.color}
                    opacity={0.75}
                  />
                ) : null,
              )}
            </g>
          ))}
          {point?.py != null && (
            <g>
              <line
                x1={point.px}
                x2={point.px}
                y1={geometry.bounds.top}
                y2={geometry.bounds.bottom}
                className="stroke-foreground/30"
                strokeDasharray="3 3"
              />
              <circle
                cx={point.px}
                cy={point.py}
                r={4}
                fill={geometry.series[point.seriesIndex].color}
                className="stroke-background"
                strokeWidth={2}
              />
            </g>
          )}
        </motion.svg>
      </div>
      <div className="mt-1 text-right text-[11px] text-muted-foreground">
        {axis(panel.x)}
      </div>
      {point && active && (
        <div
          role="tooltip"
          className={`pointer-events-none rounded-md bg-background px-3 py-2 text-xs ${containerWidth < 450 ? "mt-2" : "absolute right-2 top-8 z-10 max-w-[min(90%,320px)]"}`}
        >
          <p className="mb-1 font-medium">{seriesLabel(active)}</p>
          {point.label && (
            <p className="mb-1 text-muted-foreground">{point.label}</p>
          )}
          <p>
            {axis(panel.x)}: {format(point.x, panel.x)}
          </p>
          {explorationReadout(panel, point, point.seriesIndex).map(
            ({ series, point: paired }) => (
              <p key={series.id} className="font-medium tabular-nums">
                {panel.series.length > 1 ? seriesLabel(series) : axis(panel.y)}:{" "}
                {format(
                  paired?.y ?? null,
                  explorationSeriesAxis(panel, series),
                )}{" "}
                {explorationDisplayUnit(explorationSeriesAxis(panel, series))}
              </p>
            ),
          )}
          {point.from != null && point.to != null && (
            <p className="mt-1 text-muted-foreground">
              {t("bucket")}: {format(point.from, panel.x)}–
              {format(point.to, panel.x)}
            </p>
          )}
          {point.min != null && point.max != null && (
            <p className="text-muted-foreground">
              {t("range")}: {format(point.min, activeAxis)}–
              {format(point.max, activeAxis)}{" "}
              {explorationDisplayUnit(activeAxis)}
            </p>
          )}
          {point.coverage != null && (
            <p className="text-muted-foreground">
              {t("coverage")}: {Math.round(point.coverage * 100)}%
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ExplorationData({ panel }: { panel: ExplorationPanel }) {
  const { t, axis, series, format } = useExplorationLabels();
  const [page, setPage] = useState(0);
  const rows = useMemo(
    () =>
      panel.series.flatMap((s) =>
        s.points.map((p) => ({
          ...p,
          series: series(s),
          axis: explorationSeriesAxis(panel, s),
        })),
      ),
    [panel, series],
  );
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const current = Math.min(page, pages - 1);
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-muted-foreground focus-visible:outline-ring">
        {t("showData")}
      </summary>
      <div className="mt-2 overflow-x-auto rounded-md bg-background/60">
        <table className="w-full text-left tabular-nums">
          <thead>
            <tr className="bg-background/80">
              <th className="px-3 py-2">{t("series")}</th>
              <th>{axis(panel.x)}</th>
              <th>{panel.extraY ? t("axes.NUMBER") : axis(panel.y)}</th>
              <th>{t("coverage")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(current * 20, (current + 1) * 20).map((p, i) => (
              <tr key={i} className="even:bg-muted/40">
                <td className="px-3 py-2">{p.label ?? p.series}</td>
                <td className="pr-3">{format(p.x, panel.x)}</td>
                <td>
                  {format(p.y, p.axis)}{" "}
                  {panel.extraY ? explorationDisplayUnit(p.axis) : ""}
                </td>
                <td>
                  {p.coverage == null
                    ? "—"
                    : `${Math.round(p.coverage * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-end gap-3">
        <span>
          {current + 1} / {pages} · {rows.length}
        </span>
        <button
          className="rounded p-2 disabled:opacity-30 focus-visible:outline-ring"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
          aria-label={t("previous")}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          className="rounded p-2 disabled:opacity-30 focus-visible:outline-ring"
          disabled={current + 1 >= pages}
          onClick={() => setPage(current + 1)}
          aria-label={t("next")}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </details>
  );
}

export function TrainingExplorationCard({
  value,
}: {
  value: TrainingVisualizationV2;
}) {
  const { t } = useExplorationLabels();
  const [overlay, setOverlay] = useState(value.panels.some((p) => !!p.extraY));
  const separated = useMemo(
    () => separateExplorationAxes(value.panels),
    [value.panels],
  );
  const combined = useMemo(
    () => combineExplorationAxes(separated),
    [separated],
  );
  const canSwitch =
    value.provenance.query.source === "ACTIVITY_SERIES" &&
    combined.some((p) => p.extraY);
  const panels = overlay && canSwitch ? combined : separated;
  return (
    <CoachCard
      title={value.title}
      subtitle={
        value.subtitle ??
        [value.provenance.query.from, value.provenance.query.to]
          .filter(Boolean)
          .join(" – ")
      }
      icon={<BarChart3 size={16} />}
      dense
      showAccent={false}
      className="w-full min-w-0 max-w-full"
    >
      <div className="space-y-5" data-testid="training-exploration-card">
        {canSwitch && (
          <div
            className="flex justify-end gap-1"
            role="group"
            aria-label={t("overlay")}
          >
            {([false, true] as const).map((mode) => (
              <button
                key={String(mode)}
                type="button"
                aria-pressed={overlay === mode}
                onClick={() => setOverlay(mode)}
                className={`rounded-md px-2.5 py-1.5 text-xs focus-visible:outline-ring ${overlay === mode ? "bg-background text-foreground" : "text-muted-foreground"}`}
              >
                {t(mode ? "overlay" : "separate")}
              </button>
            ))}
          </div>
        )}
        {panels.map((panel) => (
          <section key={panel.id} className="min-w-0">
            {panel.label && (
              <p className="mb-2 text-xs text-muted-foreground">
                {panel.label}
              </p>
            )}
            <ExplorationPlot panel={panel} />
            {panel.pairedCount != null && (
              <p className="text-xs text-muted-foreground">
                {t("paired")}: {panel.pairedCount}
              </p>
            )}
            <ExplorationData panel={panel} />
          </section>
        ))}
        <div className="space-y-1 pt-1 text-xs leading-5 text-muted-foreground">
          <p>
            {t("records")}: {value.provenance.matchedCount} · {t("missing")}:{" "}
            {value.provenance.missingCount}
          </p>
          {[
            ...value.notes.filter((n) => n !== "MULTI_AXES"),
            ...(overlay && panels.some((p) => p.extraY?.length)
              ? ["MULTI_AXES" as const]
              : []),
          ].map((note) => (
            <p key={note}>{t(`notes.${note}`)}</p>
          ))}
        </div>
      </div>
    </CoachCard>
  );
}
