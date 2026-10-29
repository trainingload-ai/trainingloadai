import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("brick workout page", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  it("explains brick training and links triathlon hubs without a fake library", () => {
    expect(source).toContain("howToSchema");
    expect(source).toContain("faqPageSchema");
    expect(source).toContain("/brick-workout");
    expect(source).toContain("/olympic-triathlon-training-plan");
    expect(source).toContain("/ironman-70-3-training-plan");
    expect(source).toContain("/workout-editor");
    expect(source).not.toContain("week 1 monday");
    expect(source).not.toContain("Z2 3x12");
    expect(source).not.toContain("permanentRedirect");
    expect(source).not.toContain("-copy.ts");
  });
});
