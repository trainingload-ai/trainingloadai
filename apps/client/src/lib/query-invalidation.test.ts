import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  invalidateAfterActivityPipelineComplete,
  invalidateAfterPlanMutation,
  invalidateActivePlanAndPlanDetails,
  invalidatePlanListsAndActive,
} from "./query-invalidation";

describe("today advice cache invalidation", () => {
  it.each([
    invalidateAfterActivityPipelineComplete,
    invalidateAfterPlanMutation,
    invalidateActivePlanAndPlanDetails,
    invalidatePlanListsAndActive,
  ])(
    "refreshes independent advice when activity or plan facts change",
    async (invalidate) => {
      const client = new QueryClient();
      const queryKey = ["v2-home-today-advice", "zh"];
      try {
        client.setQueryData(queryKey, { suggestionId: "before-change" });
        expect(client.getQueryState(queryKey)?.isInvalidated).toBe(false);
        await invalidate(client);
        expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
      } finally {
        client.clear();
      }
    },
  );
});
