import { Time } from "@/components/DateSelector/types";
import { timeToRange } from "@/lib/timeRange";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { SportType } from "@/lib/store";
import type { PaceZoneModel } from "@/api/settings";

type PaceDistanceKey =
  | "400m"
  | "800m"
  | "1500m"
  | "1mi"
  | "3k"
  | "5k"
  | "10k"
  | "20k"
  | "42.2k"
  | "50m"
  | "100m"
  | "200m"
  | "400m_swim"
  | "800m_swim"
  | "1500m_swim";

export interface PaceCurveItem {
  timeRange: { start?: string; end?: string };
  [key: string]: number | { start?: string; end?: string } | undefined;
}

const RUN_CYCLING_DISTANCES: { key: PaceDistanceKey; label: string }[] = [
  { key: "400m", label: "400m" },
  { key: "800m", label: "800m" },
  { key: "1500m", label: "1500m" },
  { key: "1mi", label: "1mi" },
  { key: "3k", label: "3k" },
  { key: "5k", label: "5k" },
  { key: "10k", label: "10k" },
  { key: "20k", label: "20k" },
  { key: "42.2k", label: "42.2k" },
];

const SWIM_DISTANCES: { key: PaceDistanceKey; label: string }[] = [
  { key: "50m", label: "50m" },
  { key: "100m", label: "100m" },
  { key: "200m", label: "200m" },
  { key: "400m_swim", label: "400m" },
  { key: "800m_swim", label: "800m" },
  { key: "1500m_swim", label: "1500m" },
];

function getDistancesBySportType(sportType: SportType) {
  if (sportType === "SWIM") return SWIM_DISTANCES;
  return RUN_CYCLING_DISTANCES;
}

async function getPaceCurveByTimeRanges(
  timeRanges: Time[],
  sportType: SportType,
): Promise<PaceCurveItem[]> {
  const ranges = timeRanges.map((t) => timeToRange(t)).filter(Boolean) as {
    start?: string;
    end?: string;
  }[];
  if (!ranges.length) return [];
  if (sportType === "all") return [];
  const res = await apiFetch<
    Array<{
      timeRange: { start?: string; end?: string };
      values: Record<
        string,
        | {
            paceSec: number;
            timeSec: number;
            paceBaseM?: number | null;
          }
        | undefined
      >;
    }>
  >("/pace/distance-performance", {
    method: "POST",
    body: JSON.stringify({
      sportType,
      ranges,
    }),
  });
  return (
    res?.map((row) => {
      const item: PaceCurveItem = { timeRange: row.timeRange };
      const distances = getDistancesBySportType(sportType);
      distances.forEach(({ key }) => {
        const v = row.values[key];
        item[key] = v?.paceSec ?? 0;
      });
      return item;
    }) || []
  );
}

export interface PaceBestPerformanceItem {
  timeRange: { start?: string; end?: string };
  values: Record<
    string,
    | {
        paceSec: number;
        timeSec: number;
        paceBaseM?: number | null;
        activityId?: number;
        activityTime?: string;
      }
    | undefined
  >;
  topValues?: Record<
    string,
    Array<{
      paceSec: number;
      timeSec: number;
      paceBaseM?: number | null;
      activityId?: number;
      activityTime?: string;
    }>
  >;
}

async function getPaceBestPerformance(
  timeRanges: Time[],
  sportType: SportType,
  distances?: number[],
  mode: "distance" | "time" = "distance",
  targets?: number[],
  limit: number = 1,
): Promise<PaceBestPerformanceItem[]> {
  const ranges = timeRanges.map((t) => timeToRange(t)).filter(Boolean) as {
    start?: string;
    end?: string;
  }[];
  if (!ranges.length) return [];
  if (sportType === "all") return [];
  const res = await apiFetch<PaceBestPerformanceItem[]>(
    "/pace/distance-performance",
    {
      method: "POST",
      body: JSON.stringify({
        sportType,
        ranges,
        distances,
        mode,
        targets,
        limit,
      }),
    },
  );
  return res || [];
}

export function usePaceBestPerformance(
  timeRanges: Time[] | null,
  sportType: SportType,
  distances?: number[],
  mode: "distance" | "time" = "distance",
  targets?: number[],
  limit: number = 1,
) {
  return useQuery({
    queryKey: queryKeys.pace.bestPerformance(
      timeRanges,
      sportType,
      distances,
      mode,
      targets,
      limit,
    ),
    queryFn: () =>
      getPaceBestPerformance(
        timeRanges!,
        sportType,
        distances,
        mode,
        targets,
        limit,
      ),
    enabled: !!timeRanges && !!sportType && sportType !== "all",
  });
}

export function usePaceDistanceCurve(
  timeRanges: Time[] | null,
  sportType: SportType,
) {
  return useQuery({
    queryKey: queryKeys.pace.distanceCurve(timeRanges, sportType),
    queryFn: () => getPaceCurveByTimeRanges(timeRanges!, sportType),
    enabled: !!timeRanges && timeRanges.length > 0 && sportType !== "all",
  });
}

type PaceDistancePerformanceValue = {
  paceSec: number;
  timeSec: number;
};

export interface PaceDistancePerformanceItem {
  timeRange: { start?: string; end?: string };
  [key: string]:
    | PaceDistancePerformanceValue
    | { start?: string; end?: string }
    | undefined;
}

