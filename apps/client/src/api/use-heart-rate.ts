import { Time } from "@/components/DateSelector/types";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { timeToRange } from "@/lib/timeRange";
import { useQuery } from "@tanstack/react-query";
import { SportType } from "@/lib/store";

export interface HeartRatePowerRatioData {
  time: string;
  distance: number;
  heartRate: number;
  power: number;
  ratio: number;
}

/**
 * Hook to get heart rate power ratio
 */
export function useHeartRatePowerRatio(activityId: string) {
  return useQuery({
    queryKey: queryKeys.heartRate.powerRatio(activityId),
    queryFn: async () => {
      try {
        const data = await apiFetch<HeartRatePowerRatioData[]>(
          `/activities/${activityId}/heart-power-ratio`,
        );
        return data || [];
      } catch (error) {
        console.error("Failed to get heart rate power ratio data:", error);
        return [];
      }
    },
    enabled: !!activityId,
  });
}

export interface TrimpMinuteData {
  time: string;
  hrPercent: number;
  cumulativeTrimp: number;
  trimp: number;
}

const fetchTrimpPerMinute = async (
  activityId: string,
): Promise<TrimpMinuteData[]> => {
  const url = `/heart-rate/${activityId}/trimp`;
  const res = await apiFetch<TrimpMinuteData[]>(url);
  return res || [];
};

export const useTrimpPerMinute = (
  activityId: string,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: queryKeys.heartRate.trimpPerMinute(activityId),
    queryFn: () => fetchTrimpPerMinute(activityId),
    enabled: !!activityId && enabled,
  });
};

/**
 * Hook to get heart rate data by time range
 */
export function useHeartRateDurationCurve(
  timeRanges: Time[] | null,
  sportType: SportType | "all",
) {
  return useQuery({
    queryKey: queryKeys.heartRate.durationCurve(timeRanges, sportType),
    queryFn: () =>
      getHeartRateDurationCurveByTimeRanges(timeRanges!, sportType),
    enabled: !!timeRanges && timeRanges.length > 0,
  });
}

export interface HeartRateZonesDistributionByRange {
  timeRange: { start?: string; end?: string };
  zones: HeartRateZoneValue[];
  benchmark?: unknown;
}

async function getHeartRateZonesDistributionByTimeRanges(
  timeRanges: Time[],
  sportType: SportType | "all",
): Promise<HeartRateZonesDistributionByRange[]> {
  const ranges = timeRanges
    .map((time) => timeToRange(time))
    .filter((r): r is { start?: string; end?: string } => Boolean(r));
  const payload: {
    timeRanges: { start?: string; end?: string }[];
    sportType?: SportType | "all";
  } = { timeRanges: ranges };
  if (sportType) payload.sportType = sportType;

  const data = await apiFetch("/activities/heart-rate/zones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (data || []) as HeartRateZonesDistributionByRange[];
}

export function useHeartRateZonesDistribution(
  timeRanges: Time[] | null,
  sportType: SportType | "all",
) {
  return useQuery<HeartRateZonesDistributionByRange[]>({
    queryKey: queryKeys.heartRate.zonesDistribution(timeRanges, sportType),
    queryFn: () =>
      getHeartRateZonesDistributionByTimeRanges(timeRanges!, sportType),
    enabled: !!timeRanges && timeRanges.length > 0,
  });
}

/**
 * API function to get heart rate data by time range
 */
async function getHeartRateDurationCurveByTimeRanges(
  timeRanges: Time[],
  sportType: "all" | SportType,
): Promise<
  {
    timeRange: { start?: string; end?: string };
    "1s": number;
    "5s": number;
    "10s": number;
    "20s": number;
    "30s": number;
    "1m": number;
    "3m": number;
    "5m": number;
    "10m": number;
    "20m": number;
    "30m": number;
    "60m": number;
    "2h": number;
    "3h": number;
    "6h": number;
  }[]
> {
  const data = await apiFetch<
    Array<{
      timeRange: { start?: string; end?: string };
      "1s": number;
      "5s": number;
      "10s": number;
      "20s": number;
      "30s": number;
      "1m": number;
      "3m": number;
      "5m": number;
      "10m": number;
      "20m": number;
      "30m": number;
      "60m": number;
      "2h": number;
      "3h": number;
      "6h": number;
    }>
  >("/activities/heart-rate/duration-curve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      timeRanges: timeRanges.map((time) => {
        const range = timeToRange(time);
        return {
          start: range?.start,
          end: range?.end,
        };
      }),
      sportType,
    }),
  });
  return (data || []) as Array<{
    timeRange: { start?: string; end?: string };
    "1s": number;
    "5s": number;
    "10s": number;
    "20s": number;
    "30s": number;
    "1m": number;
    "3m": number;
    "5m": number;
    "10m": number;
    "20m": number;
    "30m": number;
    "60m": number;
    "2h": number;
    "3h": number;
    "6h": number;
  }>;
}

