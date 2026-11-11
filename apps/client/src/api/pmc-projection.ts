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
  enabled = true,
  forecastDays: 28 | 30 = 28,
) {
  return useQuery({
    enabled,
    queryKey: [
      ...queryKeys.pmc.projection(scope, scenario, historyDays),
      forecastDays,
    ],
    queryFn: async () => {
      const result = await apiFetch<PmcProjectionResult>(
        `/pmc/projection?${new URLSearchParams({ scope, scenario, historyDays: String(historyDays), forecastDays: String(forecastDays) })}`,
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
