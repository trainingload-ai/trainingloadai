import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { SportType } from "@/lib/store";
import dayjs from "dayjs";

export interface ChartConfig {
  id: string;
  name: string;
  description?: string;
  type: "line" | "bar" | "scatter" | "heatmap";
  metric: string;
  dimension: string;
  filters?: Record<string, unknown>;
  timeRange?: {
    start: string;
    end: string;
  };
  config?: Record<string, unknown>;
  location?: string;
  position?: number;
  isVisible?: boolean;
}

export interface ChartResult {
  data: Array<{
    dimension: string;
    value: number;
    count?: number;
  }>;
  config: ChartConfig;
  metadata?: {
    totalPoints: number;
    timeRange?: string;
    activityCount?: number;
  };
}

export type SummaryMetricKey =
  | "count"
  | "distance"
  | "speed"
  | "duration"
  | "power"
  | "heartRate"
  | "cadence"
  | "time"
  | "climb"
  | "elevation"
  | "calories"
  | "hr";

export interface SummaryMetricResponse {
  rows: Array<{ time: string; value: number }>;
  metadata: { avg?: string; max?: string; min?: string; sum?: string };
}

export interface ChartSummaryMetaDataResponse {
  avg?: string;
  max?: string;
  min?: string;
  sum?: string;
}

export interface ChartSummaryRowsResponse {
  time: string;
  value: number;
}

export type ActivityMetricSummaryParams = {
  mode?:
    | "day"
    | "week"
    | "month"
    | "year"
    | "range"
    | "all-time"
    | "past-minutes";
  start?: string;
  end?: string;
  sportType?: SportType;
  agg?: "avg" | "max" | "min";
};

export async function getActivityMetricSummary(
  key: SummaryMetricKey,
  params?: ActivityMetricSummaryParams,
) {
  const search = new URLSearchParams();
  search.set("key", key);
  if (params?.start && params?.end) {
    search.set("start", params.start);
    search.set("end", params.end);
  }
  if (params?.mode) search.set("mode", params.mode);
  if (params?.sportType) search.set("sportType", params.sportType);
  if (params?.agg) search.set("agg", params.agg);
  const res = await apiFetch<SummaryMetricResponse>(
    `/charts/summary/metric?${search.toString()}`,
  );
  return res ?? { rows: [], metadata: {} };
}

// Get chart configs - Use useQuery as this is fetching data
export function useGetChartConfigs(location?: string) {
  return useQuery<ChartConfig[] | undefined>({
    queryKey: queryKeys.charts.configs(location),
    queryFn: () => {
      const url = location
        ? `/charts/config?location=${location}`
        : "/charts/config";
      return apiFetch<ChartConfig[]>(url);
    },
  });
}

// Activity overview (by key)
export function useActivityMetricSummary(
  key: SummaryMetricKey,
  params?: ActivityMetricSummaryParams,
  options?: {
    enabled?: boolean;
    initialData?: SummaryMetricResponse;
  },
) {
  return useQuery<SummaryMetricResponse>({
    queryKey: queryKeys.charts.activityMetricSummary(key, params),
    queryFn: () => getActivityMetricSummary(key, params),
    enabled: options?.enabled,
    initialData: options?.initialData,
  });
}

/**
 * Get chart summary metadata
 * @param key
 * @param params
 * @returns
 */
export function useChartSummaryMetadata(
  key: SummaryMetricKey,
  params?: {
    mode?: "day" | "week" | "month" | "year";
    end?: string;
    sportType?: SportType;
  },
) {
  return useQuery<ChartSummaryMetaDataResponse>({
    queryKey: queryKeys.charts.summaryMetadata(key, params),
    queryFn: async () => {
      const search = new URLSearchParams();
      search.set("key", key);
      if (params?.end) {
        search.set("end", params.end);
      }
      if (params?.mode) search.set("mode", params.mode);
      if (params?.sportType) search.set("sportType", params.sportType);
      const res = await apiFetch(
        `/charts/summary/metadata?${search.toString()}`,
      );
      return res as ChartSummaryMetaDataResponse;
    },
  });
}

