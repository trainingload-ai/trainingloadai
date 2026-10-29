import { useQueries, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(utc);
dayjs.extend(customParseFormat);

export type MetricId =
  | "speed"
  | "elevation"
  | "heartRate"
  | "power"
  | "aePower"
  | "re"
  | "ei"
  | "temperature"
  | "distance"
  | "climb"
  | "descend"
  | "enhancedelevation"
  | "enhancedSlope"
  | "slope"
  | "cadence"
  | "stepLength"
  | "cycleLength16"
  | "stanceTime"
  | "verticalOscillation"
  | "verticalRatio"
  | "flightTime"
  | "flightRatio"
  | "totalSteps"
  | "altitude"
  | "enhancedAltitude"
  | "pace";

export type Dimension =
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year";

export type AggregationType = "avg" | "sum" | "max" | "min" | "count";

export interface ChartValue {
  distance?: number;
  time?: string;
  // Direct field when supporting single aggregation type, e.g., metric
  [metric: string]: string | number | undefined;
  // Format when supporting multiple aggregation types, e.g., avg_metric, max_metric
}

export interface MetricSeriesResult extends FetchMetricResponse {
  startTime?: number;
  endTime?: number;
  totalDistance?: number; // only for distance
}

export const buildActivityMetricUrl = (
  activityId: string,
  metric?: MetricId,
) => {
  if (!metric) return "";

  const params = new URLSearchParams({
    activityId,
    metric,
  });

  return `/charts/execute/activity?${params.toString()}`;
};

export type FetchMetricResponse = {
  rows: ChartValue[];
  metadata: {
    avg?: string;
    max?: string;
    min?: string;
    sum?: string;
    count?: string;
    [key: string]: string | number | undefined;
  };
};

async function fetchActivityMetricSeries(
  activityId: string,
  metric: MetricId,
): Promise<MetricSeriesResult> {
  const response = await apiFetch<FetchMetricResponse>(
    buildActivityMetricUrl(activityId, metric),
  );

  if (!response?.rows?.length) {
    return {
      rows: [],
      metadata: {},
      startTime: undefined,
      endTime: undefined,
    };
  }

  return response;
}

export function useActivityMetricSeries(
  activityId: string,
  metric?: MetricId,
  enabled: boolean = true,
) {
  return useQuery<MetricSeriesResult>({
    queryKey: queryKeys.activity.metricSeries(activityId, metric),

    queryFn: () => fetchActivityMetricSeries(activityId, metric!),
    enabled: !!activityId && !!metric && enabled,
  });
}

export function useActivityMetricAvailability(
  activityId: string,
  metrics: MetricId[],
) {
  const uniqueMetrics = Array.from(new Set(metrics));
  const queries = useQueries({
    queries: uniqueMetrics.map((metric) => ({
      queryKey: queryKeys.activity.metricSeries(activityId, metric),
      queryFn: () => fetchActivityMetricSeries(activityId, metric),
      enabled: Boolean(activityId),
    })),
  });

  const availableMetrics = new Set<MetricId>();
  queries.forEach((query, index) => {
    if (query.data?.rows?.length) availableMetrics.add(uniqueMetrics[index]);
  });

  return {
    availableMetrics,
    isLoading: queries.some((query) => query.isLoading),
  };
}
