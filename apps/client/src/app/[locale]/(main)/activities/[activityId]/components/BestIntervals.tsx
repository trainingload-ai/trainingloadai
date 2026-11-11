"use client";

import type { ActivityPeakMetric } from "@/api/activities";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getBrowserLocalStorage } from "@/lib/browser-storage";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import {
  DEFAULT_BEST_INTERVAL_COLUMNS,
  INTERVAL_COLUMN_METRIC,
  normalizeBestIntervalColumns,
  type BestIntervalColumn,
} from "@/lib/activity-best-interval-columns";
import { BestIntervalColumnsDialog } from "./best-interval-columns-dialog";
import { useBestIntervalStatistics } from "./use-best-interval-statistics";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetActivity } from "@/hooks/useActivities";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import { useTranslations } from "next-intl";
import { useActivityAnalysisLink } from "./activity-analysis-link-context";

type MetricType = ActivityPeakMetric["type"];
type UnitSystem = "metric" | "imperial";

const RUN_TIME_SCALES = new Set([60, 300, 600, 1200, 1800]);
const CYCLING_TIME_SCALES = new Set([5, 30, 60, 300, 1200, 1800]);
const DISTANCE_SCALES = new Set([
  400, 800, 1000, 1500, 1609, 3000, 5000, 10000,
]);
const METERS_PER_MILE = 1609.344;

export function isLocatablePeak(metric: ActivityPeakMetric) {
  return (
    typeof metric.value === "number" &&
    Number.isFinite(metric.value) &&
    metric.value > 0 &&
    typeof metric.startElapsedSec === "number" &&
    Number.isFinite(metric.startElapsedSec) &&
    typeof metric.endElapsedSec === "number" &&
    Number.isFinite(metric.endElapsedSec) &&
    metric.endElapsedSec > metric.startElapsedSec
  );
}

export function selectDisplayPeaks(
  peaks: ActivityPeakMetric[],
  sportType?: string | null,
) {
  const timeScales =
    sportType === "CYCLING" ? CYCLING_TIME_SCALES : RUN_TIME_SCALES;
  return peaks.filter(
    (peak) =>
      isLocatablePeak(peak) &&
      ((peak.scaleType === "TIME" && timeScales.has(peak.scaleValue)) ||
        (peak.type === "pace" &&
          peak.scaleType === "DISTANCE" &&
          DISTANCE_SCALES.has(peak.scaleValue))),
  );
}

export function getBestIntervalDefaultBreakdown(
  sportType: string | null | undefined,
  hasDistancePeaks: boolean,
) {
  return sportType === "CYCLING" || !hasDistancePeaks ? "time" : "distance";
}

function timeScaleLabel(seconds: number) {
  return formatSecondsToTime(seconds, { showHours: seconds >= 3600 });
}

function distanceLabel(meters: number, unitSystem: UnitSystem) {
  if (unitSystem === "imperial") {
    const miles = meters / METERS_PER_MILE;
    return `${Number(miles.toFixed(miles < 1 ? 2 : 1))} mi`;
  }
  return meters >= 1000
    ? `${Number((meters / 1000).toFixed(2))} km`
    : `${Math.round(meters)} m`;
}

function scaleLabel(metric: ActivityPeakMetric, unitSystem: UnitSystem) {
  return metric.scaleType === "TIME"
    ? timeScaleLabel(metric.scaleValue)
    : distanceLabel(metric.scaleValue, unitSystem);
}

function valueLabel(metric: ActivityPeakMetric, unitSystem: UnitSystem) {
  const value = metric.value ?? 0;
  if (metric.type === "power") return `${Math.round(value)} W`;
  if (metric.type === "hr") return `${Math.round(value)} bpm`;
  if (value <= 0) return "—";
  const paceDistance = unitSystem === "imperial" ? METERS_PER_MILE : 1000;
  const paceUnit = unitSystem === "imperial" ? "/mi" : "/km";
  return `${formatSecondsToTime(paceDistance / value)}${paceUnit}`;
}

