import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
  PmcProjectionResult,
  PmcProjectionScenario,
  PmcProjectionScope,
} from "@shared/pmc-projection";

export function usePmcProjection(
  scope: PmcProjectionScope,
  scenario: PmcProjectionScenario,
  historyDays: 60 | 90,
) {
  return useQuery({
    queryKey: queryKeys.pmc.projection(scope, scenario, historyDays),
    queryFn: async () => {
      const result = await apiFetch<PmcProjectionResult>(
        `/pmc/projection?${new URLSearchParams({ scope, scenario, historyDays: String(historyDays) })}`,
        { suppressErrorToast: true },
      );
      if (!result) throw new Error("PMC_PROJECTION_UNAVAILABLE");
      return result;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}
