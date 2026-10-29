import { describe, expect, it } from "vitest";

import { localizedCoachTurnError } from "./coach-turn-errors";

const labels = {
  modelUnavailable: "model unavailable",
  aborted: "request interrupted",
  business: "business request failed",
  internal: "internal failure",
  upstreamFailed: "upstream failure",
  unsafeOutput: "unsafe output",
  invalidStructuredOutput: "invalid structured output",
  unknown: "unknown failure",
};

describe("localizedCoachTurnError", () => {
  it.each([
    ["model_unavailable", "model unavailable"],
    ["aborted", "request interrupted"],
    ["internal", "internal failure"],
    ["upstream_failed", "upstream failure"],
    ["unsafe_ai_output_blocked", "unsafe output"],
    ["invalid_plan_draft_payload", "invalid structured output"],
    ["PRIVATE_MACHINE_CODE", "unknown failure"],
  ])("maps %s to reviewed client copy", (code, expected) => {
    expect(
      localizedCoachTurnError(
        { code, message: "PRIVATE_SERVER_DETAIL" },
        (key) => labels[key],
      ),
    ).toBe(expected);
  });

  it("keeps reviewed business guidance and filters machine-code echoes", () => {
    expect(
      localizedCoachTurnError(
        { code: "business", message: "请先选择一节可调整的训练课。" },
        (key) => labels[key],
      ),
    ).toBe("请先选择一节可调整的训练课。");
    expect(
      localizedCoachTurnError(
        { code: "business", message: "SOME_PRIVATE_CODE" },
        (key) => labels[key],
      ),
    ).toBe("business request failed");
  });
});
