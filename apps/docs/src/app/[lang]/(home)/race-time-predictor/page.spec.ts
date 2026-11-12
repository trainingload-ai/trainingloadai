import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Race time predictor page", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  it("owns finish-time prediction intent and links into VDOT, pace, and plans", () => {
    expect(source).toContain("howToSchema");
    expect(source).toContain("faqPageSchema");
    expect(source).toContain("webApplicationSchema");
    expect(source).toContain("breadcrumbSchema");
    expect(source).toContain("readRaceTimeShare");
    expect(source).toContain("/race-time-predictor");
    expect(source).toContain("/vdot-calculator");
    expect(source).toContain("/running-pace-calculator");
    expect(source).toContain("/10k-training-plan");
    expect(source).toContain("/half-marathon-training-plan");
    expect(source).toContain("/marathon-training-plan");
    expect(source).toContain("<RaceAppPromo");
    expect(source).toContain('id="faq"');
    expect(source).toContain('id="related"');
    expect(source.indexOf("<RaceTimePredictorClient")).toBeLessThan(
      source.indexOf('id="faq"'),
    );
    expect(source.indexOf('id="faq"')).toBeLessThan(
      source.indexOf('id="related"'),
    );
    expect(source.indexOf('id="related"')).toBeLessThan(
      source.indexOf("<RaceAppPromo"),
    );
    expect(source).not.toContain("permanentRedirect");
    expect(source).not.toMatch(/-copy\.ts/);
  });
});
