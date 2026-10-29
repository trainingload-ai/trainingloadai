import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CSS calculator page", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  it("owns critical swim speed intent and links into the swim hub and load tools", () => {
    expect(source).toContain("howToSchema");
    expect(source).toContain("faqPageSchema");
    expect(source).toContain("webApplicationSchema");
    expect(source).toContain("breadcrumbSchema");
    expect(source).toContain("/css-calculator");
    expect(source).toContain("/swim-training-plan");
    expect(source).toContain("/tss-calculator");
    expect(source).toContain("/training-load-calculator");
    expect(source).toContain("/ai-training-plan");
    expect(source).toContain("/workout-editor");
    expect(source).toContain(
      "/docs/metrics/training-load/training-stress-score",
    );
    expect(source).toContain("<CssAppPromo");
    expect(source).toContain("CSS_ZONES");
    expect(source).not.toContain("permanentRedirect");
    expect(source).not.toMatch(/-copy\.ts/);
    expect(source).not.toContain("`${prefix}/ftp-calculator`");
    expect(source).not.toContain("`${prefix}/critical-power-calculator`");
    expect(source).not.toContain("`${prefix}/lactate-threshold-calculator`");
  });
});
