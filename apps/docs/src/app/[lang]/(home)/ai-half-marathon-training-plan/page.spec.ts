import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI half marathon training plan page", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  it("is an indexable product page, not a redirect to the distance hub", () => {
    expect(source).not.toContain("permanentRedirect");
    expect(source).toContain("aiHalfMarathonPlanPage");
    expect(source).toContain("/vdot-calculator");
    expect(source).toContain("/training-load");
    expect(source).toContain("/half-marathon-training-plan");
    expect(source).toContain("/ai-training-plan");
    expect(source).toContain("/ai-marathon-training-plan");
  });
});
