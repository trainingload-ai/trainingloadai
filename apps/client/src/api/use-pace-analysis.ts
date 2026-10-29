import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export interface PaceAnalysisResult {
  avgSpeed?: number; // 米/秒
  avgGap?: number; // 秒/米
  avgAerobicEfficiency?: number;
  vo2max?: number;
}

export const usePaceBase = (activityId: string | undefined) => {
  return useQuery<PaceAnalysisResult | undefined>({
    queryKey: queryKeys.paceAnalysis.base(activityId),
    queryFn: async () => {
      const res = await apiFetch<PaceAnalysisResult>(
        `/activities/${activityId}/pace/base`,
      );
      return res;
    },
    enabled: !!activityId,
  });
};
