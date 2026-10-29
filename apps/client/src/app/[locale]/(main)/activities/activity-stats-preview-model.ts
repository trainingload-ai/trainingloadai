import type { SummaryMetricResponse } from "@/api/charts";
import { dayjs } from "@/lib/dayjs-tz";

export type ActivityStatsPreviewDay = {
  date: string;
  count: number;
};

export type ActivityStatsPreviewRange = {
  start: string;
  end: string;
};

export const ACTIVITY_STATS_PREVIEW_DAYS_BACK = 126;

export const EMPTY_ACTIVITY_STATS_PREVIEW: SummaryMetricResponse = {
  rows: [],
  metadata: {},
};

export function getActivityStatsPreviewRange(
  daysBack = ACTIVITY_STATS_PREVIEW_DAYS_BACK,
): ActivityStatsPreviewRange {
  const end = dayjs().endOf("day");
  const start = end
    .startOf("day")
    .subtract(Math.max(daysBack - 1, 0), "day");

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function buildActivityStatsPreviewDays(
  rows: SummaryMetricResponse["rows"] | undefined,
): ActivityStatsPreviewDay[] {
  return (rows ?? []).map((row) => ({
    date: dayjs(row.time).format("YYYY-MM-DD"),
    count: Math.max(0, Math.round(row.value)),
  }));
}
