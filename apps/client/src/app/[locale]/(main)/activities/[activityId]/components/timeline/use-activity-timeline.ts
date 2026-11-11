"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useQueries,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { Activity } from "@/api/activities";
import {
  fetchActivityMetricSeries,
  type MetricId,
  type MetricSeriesResult,
} from "@/api/useActivityMetric";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { TimelineMetricId } from "@/hooks/useActivityTimelineLayout";
import { useStore } from "@/lib/store";
import { formatValue, getUnit } from "@/hooks/useFormatterBySettings";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import {
  normalizeTimelineSeries,
  timelineOrigin,
  timelineTimestamp,
  timelineNumber,
  timelineDistanceIndex,
  timelineGapLimit,
  timelineLaps,
  type TimelinePoint,
} from "@/lib/activity-timeline";
import type { TimelineTrackResponse } from "@shared/activity-timeline";

export type TimelineMetric = {
  id: TimelineMetricId;
  points: TimelinePoint[];
  gap: number;
  unit: string;
  colorMetric: string;
  format: (value: number) => string;
  inverted?: boolean;
  calculated?: boolean;
};

const METRICS: MetricId[] = [
  "enhancedAltitude",
  "altitude",
  "speed",
  "heartRate",
  "cadence",
  "power",
  "distance",
  "stepLength",
  "stanceTime",
  "temperature",
];
const combineQueries = (results: UseQueryResult<MetricSeriesResult>[]) => ({
  data: results.map((result) => result.data),
  loading: results.some((result) => result.isPending),
  errors: results
    .filter((result) => result.isError)
    .map((result) => result.refetch),
});
const EMPTY_POINTS: TimelinePoint[] = [];
const EMPTY_TRACK: Extract<
  TimelineTrackResponse,
  { status: "available" }
>["segments"] = [];

