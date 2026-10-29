import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("CSS calculator page source", () => {
  it("keeps two timed swims, a share card, zones, and a promo on one route", async () => {
    const client = await readFile(new URL("./client.tsx", import.meta.url), "utf8");
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const css = await readFile(
      new URL("./css-calculator.module.css", import.meta.url),
      "utf8",
    );
    const promo = await readFile(new URL("./promo.tsx", import.meta.url), "utf8");

    expect(client.indexOf('id="calculator"')).toBeLessThan(
      client.indexOf('id="result"'),
    );
    expect(client).toContain("calculateCss");
    expect(client).toContain("window.print()");
    expect(client).toContain("navigator.clipboard.writeText");
    expect(client).toContain("<Input");
    expect(client).toContain('role="radiogroup"');
    expect(client).toContain('t("manual.meters")');
    expect(client).toContain('t("manual.yards")');
    expect(client).toContain('t("result.print")');
    expect(client).toContain('t("result.copyLink")');
    expect(client).toContain("css-share-actions");
    expect(css).toContain("--css-accent: var(--brand)");
    expect(css).toContain("--css-canvas: var(--background)");
    expect(css).toContain("#94a3b8");
    expect(css).toContain("#3b82f6");
    expect(css).toContain("#10b981");
    expect(css).toContain("#f59e0b");
    expect(css).toContain("#ef4444");
    expect(css).toContain("font-style: italic");
    expect(page).toContain('tPage("title")');
    expect(page).toContain("sections.method.details");
    expect(page).toContain("CSS_ZONES");
    expect(page).toContain("<CssAppPromo");
    expect(page).toContain("/swim-training-plan");
    expect(page).not.toMatch(/-copy\.ts/);
    expect(promo).toContain("buildToolAppUrl");
    expect(promo).toContain('toolId: "css_calculator"');
    expect(promo).toContain("/css-calculator/phone-plan-");
    expect(promo).toContain("/css-calculator/web-plan-");
    expect(page).toContain("/ftp-calculator/recording-");
    expect(page).toContain("/ftp-calculator/watch-");
    expect(promo).not.toMatch(/4\.8|★/);
  });
});
