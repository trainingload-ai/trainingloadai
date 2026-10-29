import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("critical power calculator page source", () => {
  it("keeps typed efforts, a share card, methods, and a promo on one route", async () => {
    const client = await readFile(new URL("./client.tsx", import.meta.url), "utf8");
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const css = await readFile(
      new URL("./critical-power-calculator.module.css", import.meta.url),
      "utf8",
    );
    const promo = await readFile(new URL("./promo.tsx", import.meta.url), "utf8");

    expect(client.indexOf('id="calculator"')).toBeLessThan(
      client.indexOf('id="result"'),
    );
    expect(client).toContain("fitCriticalPower");
    expect(client).toContain("cpZonesHref");
    expect(client).toContain("window.print()");
    expect(client).toContain("navigator.clipboard.writeText");
    expect(client).toContain("<SelectTrigger");
    expect(client).toContain("<Input");
    expect(client).toContain('suffix="W"');
    expect(client).toContain('role="radiogroup"');
    expect(client).toContain('t("manual.unitsMetric")');
    expect(client).toContain('t("manual.weightLabelLb")');
    expect(client).toContain("CpFileInput");
    expect(client).not.toContain("Pmax");
    expect(css).toContain("--cp-accent: var(--brand)");
    expect(css).toContain("--cp-canvas: var(--background)");
    expect(css).toContain("font-style: italic");
    expect(page).toContain('tPage("title")');
    expect(page).toContain("sections.methods.details");
    expect(page).toContain("<CpAppPromo");
    expect(page).toContain("/ftp-calculator");
    expect(page).toContain("/power-zones-calculator");
    expect(page).not.toMatch(/-copy\.ts/);
    expect(page).not.toContain("sections.answer");
    expect(promo).toContain('toolId: "critical_power_calculator"');
    expect(promo).toContain("/ftp-calculator/web-pmc.webp");
    expect(promo).toContain("/ftp-calculator/phone-en.webp");
    expect(promo).not.toMatch(/4\.8|★/);
  });
});
