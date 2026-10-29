import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("power zones calculator page source", () => {
  it("keeps the reference input, scorecard, print/share, and promo on one route", async () => {
    const client = await readFile(
      new URL("./client.tsx", import.meta.url),
      "utf8",
    );
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const css = await readFile(
      new URL("./power-zones-calculator.module.css", import.meta.url),
      "utf8",
    );
    const promo = await readFile(
      new URL("./promo.tsx", import.meta.url),
      "utf8",
    );

    expect(client.indexOf('id="calculator"')).toBeLessThan(
      client.indexOf('id="result"'),
    );
    expect(client).toContain("calculatePowerZones");
    expect(client).toContain("window.print()");
    expect(client).toContain("navigator.clipboard.writeText");
    expect(client).toContain("navigator.share");
    expect(client).toContain('t("scorecard.print")');
    expect(client).toContain('t("scorecard.copyLink")');
    expect(client).toContain('t("scorecard.exampleAction")');
    expect(client).toContain('t("scorecard.exampleBadge")');
    expect(client).toContain("disabled={!zones}");
    expect(client).toContain('url.hash = "result"');
    expect(client).not.toContain("onCopyZones");
    expect(client).toContain("pz-share-actions");
    expect(client).toContain("<table");
    expect(css).toContain("--pz-accent: var(--brand)");
    expect(css).toContain("--pz-canvas: var(--background)");
    expect(css).toContain("font-style: italic");
    expect(page).toContain('tPage("title")');
    expect(page).toContain("sections.coggan.rows");
    expect(page).toContain("sections.definition.title");
    expect(page).toContain("sections.targets.rows");
    expect(page).toContain("sections.reference.cards");
    expect(page).toContain("sections.limits.items");
    expect(page).toContain("readPowerZonesInputs");
    expect(page).toContain("methods={");
    expect(page).toContain("sections.coggan.exampleLabel");
    expect(page).toContain("tModel(card.id)");
    expect(page).toContain("MODEL_CARD_ORDER");
    expect(page).toContain("<PowerZonesAppPromo");
    expect(page).toContain("/ftp-calculator");
    expect(page).toContain("/critical-power-calculator");
    expect(page).toContain("relatedMore");
    expect(page).toContain('tCommon("allToolsAction")');
    expect(page).not.toMatch(/-copy\.ts/);
    expect(promo).toContain('toolId: "power_zones_calculator"');
    expect(promo).toContain('variant="load"');
    expect(promo).not.toMatch(/4\.8|★|email/i);
  });
});
