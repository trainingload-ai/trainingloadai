"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export type ZonePreviewSport = "UNKNOWN" | "RUN" | "CYCLING" | "SWIM";
export type ZonePreviewType = "HEART_RATE" | "POWER" | "PACE";
export interface ZoneModelPreview {
  benchmark?: unknown;
  benchmarkSource?: string;
  zones: { name: string; order?: number; min?: number; max?: number }[];
}
export interface ZoneModelPreviewsResponse {
  models: Record<string, ZoneModelPreview>;
  hasSavedSetting: boolean;
}

export function useZoneModelPreviews(
  sportType: ZonePreviewSport,
  zoneType: ZonePreviewType,
) {
  const keys = {
    HEART_RATE: queryKeys.heartRate,
    POWER: queryKeys.power,
    PACE: queryKeys.pace,
  };
  return useQuery({
    queryKey: keys[zoneType].zonePreviews(sportType),
    queryFn: () =>
      apiFetch<ZoneModelPreviewsResponse>(
        `/users/zones/preview?sportType=${sportType}&zoneType=${zoneType}`,
      ),
  });
}