export interface PaceZoneValue {
  name: string;
  order?: number;
  duration?: number;
  percent?: number;
  min?: number;
  max?: number;
  avg?: number;
  color?: string;
}

export interface PaceZoneResponse {
  benchmark?: unknown;
  zones: PaceZoneValue[];
}

export interface PaceZonePreviewsResponse {
  models: Record<PaceZoneModel, PaceZoneResponse>;
  hasSavedSetting: boolean;
}

export function usePaceZonePreviews(sportType: "RUN" | "SWIM") {
  return useQuery({
    queryKey: queryKeys.pace.zonePreviews(sportType),
    queryFn: () =>
      apiFetch<PaceZonePreviewsResponse>(
        `/users/zones/preview?sportType=${sportType}&zoneType=PACE`,
      ),
  });
}

async function getPaceZones(
  activityId?: string | null,
  sportType?: SportType | string,
): Promise<PaceZoneResponse> {
  const params = new URLSearchParams();
  if (activityId) params.append("activityId", activityId);
  if (sportType && sportType !== "all") params.append("sportType", sportType);
  const response = await apiFetch<PaceZoneResponse>(
    `/pace/zones?${params.toString()}`,
  );

  return response ?? { zones: [] };
}

export function useResolvedPaceZones(
  activityId?: string | null,
  sportType?: SportType | string,
) {
  return useQuery({
    queryKey: queryKeys.pace.zones(activityId, sportType),
    queryFn: () => getPaceZones(activityId, sportType),
    enabled: Boolean(activityId || (sportType && sportType !== "all")),
  });
}

export interface PaceZonesDistributionByRange {
  timeRange: { start?: string; end?: string };
  zones: PaceZoneValue[];
  benchmark?: unknown;
}

async function getPaceZonesDistributionByTimeRanges(
  timeRanges: Time[],
  sportType: SportType,
): Promise<PaceZonesDistributionByRange[]> {
  const ranges = timeRanges
    .map((t) => timeToRange(t))
    .filter((r): r is { start?: string; end?: string } => Boolean(r));
  if (!ranges.length || sportType === "all") return [];
  const data = await apiFetch("/activities/pace/zones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timeRanges: ranges, sportType }),
  });
  return (data || []) as PaceZonesDistributionByRange[];
}

export function usePaceZonesDistribution(
  timeRanges: Time[] | null,
  sportType: SportType,
) {
  return useQuery<PaceZonesDistributionByRange[]>({
    queryKey: queryKeys.pace.zonesDistribution(timeRanges, sportType),
    queryFn: () => getPaceZonesDistributionByTimeRanges(timeRanges!, sportType),
    enabled: !!timeRanges && timeRanges.length > 0 && sportType !== "all",
  });
}

async function getPaceDistancePerformanceByTimeRanges(
  timeRanges: Time[],
  sportType: SportType,
): Promise<PaceDistancePerformanceItem[]> {
  const ranges = timeRanges.map((t) => timeToRange(t)).filter(Boolean) as {
    start?: string;
    end?: string;
  }[];
  if (!ranges.length) return [];
  if (sportType === "all") return [];
  const res = await apiFetch<
    {
      timeRange: { start?: string; end?: string };
      values: Record<
        string,
        | {
            paceSec: number;
            timeSec: number;
            paceBaseM?: number | null;
          }
        | undefined
      >;
    }[]
  >("/pace/distance-performance", {
    method: "POST",
    body: JSON.stringify({
      sportType,
      ranges,
    }),
  });
  const items: PaceDistancePerformanceItem[] =
    res?.map((row) => {
      const item: PaceDistancePerformanceItem = {
        timeRange: row.timeRange,
      };
      const distances = getDistancesBySportType(sportType);
      distances.forEach(({ key }) => {
        const v = row.values[key];
        if (v) {
          item[key] = { paceSec: v.paceSec, timeSec: v.timeSec };
        } else {
          item[key] = undefined;
        }
      });
      return item;
    }) || [];
  return items;
}

export function usePaceDistancePerformance(
  timeRanges: Time[] | null,
  sportType: SportType,
) {
  return useQuery({
    queryKey: queryKeys.pace.distancePerformance(timeRanges, sportType),
    queryFn: () =>
      getPaceDistancePerformanceByTimeRanges(timeRanges!, sportType),
    enabled: !!timeRanges && timeRanges.length > 0 && sportType !== "all",
  });
}

export type CSProfile = {
  sportType: SportType;
  csMps: number | null;
  dPrimeM: number | null;
  r2: number | null;
  sampleCount: number | null;
  windowDays?: number | null;
  method?: string | null;
  calculatedAt?: string | null;
  predictions: Array<{
    key: PaceDistanceKey;
    distanceM: number;
    timeSec: number;
    paceSec: number;
  }>;
};

async function getPaceCS(
  sportType: SportType,
  windowDays?: number,
): Promise<CSProfile | null> {
  if (sportType === "all") return null;
  const qs = new URLSearchParams();
  qs.set("sportType", sportType);
  if (windowDays != null) qs.set("windowDays", String(windowDays));
  const res = await apiFetch(`/users/pace/cs?${qs.toString()}`, {
    method: "GET",
  });
  return res as CSProfile;
}

export function usePaceCS(sportType: SportType, windowDays?: number) {
  return useQuery({
    queryKey: queryKeys.pace.cs(sportType, windowDays),
    queryFn: () => getPaceCS(sportType, windowDays),
    enabled: sportType !== "all",
  });
}
