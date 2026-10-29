import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ActivitiesLayerResponse } from "./useActivitiesLayer";

/**
 * Activity Layer Data Transfer Object
 */
export type ActivityLayerResponse = ActivitiesLayerResponse;

export function useActivityLayer(
  activityId: string,
): UseQueryResult<ActivityLayerResponse | undefined, Error> {
  return useQuery<ActivityLayerResponse | undefined, Error>({
    queryKey: queryKeys.activity.layer(activityId),
    queryFn: async () => {
      const response = await apiFetch<ActivityLayerResponse>(
        `/activities/${activityId}/layer`,
      );
      return response;
    },
    enabled: !!activityId, // Execute query only when activityId exists
  });
}
