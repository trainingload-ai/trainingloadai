import {
  parsePmcProjectionSelection,
  type PmcProjectionSelection,
} from "@shared/pmc-projection";

export function pmcSelectionFromSearch(
  params: Pick<URLSearchParams, "get">,
): PmcProjectionSelection | null {
  if (params.get("pmcQuestion") !== "1") return null;
  return parsePmcProjectionSelection({
    scope: params.get("pmcScope"),
    scenario: params.get("pmcScenario"),
    historyDays: Number(params.get("pmcHistory")),
    ...(params.get("pmcProjection")
      ? { expectedProjectionId: params.get("pmcProjection") }
      : {}),
  });
}

export const PMC_COACH_SEARCH_KEYS = [
  "pmcQuestion",
  "pmcScope",
  "pmcScenario",
  "pmcHistory",
  "pmcProjection",
] as const;
