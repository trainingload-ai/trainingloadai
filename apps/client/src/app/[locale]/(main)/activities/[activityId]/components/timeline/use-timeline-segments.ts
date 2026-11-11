"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { usePublicDemo } from "@/public-demo/public-demo-provider";
import type {
  TimelineSegment,
  TimelineSegmentsResponse,
} from "@shared/activity-timeline";

export function useTimelineSegments(
  activityId: string,
  native: TimelineSegment[],
) {
  const queryClient = useQueryClient();
  const publicDemo = usePublicDemo();
  const queryKey = queryKeys.activity.timelineSegments(activityId);
  const path = `/activities/${encodeURIComponent(activityId)}/timeline-segments`;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      apiFetch<TimelineSegmentsResponse>(path, {
        suppressErrorToast: true,
        signal,
      }),
    retry: false,
    meta: { errorSurface: "silent" },
  });
  const mutation = useMutation({
    mutationFn: ({
      segments,
      revision,
    }: {
      segments: TimelineSegment[] | null;
      revision: number;
    }) =>
      apiFetch<TimelineSegmentsResponse>(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, segments }),
        suppressErrorToast: true,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  return {
    segments: query.data ? (query.data.segments ?? native) : [],
    loading: query.isPending,
    error: query.isError,
    hasData: query.data !== undefined,
    retrying: query.isFetching,
    retry: query.refetch,
    canEdit: query.isSuccess && !publicDemo.active,
    revision: query.data?.revision ?? 0,
    saving: mutation.isPending,
    save: (segments: TimelineSegment[] | null, revision: number) =>
      mutation.mutateAsync({ segments, revision }),
  };
}
