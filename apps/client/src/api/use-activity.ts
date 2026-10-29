import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";

export interface SwimReviewResult {
  // Pool length
  poolLength: number | undefined;
  poolLengthUnit: string | undefined;

  lengths: {
    timestamp: Date;
    startTime: Date | null;
    index: number;
    /**
     * Duration of this lap
     */
    duration: number;
    /**
     * Elapsed time of this lap
     */
    elapsedTime: number;
    /**
     * Distance of this lap
     */
    distance: number;
    /**
     * Total strokes
     */
    totalStrokes: number;
    /**
     * Speed of this lap
     */
    speed: number;
    /**
     * Swim stroke of this lap
     */
    swimStroke: string;
    /**
     * Average swimming cadence of this lap
     */
    avgSwimmingCadence: number;
    /**
     * Stroke count of this lap
     */
    strokeCount: number;
  }[];
}

/**
 * Get activity swim overview
 * @param activityId
 * @returns
 */
const fetchActivitySwimOverview = async (
  activityId: string,
): Promise<SwimReviewResult | undefined> => {
  const url = `/activities/${activityId}/swim/overview`;
  return apiFetch(url);
};

/**
 * Get activity swim overview
 * @param activityId
 * @returns
 */
export function useActivitySwimOverview(activityId: string | null) {
  return useQuery({
    queryKey: queryKeys.activity.swimOverview(activityId),
    queryFn: () => fetchActivitySwimOverview(activityId!),
    enabled: !!activityId,
  });
}
