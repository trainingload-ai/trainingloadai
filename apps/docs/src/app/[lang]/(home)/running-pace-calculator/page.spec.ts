import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Running pace calculator page", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("./client.tsx", import.meta.url), "utf8");
  const promo = readFileSync(new URL("./promo.tsx", import.meta.url), "utf8");
  const css = readFileSync(
    new URL("./running-pace-calculator.module.css", import.meta.url),
    "utf8",
  );

  it("owns pace/time/distance intent and keeps VDOT on a related link", () => {
    expect(page).toContain("howToSchema");
    expect(page).toContain("faqPageSchema");
    expect(page).toContain("webApplicationSchema");
    expect(page).toContain("breadcrumbSchema");
    expect(page).toContain("/running-pace-calculator");
    expect(page).toContain("/vdot-calculator");
    expect(client).toContain("/race-time-predictor");
    expect(page).toContain("/5k-training-plan");
    expect(page).toContain("/10k-training-plan");
    expect(page).toContain("/half-marathon-training-plan");
    expect(page).toContain("/marathon-training-plan");
    expect(page).toContain("/tools");
    expect(page).toContain('tPage("title")');
    expect(page).toContain("readPaceCalculatorInputs");
    expect(page).toContain("initialInputs");
    expect(page).toContain("<ProductPreview");
    expect(page).toContain("<PaceEducation");
    expect(page).not.toContain("permanentRedirect");
    expect(page).not.toMatch(/This page owns/);
    expect(page).not.toMatch(/-copy\.ts/);
    expect(client).not.toMatch(/-copy\.ts/);
    expect(client).not.toMatch(/from ["']@\/lib\/vdot/);
    expect(promo).toContain('toolId="running_pace_calculator"');
    expect(page.indexOf("<RunningPaceAppPromo")).toBeGreaterThan(
      page.indexOf('id="faq"'),
    );
  });

  it("ships an empty default, an explicit example, and print or share", () => {
    expect(client).toContain('id="result"');
    expect(client).toContain("window.print()");
    expect(client).toContain("navigator.share");
    expect(client).toContain("navigator.clipboard.writeText");
    expect(client).toContain("buildPaceCalculatorSearch");
    expect(client).toContain("PACE_CALCULATOR_EXAMPLE");
    expect(client).toContain("initialInputs");
    expect(client).not.toContain("parsePaceCalculatorQuery");
    expect(client).not.toContain("Copy");
    expect(client).toContain('t("scorecard.title")');
    expect(client).toContain('t("scorecard.method")');
    expect(client).toContain('t("example.result")');
    expect(client).toContain('t("chart.hint")');
    expect(client).toContain("disabled={!result}");
    expect(css).toContain("@media print");
    expect(css).toContain("size: A4 landscape");
    expect(css).toContain("@media (max-width: 680px)");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain("@media (max-width: 420px)");
    expect(css).toContain("print-color-adjust: exact");
  });
});
