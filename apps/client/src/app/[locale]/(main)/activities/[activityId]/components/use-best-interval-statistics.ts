"use client";

import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import type { Activity, ActivityPeakMetric } from "@/api/activities";
import {
  fetchActivityMetricSeries,
  type MetricSeriesResult,
  type MetricId,
} from "@/api/useActivityMetric";
import { queryKeys } from "@/lib/query-keys";
import { ACTIVITY_ANALYSIS_CACHE } from "@/lib/activity-analysis-cache";
import {
  normalizeTimelineSeries,
  timelineTimestamp,
  timelineGapLimit,
} from "@/lib/activity-timeline";
import { timelineMetricStatistics } from "@/lib/activity-timeline-segments";
import {
  INTERVAL_COLUMN_METRIC,
  type BestIntervalColumn,
} from "@/lib/activity-best-interval-columns";

const combine = (results: UseQueryResult<MetricSeriesResult>[]) => ({
  data: results.map((result) => result.data),
  pending: results.map((result) => result.isPending),
});

export function useBestIntervalStatistics(
  activityId: string,
  activity: Activity | undefined,
  peaks: ActivityPeakMetric[],
  columns: BestIntervalColumn[],
) {
  const requested = useMemo(
    () =>
      peaks.length
        ? [
            ...new Set(
              columns.flatMap((column) => {
                const metric = INTERVAL_COLUMN_METRIC[column];
                return metric ? [metric] : [];
              }),
            ),
          ]
        : [],
    [columns, peaks.length],
  );
  const { data, pending } = useQueries({
    combine,
    queries: requested.map((metric) => ({
      ...ACTIVITY_ANALYSIS_CACHE,
      queryKey: queryKeys.activity.metricSeries(activityId, metric),
      queryFn: ({ signal }) =>
        fetchActivityMetricSeries(activityId, metric, signal),
    })),
  });
  return useMemo(() => {
    const origin = timelineTimestamp(activity?.startTime);
    const series = requested.map((metric, index) => {
      const result = data[index];
      const calculated =
        metric === "power" && result?.metadata.powerSource === "CALCULATED";
      const key = calculated ? "calculatedPower" : metric;
      const points =
        origin === null
          ? []
          : normalizeTimelineSeries(result?.rows ?? [], key, origin).map(
              (point) => ({
                ...point,
                value:
                  metric === "heartRate" &&
                  point.value !== null &&
                  point.value <= 0
                    ? null
                    : point.value,
              }),
            );
      return {
        metric,
        points,
        gap: timelineGapLimit(points),
        calculated,
        loading: pending[index],
      };
    });
    return new Map(
      peaks.map((peak) => [
        peak.id,
        new Map(
          series.map((series) => [
            series.metric,
            {
              ...timelineMetricStatistics(
                series.points,
                [peak.startElapsedSec!, peak.endElapsedSec!],
                series.gap,
              ),
              calculated: series.calculated,
              loading: series.loading,
            },
          ]),
        ) as Map<
          MetricId,
          {
            average?: number | null;
            maximum?: number;
            calculated: boolean;
            loading: boolean;
          }
        >,
      ]),
    );
  }, [requested, activity?.startTime, data, pending, peaks]);
}
