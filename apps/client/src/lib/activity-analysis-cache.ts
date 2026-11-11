import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { Activity } from "@/api/activities";
import { queryKeys } from "./query-keys";

// Raw analysis data is stable between processing revisions. Keep this policy
// local to activity data; editable segments retain their revision/refetch rules.
export const ACTIVITY_ANALYSIS_CACHE = {
  staleTime: 60_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
} as const;

export function isActivityAnalysisQuery(key: QueryKey, activityId?: string) {
  const id = typeof key[1] === "string" ? key[1] : "";
  if (!id || (activityId !== undefined && id !== activityId)) return false;
  return (
    key[0] === queryKeys.activity.metricSeries(id, "")[0] ||
    (key.length === 3 &&
      key.every(
        (value, index) => value === queryKeys.activity.timelineTrack(id)[index],
      ))
  );
}

export async function invalidateActivityAnalysisCaches(
  client: QueryClient,
  activityId?: string,
) {
  const filter = {
    predicate: (query: { queryKey: QueryKey }) =>
      isActivityAnalysisQuery(query.queryKey, activityId),
  };
  await client.cancelQueries(filter);
  await client.invalidateQueries(filter);
}

function analysisVersion(activity: Activity) {
  return JSON.stringify([
    activity.readyAt,
    activity.processingStatus,
    activity.processingUpdatedAt,
    activity.startTime,
    activity.endTime,
    activity.sportType,
    activity.timezone,
  ]);
}

export async function refreshActivityAnalysisCaches(
  client: QueryClient,
  activityId: string,
  previous: Activity | undefined,
  next: Activity | undefined,
) {
  if (!previous || !next || analysisVersion(previous) === analysisVersion(next))
    return;
  const filter = {
    predicate: (query: { queryKey: QueryKey }) =>
      isActivityAnalysisQuery(query.queryKey, activityId),
  };
  await client.cancelQueries(filter);
  // Let the detail response render immediately; analysis refetches in parallel.
  void client.invalidateQueries({
    ...filter,
    refetchType:
      next.processingStatus && next.processingStatus !== "READY"
        ? "none"
        : "active",
  });
}

export async function removeActivityAnalysisCaches(
  client: QueryClient,
  activityId: string,
) {
  const filter = {
    predicate: (query: { queryKey: QueryKey }) =>
      isActivityAnalysisQuery(query.queryKey, activityId) ||
      [
        queryKeys.activity.detail(activityId),
        queryKeys.activity.timelineSegments(activityId),
        queryKeys.activity.layer(activityId),
      ].some(
        (key) =>
          key.length === query.queryKey.length &&
          key.every((value, index) => value === query.queryKey[index]),
      ),
  };
  await client.cancelQueries(filter);
  client.removeQueries(filter);
}
