import { Time } from "@/components/DateSelector/types";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { timeToRange } from "@/lib/timeRange";
import { useQuery } from "@tanstack/react-query";
import { SportType } from "@/lib/store";
import dayjs from "dayjs";

export interface PowerBasicResponse {
  avg?: number; // 平均功率
  max?: number; // 最大功率
  min?: number; // 最小功率
  WKG?: number; //  功率体重比
  aePower?: number;
  re?: number;
  ei?: number;
  ftp?: number;
  eftp?: number;
  cp?: number;
  ecp?: number;
  coggan?: {
    NP?: number;
    TSS?: number;
    IF?: number;
    VI?: number;
    EF?: number;
    TSSHOUR: number;
  };
  skiba?: {
    xPower?: number;
    ETSS?: number;
    RI?: number;
    VI?: number;
    ATISS?: number;
    ANTISS?: number;
  };
}

/**
 * 功率区间具体值
 */
export interface PowerZoneValue {
  min?: number;
  max?: number;
  duration?: number;
  percent?: number;
  avg?: number;
  name: "z1" | "z2" | "z3" | "z4" | "z5" | string;
  order?: number;
  color?: string;
}

export interface PowerZoneResponse {
  benchmark?: string;
  zones: PowerZoneValue[];
}

export function normalizePowerZoneResponse(
  response: PowerZoneResponse | undefined,
): PowerZoneResponse {
  return response && Array.isArray(response.zones) ? response : { zones: [] };
}

/**
 * Get activity power basic statistics
 * @param activityId
 * @returns
 */
const fetchActivityPowerBase = async (activityId: string) => {
  const url = `/activities/${activityId}/power/base`;
  return apiFetch<PowerBasicResponse>(url);
};

/**
 * Get activity power zone statistics
 * @param activityId
 * @returns
 */
const fetchActivityPowerZones = async (
  activityId: string,
): Promise<PowerZoneResponse> => {
  const url = `/power/zones?activityId=${activityId}`;
  const res = await apiFetch<PowerZoneResponse>(url);

  return normalizePowerZoneResponse(res);
};

const fetchPowerZones = async (
  activityId?: string | null,
  sportType?: SportType | string,
): Promise<PowerZoneResponse> => {
  const params = new URLSearchParams();
  if (activityId) params.append("activityId", activityId);
  if (sportType && sportType !== "all") params.append("sportType", sportType);
  const response = await apiFetch<PowerZoneResponse>(
    `/power/zones?${params.toString()}`,
  );
  return normalizePowerZoneResponse(response);
};

/**
 * Get activity power basic statistics
 * @param activityId
 * @returns
 */
export function useActivityPowerBase(activityId: string | null) {
  return useQuery({
    queryKey: queryKeys.power.activityBase(activityId),
    queryFn: () => fetchActivityPowerBase(activityId!),
    enabled: !!activityId,
  });
}

export const useActivityPowerZones = (activityId: string | null) => {
  return useQuery({
    queryKey: queryKeys.power.activityZones(activityId),
    queryFn: () => fetchActivityPowerZones(activityId!),
    enabled: !!activityId,
  });
};

export const usePowerZones = (
  activityId?: string | null,
  sportType?: SportType | string,
) => {
  return useQuery({
    queryKey: queryKeys.power.zones(activityId, sportType),
    queryFn: () => fetchPowerZones(activityId, sportType),
    enabled: Boolean(activityId || (sportType && sportType !== "all")),
  });
};

/**
 * Hook to get power data by time range
 */
export function usePowerDurationCurve(
  timeRanges: Time[] | null,
  sportType: SportType,
) {
  return useQuery<PowerDurationCurveByRange[]>({
    queryKey: queryKeys.power.durationCurve(timeRanges, sportType),
    queryFn: () => getPowerDurationCurveByTimeRanges(timeRanges!, sportType),
    enabled: !!timeRanges && timeRanges.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export interface PowerDurationCurvePointActivity {
  hashId: string;
  activityName?: string | null;
  startTime?: string | null;
  sportType?: string | null;
  value: number;
}

export interface PowerDurationCurvePoint {
  durationSec: number;
  activities: PowerDurationCurvePointActivity[];
}

export interface PowerDurationCurvePointsByRange {
  timeRange: { start?: string; end?: string };
  points: PowerDurationCurvePoint[];
}

export interface PowerDurationCurveByRange {
  timeRange: { start?: string; end?: string };
  "5s": number;
  "30s": number;
  "1m": number;
  "3m": number;
  "5m": number;
  "20m": number;
  "60m": number;
  "2h": number;
  "3h": number;
}

function mergeTimeRanges(
  ranges: { start?: string; end?: string }[],
): { start?: string; end?: string }[] {
  if (ranges.length <= 1) return ranges;

  const hasAllTime = ranges.some((r) => !r.start && !r.end);
  if (hasAllTime) return [{ start: undefined, end: undefined }];

  const normalized = ranges
    .map((r) => ({
      startMs: r.start ? new Date(r.start).getTime() : Number.NEGATIVE_INFINITY,
      endMs: r.end ? new Date(r.end).getTime() : Number.POSITIVE_INFINITY,
    }))
    .filter((r) => Number.isFinite(r.startMs) && Number.isFinite(r.endMs))
    .sort((a, b) => a.startMs - b.startMs);

  const merged: { startMs: number; endMs: number }[] = [];
  for (const r of normalized) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ startMs: r.startMs, endMs: r.endMs });
      continue;
    }
    if (r.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, r.endMs);
      continue;
    }
    merged.push({ startMs: r.startMs, endMs: r.endMs });
  }

  return merged.map((r) => ({
    start: new Date(r.startMs).toISOString(),
    end: new Date(r.endMs).toISOString(),
  }));
}

