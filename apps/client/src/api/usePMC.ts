import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import dayjs from "dayjs";
import { useMemo } from "react";
import { calcClampedPercent, clamp } from "@/lib/utils";

// PMC Data Type Definition
export interface PMCData {
  date: string;
  fitness: number;
  fatigue: number;
  form: number;
  value: number;
  running?: number;
  cycling?: number;
  swimming?: number;
}

// PMC Calculation Response Type
export interface PMCCalculateResponse {
  message: string;
  dataCount: number;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

// PMC Data Query Parameters
export interface PMCDataParams {
  startDate?: string;
  endDate?: string;
  sportType?: string;
}

export interface FitnessStatusData {
  vo2Max?: number;
  vo2MaxSourcePreference?: "HEARTRATE" | "FACTOR" | "STANDARD";
  thresholdPaceSecPerKm?: number;
  paceZoneModel?: "FRIEL" | "DANIELS";
  paceZoneBenchmark?: "TP" | "VO2MAX" | "CS" | "CUSTOM";
  paceZones?: Array<{
    order: number;
    name: string;
    fastestPaceSecPerKm?: number;
    slowestPaceSecPerKm?: number;
  }>;
  vo2MaxClassification?: {
    level: "EXCELLENT" | "VERY_GOOD" | "GOOD" | "FAIR" | "POOR";
    thresholds: {
      fair: number;
      good: number;
      veryGood: number;
      excellent: number;
    };
    method: "DEFAULT" | "AGE_GENDER";
    gender?: "MALE" | "FEMALE";
    ageBand?: "20-29" | "30-39" | "40-49" | "50-59" | "60-69" | "70-79";
  };
  ctl: number;
  atl: number;
  tsb: number;
  acRatio: number;
  monotony: number;
  intensity: number;
  restDays: number;
}

export interface PMCExtremes {
  model: string;
  ctl: number;
  atl: number;
  ctlRecordedAt?: string | null;
  atlRecordedAt?: string | null;
}

type TsbZone =
  | "danger"
  | "optimal"
  | "neutral"
  | "fresh"
  | "peak"
  | "transition";
type ACRatioZone = "low" | "optimal" | "high" | "danger";
type MonotonyZone = "none" | "low" | "moderate" | "high";

/**
 * FitnessStatus 专用：获取 PMC 概览数据 + 相关派生状态
 * 把 /pmc/status、/pmc/extremes 以及一些百分比/区间判断集中在一个 hook 里
 */
export function useDashboardPMC() {
  const fitnessQuery = useQuery({
    queryKey: queryKeys.pmc.fitnessStatus(),
    queryFn: () => apiFetch<FitnessStatusData>("/pmc/status"),
    placeholderData: keepPreviousData,
  });

  const extremesQuery = useQuery({
    queryKey: queryKeys.pmc.extremes(),
    queryFn: () => apiFetch<PMCExtremes>("/pmc/extremes"),
    placeholderData: keepPreviousData,
  });

  const fitnessData = fitnessQuery.data;
  const pmcExtremes = extremesQuery.data;
  const isPending = fitnessQuery.isPending || extremesQuery.isPending;

  return useMemo(() => {
    const atlPercent = calcClampedPercent(fitnessData?.atl, pmcExtremes?.atl);
    const ctlPercent = calcClampedPercent(fitnessData?.ctl, pmcExtremes?.ctl);

    const tsbValue =
      fitnessData?.tsb !== undefined && Number.isFinite(fitnessData.tsb)
        ? fitnessData.tsb
        : 0;
    const tsbDomainMin = -40;
    const tsbDomainMax = 40;
    const tsbFillPercent = clamp(
      ((tsbValue - tsbDomainMin) / (tsbDomainMax - tsbDomainMin)) * 100,
      0,
      100,
    );
    const tsbZone: TsbZone =
      tsbValue < -30
        ? "danger"
        : tsbValue < -10
          ? "optimal"
          : tsbValue < 5
            ? "neutral"
            : tsbValue < 15
              ? "fresh"
              : tsbValue < 25
                ? "peak"
                : "transition";

    const acRatioValue =
      fitnessData?.acRatio !== undefined && Number.isFinite(fitnessData.acRatio)
        ? fitnessData.acRatio
        : 0;
    const acRatioFillPercent = calcClampedPercent(acRatioValue, 2);
    const acRatioZone: ACRatioZone =
      acRatioValue < 0.8
        ? "low"
        : acRatioValue < 1.3
          ? "optimal"
          : acRatioValue < 1.5
            ? "high"
            : "danger";

    const monotonyValue =
      fitnessData?.monotony !== undefined &&
      Number.isFinite(fitnessData.monotony)
        ? fitnessData.monotony
        : undefined;
    const monotonyFillPercent =
      monotonyValue !== undefined
        ? Math.max(
            0,
            Math.min(100, ((monotonyValue - 0.29) / (1.0 - 0.29)) * 100),
          )
        : 0;
    const monotonyZone: MonotonyZone =
      monotonyValue === undefined
        ? "none"
        : monotonyValue < 0.6
          ? "low"
          : monotonyValue <= 0.8
            ? "moderate"
            : "high";

    return {
      fitnessData,
      pmcExtremes,
      isPending,
      atlPercent,
      ctlPercent,
      tsbValue,
      tsbDomainMin,
      tsbDomainMax,
      tsbFillPercent,
      tsbZone,
      acRatioValue,
      acRatioFillPercent,
      acRatioZone,
      monotonyValue,
      monotonyFillPercent,
      monotonyZone,
    };
  }, [fitnessData, isPending, pmcExtremes]);
}

/**
 * Smart calculate PMC data
 * Calculate PMC data for the last 60 days, update if data exists, create new if not
 */
export function useSmartCalculatePMC() {
  return useMutation<PMCCalculateResponse>({
    mutationFn: async () => {
      const data = await apiFetch<PMCCalculateResponse>("/pmc/calculate", {
        method: "POST",
      });
      if (!data) throw new Error("__ALREADY_TOASTED__");
      return data;
    },
  });
}

/**
 * Get PMC data
 * Query PMC data by date range, aggregated by day
 * @param params Query parameters
 */
export function usePMCData(params?: PMCDataParams) {
  return useQuery<PMCData[] | undefined>({
    queryKey: queryKeys.pmc.series(params),
    queryFn: async () => {
      const searchParams = new URLSearchParams();

      if (params?.startDate) {
        searchParams.append("startDate", params.startDate);
      }
      if (params?.endDate) {
        searchParams.append("endDate", params.endDate);
      }
      if (params?.sportType && params.sportType !== "all") {
        searchParams.append("sportType", params.sportType);
      }

      const url = `/pmc/data${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      const data = await apiFetch<PMCData[]>(url);
      return data;
    },
    refetchOnWindowFocus: false,
  });
}

/**
 * Get PMC data for the last 60 days (default query)
 */
export function useRecentPMCData() {
  const endDate = dayjs().format("YYYY-MM-DD");
  const startDate = dayjs().subtract(60, "day").format("YYYY-MM-DD");

  return usePMCData({
    startDate,
    endDate,
  });
}
