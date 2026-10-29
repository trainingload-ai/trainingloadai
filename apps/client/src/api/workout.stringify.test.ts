import { describe, expect, it } from "vitest";
import { stringifyParsedPlan, type ParsedPlan } from "./workout";

describe("stringifyParsedPlan", () => {
  it("preserves manual step kinds in DSL output", () => {
    const plan: ParsedPlan = [
      {
        type: "work",
        steps: [
          { duration: 600, stepKind: "WARMUP" },
          { duration: 1800, stepKind: "WORK" },
          { duration: 300, stepKind: "COOLDOWN" },
        ],
      },
    ];

    expect(stringifyParsedPlan(plan)).toBe("warmup 10m\nwork 30m\ncooldown 5m");
  });
});
