"use client";

import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import {
  fetchActivities,
  fetchActivity,
  fetchActivityStats,
} from "@/api/activities";
import { queryKeys } from "@/lib/query-keys";

export type ActivityDateRange = {
  startDate: string;
  endDate: string;
};

/**
 * `/activities` rejects date filters spanning more than three months.
 * Keep each chunk below that boundary because the server expands endDate to
 * end-of-day before validating the range.
 */
export function splitActivityDateRange(
  startDate: string,
  endDate: string,
): ActivityDateRange[] {
  const start = dayjs(startDate).startOf("day");
  const end = dayjs(endDate).startOf("day");
  if (!start.isValid() || !end.isValid() || end.isBefore(start, "day")) {
    return [{ startDate, endDate }];
  }

  const firstSafeEnd = start.add(3, "month").subtract(1, "day");
  if (!end.isAfter(firstSafeEnd, "day")) {
    return [{ startDate, endDate }];
  }

  const ranges: ActivityDateRange[] = [];
  let cursor = start;
  while (!cursor.isAfter(end, "day")) {
    const safeEnd = cursor.add(3, "month").subtract(1, "day");
    const chunkEnd = safeEnd.isBefore(end, "day") ? safeEnd : end;
    ranges.push({
      startDate: cursor.format("YYYY-MM-DD"),
      endDate: chunkEnd.format("YYYY-MM-DD"),
    });
    cursor = chunkEnd.add(1, "day");
  }
  return ranges;
}

// Single activity detail query Hook
export function useGetActivity(id: string) {
  return useQuery({
    queryKey: queryKeys.activity.detail(id),
    queryFn: () => fetchActivity(id),
    enabled: !!id,
  });
}

// Activity statistics query Hook
export function useGetActivityStats(year?: number) {
  return useQuery({
    queryKey: queryKeys.activity.stats(year),
    queryFn: () => fetchActivityStats(year),
  });
}

// Get activities by date range (for monthly calendar display)
export function useMonthlyActivities(
  startDate: string,
  endDate: string,
  options?: {
    sportType?: string;
    orderBy?: string;
    orderDirection?: "asc" | "desc";
  },
) {
  const { sportType, orderBy, orderDirection } = options || {};
  return useQuery({
    queryKey: queryKeys.activity.monthly(
      startDate,
      endDate,
      sportType,
      orderBy,
      orderDirection,
    ),
    queryFn: async () => {
      const ranges = splitActivityDateRange(startDate, endDate);
      const responses = await Promise.all(
        ranges.map((range) =>
          fetchActivities(
            1,
            {
              ...range,
              ...(sportType && sportType !== "all" ? { sportType } : {}),
            },
            orderBy,
            orderDirection,
          ),
        ),
      );
      const orderedResponses =
        orderDirection === "desc" ? responses.toReversed() : responses;
      return {
        activities: orderedResponses.flatMap((response) => response.activities),
        total: responses.reduce((sum, response) => sum + response.total, 0),
      };
    },
    refetchOnWindowFocus: false,
  });
}
