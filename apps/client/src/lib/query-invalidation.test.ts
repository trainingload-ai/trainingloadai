import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
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

describe("maximum oxygen uptake after activity processing", () => {
  it("refetches open forecast and history views after import without clearing unrelated data", async () => {
    const client = new QueryClient();
    let revision = 0;
    const stops: Array<() => void> = [];
    const keys = [
      ["pmc", "vdot-forecast", "viewer-one"],
      ["metric-history-vo2Max", "2026-11-05", "2026-11-11", "all", "7"],
      ["metric-history-vo2Max", "2026-09-12", "2026-11-11", "RUN", "60"],
      ["metric-history-vo2-activity", "2026-11-05", "2026-11-11"],
      ["fitness-metric-manual-history", "vo2Max", "all"],
    ];
    try {
      for (const queryKey of keys) {
        const options = {
          queryKey,
          queryFn: async () => ({ revision }),
          staleTime: Infinity,
        };
        await client.fetchQuery(options);
        const observer = new QueryObserver(client, options);
        stops.push(observer.subscribe(() => {}));
      }
      client.setQueryData(["user-settings"], { revision: 0 });
      revision = 1;
      await invalidateAfterActivityPipelineComplete(client);
      for (const key of keys)
        expect(client.getQueryData(key)).toEqual({ revision: 1 });
      expect(client.getQueryState(["user-settings"])?.isInvalidated).toBe(
        false,
      );
      expect(client.getQueryData(["user-settings"])).toEqual({ revision: 0 });
    } finally {
      stops.forEach((stop) => stop());
      client.clear();
    }
  });
});
