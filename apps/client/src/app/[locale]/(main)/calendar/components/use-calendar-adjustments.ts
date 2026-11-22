"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCalendarAdjustment, listCalendarAdjustments } from "@/api/plans";
import type { CalendarAdjustment } from "@shared/plan-proposal";

const adjustmentListKey = (planId: string) =>
  ["calendar-adjustments", planId] as const;
export const adjustmentKey = (
  planId: string,
  id: string | undefined,
  versionId?: string,
) => [...adjustmentListKey(planId), id, versionId] as const;

export function useCalendarAdjustments(planId: string | null | undefined) {
  return useQuery({
    queryKey: adjustmentListKey(planId ?? ""),
    queryFn: () => listCalendarAdjustments(planId!),
    enabled: Boolean(planId),
    retry: false,
  });
}

export function useCalendarAdjustment(
  planId: string,
  id: string | undefined,
  versionId?: string,
) {
  return useQuery({
    queryKey: adjustmentKey(planId, id, versionId),
    queryFn: () => getCalendarAdjustment(planId, id!, versionId),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: ({ state }) => {
      const data = state.data;
      if (versionId || data?.state !== "READY") return false;
      return Math.min(
        30_000,
        Math.max(1_000, Date.parse(data.expiresAt) - Date.now() + 100),
      );
    },
  });
}

export function usePublishCalendarAdjustment() {
  const client = useQueryClient();
  return async (adjustment: CalendarAdjustment) => {
    const key = adjustmentKey(adjustment.planId, adjustment.id);
    await client.cancelQueries({ queryKey: key, exact: true });
    client.setQueryData(key, adjustment);
    void client.invalidateQueries({
      queryKey: adjustmentListKey(adjustment.planId),
      exact: true,
    });
  };
}
