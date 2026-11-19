import { apiFetch } from "@/lib/api";
import { useSimpleApiQuery } from "@/hooks/useApiQuery";

import type {
  HealthHrvType,
  HealthIntradayMetricKey,
  HealthIntradayResponse,
  HealthOverviewResponse,
} from "@shared/health-overview";

export type {
  DailyHealthData,
  DailyHealthMetric,
  HealthIntradayMetricKey,
  HealthIntradayPoint,
  HealthIntradayResponse,
  HealthOverviewResponse,
} from "@shared/health-overview";

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
  hrvType?: HealthHrvType,
) {
  const params = new URLSearchParams({ key, endDate });
  if (hrvType) params.set("hrvType", hrvType);
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
  hrvType?: HealthHrvType,
) {
  return useSimpleApiQuery(
    ["health-data", "intraday", key, endDate, hrvType ?? ""],
    () => getHealthIntraday(key, endDate, hrvType),
    { enabled, staleTime: 5 * 60 * 1000 },
  );
}

export function useHealthObservations(
  days = 30,
  endDate = localDateKey(),
  enabled = true,
) {
  return useSimpleApiQuery<
    import("@shared/health-observations").HealthObservationOverview
  >(
    ["health-data", "observations", String(days), endDate],
    async () =>
      (await apiFetch<
        import("@shared/health-observations").HealthObservationOverview
      >(
        `/health-data/observations?${new URLSearchParams({ days: String(days), endDate })}`,
        { suppressErrorToast: true },
      )) ?? {
        startDate: "",
        endDate: "",
        items: [],
        reports: [],
        truncated: false,
      },
    { enabled, staleTime: 5 * 60 * 1000 },
  );
}
