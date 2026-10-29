import { apiFetch } from "@/lib/api";
import { useSimpleApiQuery } from "@/hooks/useApiQuery";

export type DailyHealthMetric = {
  type: string;
  value: number;
  unit: string | null;
  provider: string | null;
};

export type DailyHealthData = {
  date: string;
  timezone: string | null;
  metrics: DailyHealthMetric[];
};

export type HealthOverviewResponse = {
  startDate: string;
  endDate: string;
  days: DailyHealthData[];
};

export type HealthIntradayMetricKey =
  | "sleep"
  | "hrv"
  | "restingHeartRate"
  | "stress"
  | "bodyBattery";

export type HealthIntradayPoint = {
  time: string;
  endTime?: string;
  value: number;
  stage?: string;
  provider?: string;
};

export type HealthIntradayResponse = {
  key: HealthIntradayMetricKey;
  granularity: "intraday";
  currentDate: string;
  previousDate: string;
  current: HealthIntradayPoint[];
  previous: HealthIntradayPoint[];
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getHealthOverview(days = 30, endDate = localDateKey()) {
  const params = new URLSearchParams({ days: String(days), endDate });
  return (
    (await apiFetch<HealthOverviewResponse>(
      `/health-data/overview?${params.toString()}`,
      { suppressErrorToast: true },
    )) ?? { startDate: "", endDate: "", days: [] }
  );
}

export function useHealthOverview(days = 30) {
  const endDate = localDateKey();
  return useSimpleApiQuery(
    ["health-data", "overview", String(days), endDate],
    () => getHealthOverview(days, endDate),
    { staleTime: 5 * 60 * 1000 },
  );
}

export async function getHealthIntraday(
  key: HealthIntradayMetricKey,
  endDate = localDateKey(),
) {
  const params = new URLSearchParams({ key, endDate });
  return (
    (await apiFetch<HealthIntradayResponse>(
      `/health-data/intraday?${params.toString()}`,
      { suppressErrorToast: true },
    )) ?? {
      key,
      granularity: "intraday" as const,
      currentDate: endDate,
      previousDate: "",
      current: [],
      previous: [],
    }
  );
}

export function useHealthIntraday(
  key: HealthIntradayMetricKey,
  enabled = true,
  endDate = localDateKey(),
) {
  return useSimpleApiQuery(
    ["health-data", "intraday", key, endDate],
    () => getHealthIntraday(key, endDate),
    { enabled, staleTime: 5 * 60 * 1000 },
  );
}