/**
 * Get chart summary rows
 * @param key
 * @param params
 * @returns
 */
export function useChartSummaryRows(
  key: SummaryMetricKey,
  params?: {
    mode?: "day" | "week" | "month" | "year";
    end?: string;
    days?: number;
    sportType?: SportType;
  },
) {
  return useQuery<ChartSummaryRowsResponse[] | undefined>({
    queryKey: queryKeys.charts.summaryRows(key, params),
    enabled: !!params?.end,
    queryFn: async () => {
      const search = new URLSearchParams();
      search.set("key", key);
      if (params?.end) {
        search.set("end", params.end);
      }
      if (params?.mode) search.set("mode", params.mode);
      if (params?.days) search.set("days", String(params.days));
      if (params?.sportType) search.set("sportType", params.sportType);
      const res = await apiFetch<ChartSummaryRowsResponse[]>(
        `/charts/summary/rows?${search.toString()}`,
      );
      return res;
    },
  });
}

export type WeeklySummaryKey =
  | "weekPressure"
  | "weekCount"
  | "weekDuration"
  | "weekDistance"
  | "weekSpeed"
  | "weekPower"
  | "weekHeartRate"
  | "weekClimb"
  | "weekCalories";

/**
 * Dashboard 周总结卡片：本周/上周对比数据
 */
export type WeeklySummaryPairResponse = Record<
  WeeklySummaryKey,
  { current: number; previous: number }
>;

/**
 * 获取 Dashboard 周总结对比数据（聚合接口）
 * end 建议传 ISO 字符串，通常是 ISO 周的周末（endOf("isoWeek")）
 */
export function useWeeklySummaryPair(params?: {
  end?: string;
  sportType?: SportType;
}) {
  return useQuery<WeeklySummaryPairResponse | null>({
    queryKey: queryKeys.charts.weeklySummaryPair(params),
    enabled: !!params?.end,
    queryFn: async () => {
      if (!params?.end) return null;
      const search = new URLSearchParams();
      search.set("end", params.end);
      if (params.sportType) search.set("sportType", params.sportType);
      const res = await apiFetch<WeeklySummaryPairResponse>(
        `/charts/summary/week-pair?${search.toString()}`,
      );
      return res ?? null;
    },
  });
}

/**
 * FitnessStatus 专用：自动取 ISO 周末作为 end，并返回周总结对比数据
 */
export function useDashboardWeeklySummaryPair(sportType: SportType) {
  const end = dayjs().endOf("isoWeek").toISOString();
  return useWeeklySummaryPair({ end, sportType });
}

// Execute chart query - Use useMutation as this is a query operation (may involve complex calculation)
export function useExecuteChart() {
  return useMutation({
    mutationFn: (params: {
      metric: string;
      dimension: string;
      type?: string;
      sportType?: SportType;
      timeMode?: string;
      day?: string;
      startDate?: string;
      endDate?: string;
      granularity?: string;
    }) => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value);
        }
      });

      return apiFetch<ChartResult>(
        `/charts/execute?${searchParams.toString()}`,
      );
    },
  });
}

// Get available metrics - Use useQuery as this is static data
export function useGetMetrics() {
  return useQuery({
    queryKey: queryKeys.charts.metrics(),
    queryFn: () => apiFetch<unknown>("/charts/metrics"),
    // Metrics data rarely changes, can cache longer
  });
}

// Get available dimensions - Use useQuery as this is static data
export function useGetDimensions() {
  return useQuery({
    queryKey: queryKeys.charts.dimensions(),
    queryFn: () => apiFetch<unknown>("/charts/dimensions"),
    // Dimensions data rarely changes, can cache longer
  });
}

// Get chart templates - Use useQuery as this is fetching data
export function useGetChartTemplates() {
  return useQuery({
    queryKey: queryKeys.charts.templates(),
    queryFn: () => apiFetch<unknown>("/charts/templates"),
  });
}