export type PowerMmpDuration =
  | "5s"
  | "10s"
  | "30s"
  | "1m"
  | "5m"
  | "20m"
  | "60m";

export type PowerMmpBucket = "day" | "week" | "month";

export interface PowerMmpHistoryPoint {
  time: string;
  value: number;
}

async function getPowerMmpHistory(params: {
  time: Time;
  sportType: SportType;
  bucket: PowerMmpBucket;
  duration: PowerMmpDuration;
}): Promise<PowerMmpHistoryPoint[]> {
  const { time, sportType, bucket, duration } = params;
  const range = timeToRange(time);

  const search = new URLSearchParams();
  // 后端接口要求 start/end 必填；all-time 等场景需要兜底一个足够大的范围
  const fallbackStart = dayjs().subtract(10, "year").startOf("day").toISOString();
  const fallbackEnd = dayjs().endOf("day").toISOString();
  search.set("start", range?.start ?? fallbackStart);
  search.set("end", range?.end ?? fallbackEnd);
  search.set("bucket", bucket);
  search.set("duration", duration);
  if (sportType && sportType !== "all") search.set("sportType", sportType);

  return (
    (await apiFetch<PowerMmpHistoryPoint[]>(
      `/activities/power/mmp-history?${search.toString()}`,
    )) || []
  );
}

export function usePowerMmpHistory(
  time: Time | null,
  sportType: SportType,
  bucket: PowerMmpBucket,
  duration: PowerMmpDuration,
) {
  return useQuery({
    queryKey: queryKeys.power.mmpHistory(time, sportType, bucket, duration),
    queryFn: () =>
      getPowerMmpHistory({
        time: time!,
        sportType,
        bucket,
        duration,
      }),
    enabled: !!time,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export interface PowerZonesDistributionByRange {
  timeRange: { start?: string; end?: string };
  zones: PowerZoneValue[];
  benchmark?: unknown;
}

async function getPowerZonesDistributionByTimeRanges(
  timeRanges: Time[],
  sportType: SportType,
): Promise<PowerZonesDistributionByRange[]> {
  const ranges = timeRanges
    .map((time) => timeToRange(time))
    .filter((r): r is { start?: string; end?: string } => Boolean(r));

  const payload: {
    timeRanges: { start?: string; end?: string }[];
    sportType?: SportType;
  } = { timeRanges: ranges };

  if (sportType !== "all") payload.sportType = sportType;

  const data = await apiFetch("/activities/power/zones", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return (data || []) as PowerZonesDistributionByRange[];
}

export function usePowerZonesDistribution(
  timeRanges: Time[] | null,
  sportType: SportType,
) {
  return useQuery<PowerZonesDistributionByRange[]>({
    queryKey: queryKeys.power.zonesDistribution(timeRanges, sportType),
    queryFn: () =>
      getPowerZonesDistributionByTimeRanges(timeRanges!, sportType),
    enabled: !!timeRanges && timeRanges.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

async function getPowerDurationCurvePointsByTimeRanges(
  timeRanges: Time[],
  sportType: "all" | SportType,
): Promise<PowerDurationCurvePointsByRange[]> {
  const mergedRanges = mergeTimeRanges(
    timeRanges
      .map((time) => timeToRange(time))
      .filter((r): r is { start?: string; end?: string } => Boolean(r)),
  );

  const data = await apiFetch("/activities/power/duration-curve-points", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      timeRanges: mergedRanges,
      sportType,
    }),
  });

  return (data || []) as PowerDurationCurvePointsByRange[];
}

export function usePowerDurationCurvePoints(
  timeRanges: Time[] | null,
  sportType: SportType,
) {
  return useQuery<PowerDurationCurvePointsByRange[]>({
    queryKey: queryKeys.power.durationCurvePoints(timeRanges, sportType),
    queryFn: () =>
      getPowerDurationCurvePointsByTimeRanges(timeRanges!, sportType),
    enabled: !!timeRanges && timeRanges.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * API function to get power data by time range
 */
async function getPowerDurationCurveByTimeRanges(
  timeRanges: Time[],
  sportType: "all" | SportType,
): Promise<PowerDurationCurveByRange[]> {
  const ranges = timeRanges.map((time) => {
    const range = timeToRange(time);
    return {
      start: range?.start,
      end: range?.end,
    };
  });

  const data = await apiFetch("/activities/power/duration-curve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      timeRanges: ranges,
      sportType,
    }),
  });
  return (data || []) as PowerDurationCurveByRange[];
}

/**
 * 获取当前活动的 MMP 数据
 */
async function getPowerDurationCurveByActivity(activityId: string) {
  const url = `/activities/${activityId}/power/duration-curve`;
  return apiFetch<{
    points: { duration: number; power: number; type: "actual" | "model" }[];
    cp?: number;
    wPrime?: number;
  }>(url);
}

/**
 * 接口：获取当前活动的 MMP 数据
 */
export function useActivityPowerDurationCurve(activityId: string | null) {
  return useQuery({
    queryKey: queryKeys.power.activityDurationCurve(activityId),
    queryFn: () => getPowerDurationCurveByActivity(activityId!),
    enabled: !!activityId,
    // staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
}
