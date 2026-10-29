import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("lactate threshold calculator page source", () => {
  it("keeps the field test, share card, protocols, chart, and promo", async () => {
    const client = await readFile(
      new URL("./client.tsx", import.meta.url),
      "utf8",
    );
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const css = await readFile(
      new URL("./lactate-threshold-calculator.module.css", import.meta.url),
      "utf8",
    );
    const promo = await readFile(
      new URL("./promo.tsx", import.meta.url),
      "utf8",
    );

    expect(client.indexOf('id="calculator"')).toBeLessThan(
      client.indexOf('id="result"'),
    );
    expect(client).toContain("estimateLt2PaceFromRace");
    expect(client).toContain("heartRateZonesHref");
    expect(client).toContain("powerZonesHref");
    expect(client).toContain("window.print()");
    expect(client).toContain("navigator.clipboard.writeText");
    expect(client).toContain("<SelectTrigger");
    expect(client).toContain("<Input");
    expect(client).toContain('suffix="W"');
    expect(client).toContain('role="radiogroup"');
    expect(client.indexOf('role="radiogroup"')).toBeLessThan(
      client.indexOf("<TabsList"),
    );
    expect(client).toContain('t("manual.unitsMetric")');
    expect(client).toContain('t("scorecard.print")');
    expect(client).toContain('t("scorecard.copyLink")');
    expect(client).toContain('id="workouts"');
    expect(css).toContain("--lt-accent: var(--brand)");
    expect(css).toContain("--lt-canvas: var(--background)");
    expect(css).toContain("#94a3b8");
    expect(css).toContain("#3b82f6");
    expect(css).toContain("#10b981");
    expect(css).toContain("#f59e0b");
    expect(css).toContain("#ef4444");
    expect(css).toContain("font-style: italic");
    expect(page).toContain('tPage("title")');
    expect(page).toContain("sections.protocols.rows");
    expect(page).toContain("sections.explained.cards");
    expect(page).toContain("sections.chart");
    expect(page).toContain("buildThresholdPaceChart");
    expect(page).toContain("<LactateAppPromo");
    expect(page).toContain("/heart-rate-zones-calculator");
    expect(page).toContain("/power-zones-calculator");
    expect(page).toContain("/ftp-calculator");
    expect(page).not.toMatch(/-copy\.ts/);
    expect(promo).toContain("buildToolAppUrl");
    expect(promo).toContain('toolId: "lactate_threshold_calculator"');
    expect(promo).toContain("/lactate-threshold-calculator");
    expect(promo).toContain("zones-${previewLocale}.png");
    expect(promo).toContain("plan-${previewLocale}.png");
    expect(promo).not.toMatch(/4\.8|★/);
  });
});
