import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Training load calculator page", () => {
  it("keeps a teaching EWMA, a share card, and a promo on one route", async () => {
    const client = await readFile(
      new URL("./client.tsx", import.meta.url),
      "utf8",
    );
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const css = await readFile(
      new URL("./training-load-calculator.module.css", import.meta.url),
      "utf8",
    );
    const promo = await readFile(
      new URL("./promo.tsx", import.meta.url),
      "utf8",
    );

    expect(page).toContain("howToSchema");
    expect(page).toContain("faqPageSchema");
    expect(page).toContain("webApplicationSchema");
    expect(page).toContain("breadcrumbSchema");
    expect(page).toContain('tPage("title")');
    expect(page).toContain("sections.formula.rows");
    expect(page).toContain("<TrainingLoadAppPromo");
    expect(page).toContain("/training-load-calculator");
    expect(page).toContain("/tss-calculator");
    expect(page).toContain("/features/pmc-fitness-chart");
    expect(page).toContain("/blog/what-are-ctl-atl-tsb");
    expect(page).toContain("/docs/metrics/pmc/chronic-training-load");
    expect(page).toContain("/training-load");
    expect(page).toContain("/ftp-calculator");
    expect(page).toContain("/css-calculator");
    expect(page).toContain("/swim-training-plan");
    expect(page).toContain("/plan");
    expect(page).toContain("/ai-training-plan");
    expect(page).toContain("/cycling-training-plan");
    expect(page).toContain("/ironman-70-3-training-plan");
    expect(page).not.toContain("permanentRedirect");
    expect(page).not.toMatch(/-copy\.ts/);
    expect(page).not.toContain("sections.answer");

    expect(client.indexOf('id="calculator"')).toBeLessThan(
      client.indexOf('id="result"'),
    );
    expect(client).toContain("projectPmc");
    expect(client).toContain("window.print()");
    expect(client).toContain("navigator.clipboard.writeText");
    expect(client).toContain('hash = "result"');

    expect(css).toContain("--tl-accent: var(--brand)");
    expect(css).toContain("--tl-canvas: var(--background)");
    expect(css).toContain("@media print");

    expect(promo).toContain('toolId: "training_load_calculator"');
    expect(promo).toContain("<CalculatorPromo");
    expect(promo).toContain('namespace="trainingLoadCalculator.page.promo"');
    expect(page).toContain("<ProductPreview");
    expect(promo).not.toMatch(/4\.8|★/);
  });
});