function peakLocationLabel(metric: ActivityPeakMetric, unitSystem: UnitSystem) {
  if (
    typeof metric.startDistanceM === "number" &&
    typeof metric.endDistanceM === "number"
  ) {
    return `${distanceLabel(metric.startDistanceM, unitSystem)}–${distanceLabel(metric.endDistanceM, unitSystem)}`;
  }
  return `${formatSecondsToTime(metric.startElapsedSec ?? 0, { showHours: true })}–${formatSecondsToTime(metric.endElapsedSec ?? 0, { showHours: true })}`;
}

export function peakTimeRangeLabel(metric: ActivityPeakMetric) {
  return `${formatSecondsToTime(metric.startElapsedSec ?? 0, { showHours: true })}–${formatSecondsToTime(metric.endElapsedSec ?? 0, { showHours: true })}`;
}

function metricButtonClass(active: boolean) {
  return cn(
    "min-h-8 w-full rounded-control px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    active
      ? "bg-muted text-foreground"
      : "hover:bg-muted/60 focus-visible:bg-muted",
  );
}

function BestIntervalTable({
  activityId,
  peaks,
  mode,
  type,
}: {
  activityId: string;
  peaks: ActivityPeakMetric[];
  mode: "distance" | "time";
  type: MetricType;
}) {
  const t = useTranslations("ActivityDetail.bestIntervals");
  const tMetric = useTranslations("ActivityDetail.activityAnalysis");
  const tLap = useTranslations("ActivityLaps.columns");
  const { data: activity } = useGetActivity(activityId);
  const systemUnit = useStore((state) => state.systemUnit) as UnitSystem;
  const { selectedInterval, setSelectedInterval } = useActivityAnalysisLink();
  const defaults = useMemo<BestIntervalColumn[]>(
    () =>
      mode === "distance"
        ? [...DEFAULT_BEST_INTERVAL_COLUMNS]
        : ["scale", "value", "timeRange", "avgHeartRate", "maxHeartRate"],
    [mode],
  );
  const key = `activity-best-interval-columns-v1:${activity?.sportType ?? "RUN"}:${mode}`;
  const [columns, setColumns] = useState(defaults);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let next = defaults;
    try {
      const saved = getBrowserLocalStorage().getItem(key);
      if (saved) next = normalizeBestIntervalColumns(JSON.parse(saved));
    } catch {
      /* Use the standard columns when storage is unavailable. */
    }
    setColumns(next);
    setLoadedKey(key);
  }, [key, defaults]);
  useEffect(() => {
    if (loadedKey !== key) return;
    try {
      getBrowserLocalStorage().setItem(key, JSON.stringify(columns));
    } catch {
      /* Keep in-memory preferences. */
    }
  }, [key, loadedKey, columns]);
  const statistics = useBestIntervalStatistics(
    activityId,
    activity,
    peaks,
    columns,
  );
  const running = activity?.sportType === "RUN";
  const label = (column: BestIntervalColumn) => {
    switch (column) {
      case "scale":
        return t(mode === "distance" ? "distance" : "duration");
      case "value":
        return tMetric(type);
      case "duration":
        return t("effortTime");
      case "distance":
        return t("actualDistance");
      case "location":
        return t("location");
      case "timeRange":
        return t("timeRange");
      case "pace":
        return t(running ? "averagePace" : "averageSpeed");
      case "cadence":
        return tLap(running ? "avgRunCadence" : "avgCadence");
      case "stride":
        return tLap("avgStrideLength");
      case "stanceTime":
        return tLap("avgGroundContactTime");
      case "verticalOscillation":
        return tLap("avgVerticalOscillation");
      case "verticalRatio":
        return tLap("avgVerticalRatio");
      default:
        return tLap(column);
    }
  };
  const cell = (peak: ActivityPeakMetric, column: BestIntervalColumn) => {
    const seconds = peak.endElapsedSec! - peak.startElapsedSec!;
    switch (column) {
      case "scale":
        return scaleLabel(peak, systemUnit);
      case "value":
        return valueLabel(peak, systemUnit);
      case "duration":
        return formatSecondsToTime(seconds, { showHours: seconds >= 3600 });
      case "distance":
        return typeof peak.startDistanceM === "number" &&
          typeof peak.endDistanceM === "number"
          ? distanceLabel(peak.endDistanceM - peak.startDistanceM, systemUnit)
          : "—";
      case "location":
        return peakLocationLabel(peak, systemUnit);
      case "timeRange":
        return peakTimeRangeLabel(peak);
    }
    const metric = INTERVAL_COLUMN_METRIC[column];
    const summary = metric ? statistics.get(peak.id)?.get(metric) : undefined;
    if (summary?.loading) return <Skeleton className="h-3 w-12" />;
    const value =
      column === "maxHeartRate" || column === "maxPower"
        ? summary?.maximum
        : summary?.average;
    if (value == null || !Number.isFinite(value)) return "—";
    switch (column) {
      case "pace":
        return value > 0
          ? `${formatValue(value, running ? "pace" : "speed", systemUnit)} ${getUnit(running ? "pace" : "speed", systemUnit)}`
          : "—";
      case "avgHeartRate":
      case "maxHeartRate":
        return `${Math.round(value)} bpm`;
      case "avgPower":
      case "maxPower":
        return (
          <span title={summary?.calculated ? t("estimatedPower") : undefined}>
            {summary?.calculated ? "≈" : ""}
            {Math.round(value)} W
          </span>
        );
      case "cadence":
        return `${Math.round(value * (running ? 2 : 1))} ${running ? "spm" : "rpm"}`;
      case "stride":
        return `${formatValue(value / 1000, "length", systemUnit)} ${getUnit("length", systemUnit)}`;
      case "stanceTime":
        return `${Math.round(value)} ms`;
      case "verticalOscillation":
        return `${(value / (systemUnit === "imperial" ? 25.4 : 10)).toFixed(1)} ${systemUnit === "imperial" ? "in" : "cm"}`;
      case "verticalRatio":
        return `${value.toFixed(1)}%`;
      case "temperature":
        return `${value.toFixed(1)} °C`;
      default:
        return "—";
    }
  };
  return (
    <>
      <section
        className="overflow-hidden rounded-md border border-border/60 bg-card"
        aria-label={t(mode === "distance" ? "distanceSection" : "timeSection")}
      >
        <div className="overflow-x-auto overflow-y-hidden">
          <Table className="text-xs tabular-nums">
            <TableHeader className="bg-muted/40">
              <TableRow className="border-border/60 hover:bg-transparent">
                {columns.map((column) => (
                  <TableHead
                    key={column}
                    className="h-10 whitespace-nowrap px-4 text-xs font-medium text-muted-foreground"
                  >
                    {label(column)}
                  </TableHead>
                ))}
                <TableHead
                  className="sticky right-0 w-20 px-2"
                  style={{
                    background:
                      "color-mix(in srgb, var(--muted) 40%, var(--card))",
                  }}
                >
                  <Button
                    variant="ghost"
                    size="compact"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    aria-label={t("editColumns")}
                    title={t("editColumns")}
                    onClick={() => setEditing(true)}
                  >
                    {t("editColumns")}
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {peaks.map((peak) => {
                const active = selectedInterval?.id === peak.id;
                return (
                  <TableRow
                    key={peak.id}
                    data-state={active ? "selected" : undefined}
                    className="border-border/40 hover:bg-muted/20"
                  >
                    {columns.map((column, index) => (
                      <TableCell
                        key={column}
                        className={cn(
                          "whitespace-nowrap px-4 py-3",
                          column === "value" && "font-medium text-foreground",
                          ["location", "timeRange"].includes(column) &&
                            "text-muted-foreground",
                          (index === 0 || column === "value") && "px-2 py-1",
                        )}
                      >
                        {index === 0 || column === "value" ? (
                          <button
                            type="button"
                            aria-pressed={active}
                            aria-label={
                              column === "value"
                                ? `${tMetric(peak.type)} · ${scaleLabel(peak, systemUnit)} · ${valueLabel(peak, systemUnit)}`
                                : undefined
                            }
                            className={metricButtonClass(active)}
                            onClick={() =>
                              setSelectedInterval(active ? null : peak)
                            }
                          >
                            {cell(peak, column)}
                          </button>
                        ) : (
                          cell(peak, column)
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="p-0" />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
      {editing ? (
        <BestIntervalColumnsDialog
          columns={columns}
          defaults={defaults}
          label={label}
          onClose={() => setEditing(false)}
          onSave={setColumns}
        />
      ) : null}
    </>
  );
}

export function BestIntervals({ activityId }: { activityId: string }) {
  const t = useTranslations("ActivityDetail.bestIntervals");
  const tMetric = useTranslations("ActivityDetail.activityAnalysis");
  const { data: activity } = useGetActivity(activityId);
  const systemUnit = useStore((state) => state.systemUnit) as UnitSystem;
  const { selectedInterval, setSelectedInterval } = useActivityAnalysisLink();
  const peaks = useMemo(
    () =>
      selectDisplayPeaks(
        activity?.activityPeakMetrics ?? [],
        activity?.sportType,
      ),
    [activity?.activityPeakMetrics, activity?.sportType],
  );
  const distancePeaks = useMemo(
    () =>
      peaks
        .filter((peak) => peak.scaleType === "DISTANCE")
        .sort((a, b) => a.scaleValue - b.scaleValue),
    [peaks],
  );
  const timePeaks = useMemo(
    () => peaks.filter((peak) => peak.scaleType === "TIME"),
    [peaks],
  );
  const metricOrder: MetricType[] =
    activity?.sportType === "CYCLING"
      ? ["power", "hr", "pace"]
      : ["pace", "hr", "power"];
  const availableTypes = metricOrder.filter((type) =>
    timePeaks.some((peak) => peak.type === type),
  );
  const defaultBreakdown = getBestIntervalDefaultBreakdown(
    activity?.sportType,
    distancePeaks.length > 0,
  );
  if (!peaks.length) return null;
  return (
    <Tabs
      key={activityId}
      defaultValue={defaultBreakdown}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <TabsList aria-label={t("title")}>
          {distancePeaks.length ? (
            <TabsTrigger value="distance">{t("distanceSection")}</TabsTrigger>
          ) : null}
          {availableTypes.length ? (
            <TabsTrigger value="time">{t("timeSection")}</TabsTrigger>
          ) : null}
        </TabsList>
      </div>
      {selectedInterval ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-muted/40 px-3 py-2 text-xs tabular-nums">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{t("selected")}</span>
            <span>
              {tMetric(selectedInterval.type)} ·{" "}
              {scaleLabel(selectedInterval, systemUnit)} ·{" "}
              {valueLabel(selectedInterval, systemUnit)}
            </span>
            <span className="text-muted-foreground">
              {peakTimeRangeLabel(selectedInterval)}
            </span>
          </div>
          <Button
            variant="ghost"
            size="compact"
            onClick={() => setSelectedInterval(null)}
          >
            {t("clear")}
          </Button>
        </div>
      ) : null}
      {distancePeaks.length ? (
        <TabsContent value="distance" className="mt-0">
          <BestIntervalTable
            activityId={activityId}
            mode="distance"
            type="pace"
            peaks={distancePeaks}
          />
        </TabsContent>
      ) : null}
      {availableTypes.length ? (
        <TabsContent value="time" className="mt-0">
          <Tabs defaultValue={availableTypes[0]} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t("timeSectionDescription")}
              </p>
              <TabsList aria-label={t("timeSection")}>
                {availableTypes.map((type) => (
                  <TabsTrigger key={type} value={type}>
                    {tMetric(type)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {availableTypes.map((type) => (
              <TabsContent key={type} value={type} className="mt-0">
                <BestIntervalTable
                  activityId={activityId}
                  mode="time"
                  type={type}
                  peaks={timePeaks
                    .filter((peak) => peak.type === type)
                    .sort((a, b) => a.scaleValue - b.scaleValue)}
                />
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
