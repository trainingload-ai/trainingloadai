"use client";

import type { ActivityPeakMetric } from "@/api/activities";
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
    "min-h-11 w-full rounded-sm px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    active
      ? "border border-[#4b8b70]/45 bg-[#4b8b70]/10 text-[#245843] dark:border-[#8bc7ab]/45 dark:bg-[#4b8b70]/20 dark:text-[#b8dec9]"
      : "hover:bg-muted focus-visible:bg-muted",
  );
}

export function BestIntervals({ activityId }: { activityId: string }) {
  const t = useTranslations("ActivityDetail.bestIntervals");
  const tMetric = useTranslations("ActivityDetail.activityAnalysis");
  const { data: activity } = useGetActivity(activityId);
  const systemUnit = useStore((state) => state.systemUnit) as UnitSystem;
  const { selectedInterval, setSelectedInterval } = useActivityAnalysisLink();
  const peaks = selectDisplayPeaks(
    activity?.activityPeakMetrics ?? [],
    activity?.sportType,
  );
  if (!peaks.length) return null;

  const timePeaks = peaks.filter((peak) => peak.scaleType === "TIME");
  const distancePeaks = peaks
    .filter((peak) => peak.scaleType === "DISTANCE")
    .sort((a, b) => a.scaleValue - b.scaleValue);
  const metricOrder: MetricType[] =
    activity?.sportType === "CYCLING"
      ? ["power", "hr", "pace"]
      : ["pace", "hr", "power"];
  const availableTypes = metricOrder.filter((type) =>
    timePeaks.some((peak) => peak.type === type),
  );
  const timeScales = [
    ...new Set(timePeaks.map((peak) => peak.scaleValue)),
  ].sort((a, b) => a - b);
  const hasTimePeaks = timeScales.length > 0 && availableTypes.length > 0;
  const defaultBreakdown = getBestIntervalDefaultBreakdown(
    activity?.sportType,
    distancePeaks.length > 0,
  );

  const togglePeak = (peak: ActivityPeakMetric) => {
    setSelectedInterval(selectedInterval?.id === peak.id ? null : peak);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        {selectedInterval ? (
          <button
            type="button"
            className="min-h-11 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setSelectedInterval(null)}
          >
            {t("clear")}
          </button>
        ) : null}
      </div>

      {selectedInterval ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-border bg-muted/45 px-4 py-3 text-sm">
          <span className="font-medium text-foreground">{t("selected")}</span>
          <span className="font-mono font-semibold tabular-nums">
            {tMetric(selectedInterval.type)} ·{" "}
            {scaleLabel(selectedInterval, systemUnit)} ·{" "}
            {valueLabel(selectedInterval, systemUnit)}
          </span>
          <span className="text-muted-foreground">
            {selectedInterval.scaleType === "TIME"
              ? t("timeRange")
              : t("location")}{" "}
            {selectedInterval.scaleType === "TIME"
              ? peakTimeRangeLabel(selectedInterval)
              : peakLocationLabel(selectedInterval, systemUnit)}
          </span>
        </div>
      ) : null}

      <Tabs defaultValue={defaultBreakdown} className="space-y-3">
        <TabsList aria-label={t("title")}>
          {distancePeaks.length > 0 ? (
            <TabsTrigger value="distance">{t("distanceSection")}</TabsTrigger>
          ) : null}
          {hasTimePeaks ? (
            <TabsTrigger value="time">{t("timeSection")}</TabsTrigger>
          ) : null}
        </TabsList>

        {distancePeaks.length > 0 ? (
          <TabsContent value="distance" className="mt-0">
            <section className="overflow-hidden rounded-md border border-border bg-card">
              <div className="border-b border-border px-4 py-2.5">
                <p className="text-xs text-muted-foreground">
                  {t("distanceSectionDescription")}
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("distance")}</TableHead>
                      <TableHead>{tMetric("pace")}</TableHead>
                      <TableHead>{t("effortTime")}</TableHead>
                      <TableHead>{t("location")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {distancePeaks.map((peak) => {
                      const active = selectedInterval?.id === peak.id;
                      const effortTime =
                        (peak.endElapsedSec ?? 0) - (peak.startElapsedSec ?? 0);
                      return (
                        <TableRow
                          key={peak.id}
                          data-state={active ? "selected" : undefined}
                        >
                          <TableCell className="font-mono font-medium tabular-nums">
                            {distanceLabel(peak.scaleValue, systemUnit)}
                          </TableCell>
                          <TableCell className="p-1.5">
                            <button
                              type="button"
                              aria-pressed={active}
                              className={metricButtonClass(active)}
                              onClick={() => togglePeak(peak)}
                            >
                              <span className="font-mono text-sm font-semibold tabular-nums">
                                {valueLabel(peak, systemUnit)}
                              </span>
                            </button>
                          </TableCell>
                          <TableCell className="font-mono tabular-nums">
                            {formatSecondsToTime(effortTime, {
                              showHours: effortTime >= 3600,
                            })}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {peakLocationLabel(peak, systemUnit)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          </TabsContent>
        ) : null}

        {hasTimePeaks ? (
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
                  <section className="overflow-hidden rounded-md border border-border bg-card">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("duration")}</TableHead>
                            <TableHead>{tMetric(type)}</TableHead>
                            <TableHead>{t("timeRange")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {timeScales.map((scale) => {
                            const peak = timePeaks.find(
                              (item) =>
                                item.type === type && item.scaleValue === scale,
                            );
                            if (!peak) return null;
                            const active = selectedInterval?.id === peak.id;
                            return (
                              <TableRow
                                key={scale}
                                data-state={active ? "selected" : undefined}
                              >
                                <TableCell className="font-mono font-medium tabular-nums">
                                  {timeScaleLabel(scale)}
                                </TableCell>
                                <TableCell className="p-1.5">
                                  <button
                                    type="button"
                                    aria-pressed={active}
                                    className={metricButtonClass(active)}
                                    onClick={() => togglePeak(peak)}
                                  >
                                    <span className="font-mono text-sm font-semibold tabular-nums">
                                      {valueLabel(peak, systemUnit)}
                                    </span>
                                  </button>
                                </TableCell>
                                <TableCell className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">
                                  {peakTimeRangeLabel(peak)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </section>
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