/**
 * Get activity heart rate duration curve
 */
async function getHeartRateDurationCurveByActivity(activityId: string) {
  const url = `/activities/${activityId}/heart-rate/duration-curve`;
  return apiFetch<{ duration: number; bpm: number }[]>(url);
}

/**
 * Hook to get activity heart rate duration curve
 */
export function useActivityHeartRateDurationCurve(activityId: string | null) {
  return useQuery({
    queryKey: queryKeys.heartRate.activityDurationCurve(activityId),
    queryFn: () => getHeartRateDurationCurveByActivity(activityId!),
    enabled: !!activityId,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

export interface HeartRateZoneValue {
  name: string;
  min?: number;
  max?: number;
  percent?: number;
  duration?: number;
  avg?: number;
  color?: string;
}

export interface HeartRateZonesResponse {
  zones: HeartRateZoneValue[];
  benchmark?: unknown;
}

/**
 * Get heart rate zones
 */
async function getHeartRateZones(
  activityId?: string | null,
  sportType?: SportType,
) {
  const params = new URLSearchParams();
  if (activityId) params.append("activityId", activityId);
  if (sportType) params.append("sportType", sportType);
  return apiFetch<HeartRateZonesResponse>(
    `/heart-rate/zones?${params.toString()}`,
  );
}

/**
 * Hook to get heart rate zones
 */
export function useHeartRateZones(
  activityId?: string | null,
  sportType?: SportType,
) {
  return useQuery({
    queryKey: queryKeys.heartRate.zones(activityId, sportType),
    queryFn: () => getHeartRateZones(activityId, sportType),
    enabled: !!activityId || !!sportType,
  });
}

export interface HeartRateBase {
  avg: number;
  max: number;
  min: number;
  reserve?: number;
  intensity?: number;
  userMaxHR?: number;
  avgPctMax?: number;
  maxPctMax?: number;
  calories?: number;
  trimp?: number;
  hrTss?: number;
  paHr?: number;
  pwHr?: number;
  peakEpoc?: number;
  maxHrDrop?: number;
}

/**
 * Hook to get heart rate base stats
 */
export function useHeartRateBase(activityId: string) {
  return useQuery({
    queryKey: queryKeys.heartRate.base(activityId),
    queryFn: async () => {
      const response = await apiFetch<HeartRateBase>(
        `/activities/${activityId}/heart-rate/base`,
      );
      return response;
    },
    enabled: !!activityId,
  });
}

export interface EpocDataPoint {
  distance: number;
  epoc: number;
  hr: number;
}

const fetchEpocData = async (activityId: string): Promise<EpocDataPoint[]> => {
  const url = `/heart-rate/${activityId}/epoc`;
  const res = await apiFetch<EpocDataPoint[]>(url);
  return res || [];
};

export const useEpocData = (activityId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: queryKeys.heartRate.epoc(activityId),
    queryFn: () => fetchEpocData(activityId),
    enabled: !!activityId && enabled,
  });
};
