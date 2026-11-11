import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
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
      const invalidateQueries = vi.fn(async () => undefined);
      await invalidate({ invalidateQueries } as unknown as QueryClient);
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["v2-home-today-advice"],
      });
    },
  );
});