export function useActivityTimeline(activity: Activity, activityId: string) {
  const systemUnit = useStore((state) => state.systemUnit);
  const running = activity.sportType === "RUN";
  const requested = METRICS;
  const queries = useQueries({
    combine: combineQueries,
    queries: requested.map((metric) => ({
      queryKey: queryKeys.activity.metricSeries(activityId, metric),
      queryFn: () => fetchActivityMetricSeries(activityId, metric),
    })),
  });
  const track = useQuery({
    queryKey: queryKeys.activity.timelineTrack(activityId),
    queryFn: () =>
      apiFetch<TimelineTrackResponse>(
        `/activities/${encodeURIComponent(activityId)}/timeline-track`,
        { suppressErrorToast: true },
      ),
    enabled: !activity.trainer,
    retry: false,
    meta: { errorSurface: "silent" },
  });
  const { data, loading } = queries;
  const candidateOrigin = useMemo(
    () =>
      timelineOrigin(activity, [
        ...data.map((result) => result?.rows ?? []),
        track.data?.status === "available"
          ? track.data.segments.flatMap((segment) =>
              segment.length
                ? [{ time: new Date(segment[0][0]).toISOString() }]
                : [],
            )
          : [],
      ]),
    [activity, data, track.data],
  );
  const [fallbackOrigin, setFallbackOrigin] = useState<number | null>(null);
  const readyOrigin =
    timelineTimestamp(activity.startTime) !== null ||
    (!loading && (activity.trainer || !track.isPending));
  useEffect(() => {
    if (readyOrigin && candidateOrigin !== null)
      setFallbackOrigin((current) => current ?? candidateOrigin);
  }, [readyOrigin, candidateOrigin]);
  const origin = timelineTimestamp(activity.startTime) ?? fallbackOrigin;
  // Query results retain their references between pointer updates. The memo
  // keys below only change when source data or formatting preferences change.
  const model = useMemo(() => {
    if (origin === null || !readyOrigin) return null;
    const requested = METRICS;
    const byMetric = new Map(
      requested.map((metric, index) => [metric, data[index]]),
    );
    const end = timelineTimestamp(activity.endTime);
    const elapsed = timelineNumber(activity.elapsedTime);
    const declaredDuration =
      end !== null && end > origin
        ? (end - origin) / 1000
        : elapsed && elapsed > 0
          ? elapsed
          : null;
    const series = (metric: MetricId, field: string = metric) =>
      normalizeTimelineSeries(
        byMetric.get(metric)?.rows ?? [],
        field,
        origin,
      ).filter(
        (point) =>
          declaredDuration === null || point.time <= declaredDuration + 5,
      );
    const elevation = series("enhancedAltitude");
    const definitions: {
      id: TimelineMetricId;
      points: TimelinePoint[];
      type: string;
      colorMetric: string;
    }[] = [
      {
        id: "elevation",
        points: elevation.some((point) => point.value !== null)
          ? elevation
          : series("altitude"),
        type: "elevation",
        colorMetric: "altitude",
      },
      {
        id: running ? "pace" : "speed",
        points: series("speed"),
        type: running ? "pace" : "speed",
        colorMetric: "pace",
      },
      {
        id: "power",
        points: series(
          "power",
          byMetric.get("power")?.metadata.powerSource === "CALCULATED"
            ? "calculatedPower"
            : "power",
        ),
        type: "power",
        colorMetric: "power",
      },
      ...(running
        ? [
            {
              id: "speed" as const,
              points: series("speed"),
              type: "speed",
              colorMetric: "pace",
            },
          ]
        : []),
      {
        id: "stride",
        points: series("stepLength"),
        type: "length",
        colorMetric: "stepLength",
      },
      {
        id: "stanceTime",
        points: series("stanceTime"),
        type: "milliseconds",
        colorMetric: "stanceTime",
      },
      {
        id: "temperature",
        points: series("temperature"),
        type: "temperature",
        colorMetric: "temperature",
      },
      {
        id: "heartRate",
        points: series("heartRate"),
        type: "heartRate",
        colorMetric: "heartRate",
      },
      {
        id: running ? "cadence" : "pedaling",
        points: series("cadence"),
        type: "cadence",
        colorMetric: "cadence",
      },
    ];
    const metrics: TimelineMetric[] = definitions
      .map((definition) => {
        const points = definition.points.map((point) => {
          let value = point.value;
          if (value !== null && definition.id === "pace")
            value =
              value > 0.5
                ? (systemUnit === "imperial" ? 1609.344 : 1000) / value
                : null;
          if (value !== null && definition.type === "cadence" && running)
            value *= 2;
          if (value !== null && definition.id === "speed")
            value *= systemUnit === "imperial" ? 2.236936 : 3.6;
          if (
            value !== null &&
            definition.id === "elevation" &&
            systemUnit === "imperial"
          )
            value *= 3.28084;
          if (value !== null && definition.id === "stride")
            value = (value / 1000) * (systemUnit === "imperial" ? 3.28084 : 1);
          return { ...point, value };
        });
        return {
          id: definition.id,
          points,
          gap: timelineGapLimit(points),
          colorMetric: definition.colorMetric,
          unit:
            definition.type === "cadence"
              ? running
                ? "spm"
                : "rpm"
              : getUnit(definition.type, systemUnit),
          inverted: definition.id === "pace",
          calculated:
            definition.id === "power" &&
            byMetric.get("power")?.metadata.powerSource === "CALCULATED",
          format: (value: number) =>
            definition.id === "pace"
              ? formatSecondsToTime(Math.round(value))
              : definition.id === "speed"
                ? value.toFixed(1)
                : definition.id === "stride" || definition.id === "temperature"
                  ? value.toFixed(1)
                  : String(Math.round(value)),
        };
      })
      .filter(
        (metric) =>
          metric.points.filter((point) => point.value !== null).length >= 2,
      );
    const distance = timelineDistanceIndex(series("distance"));
    let duration = declaredDuration ?? 0;
    for (const metric of metrics)
      duration = Math.max(duration, metric.points.at(-1)?.time ?? 0);
    return {
      metrics,
      distance,
      distanceGap: timelineGapLimit(distance),
      duration,
      origin,
      laps: timelineLaps(activity.laps ?? [], origin, duration),
      groupingSeries: {
        heartRate: series("heartRate").map((point) => ({
          ...point,
          value: point.value !== null && point.value > 0 ? point.value : null,
        })),
        power: series(
          "power",
          byMetric.get("power")?.metadata.powerSource === "CALCULATED"
            ? "calculatedPower"
            : "power",
        ),
        pace: series("speed").map((point) => ({
          time: point.time,
          value:
            point.value !== null && point.value > 0 ? 1 / point.value : null,
        })),
      },
    };
  }, [origin, readyOrigin, systemUnit, activity, running, data]);
  return {
    model,
    loading,
    errors: queries.errors,
    retry: () => {
      for (const refetch of queries.errors) void refetch();
    },
    segments:
      track.data?.status === "available" ? track.data.segments : EMPTY_TRACK,
    formatDistance: (value: number) =>
      `${formatValue(value, "distance", systemUnit)} ${getUnit("distance", systemUnit)}`,
    distance: model?.distance ?? EMPTY_POINTS,
  };
}
