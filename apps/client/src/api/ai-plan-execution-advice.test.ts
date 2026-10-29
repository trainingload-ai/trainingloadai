import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch }));

import { generatePlanExecutionAdvice } from "./ai-plan-execution-advice";

describe("generatePlanExecutionAdvice", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("passes the device timezone to plan execution advice", async () => {
    await generatePlanExecutionAdvice({
      surface: "PLAN_SIDEBAR",
      planId: "plan-1",
      locale: "zh",
      timezone: "Asia/Shanghai",
    });

    expect(apiFetch).toHaveBeenCalledWith("/ai/plan-execution-advice", {
      method: "POST",
      body: JSON.stringify({
        surface: "PLAN_SIDEBAR",
        planId: "plan-1",
        locale: "zh",
        timezone: "Asia/Shanghai",
        planWorkoutId: undefined,
        activityId: undefined,
        fallbackSummary: undefined,
      }),
    });
  });
});
