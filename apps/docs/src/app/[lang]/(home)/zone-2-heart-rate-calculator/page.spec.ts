import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Zone 2 heart rate calculator page", () => {
  it("keeps one scorecard route with shared handoffs", async () => {
    const client = await readFile(
      new URL("./client.tsx", import.meta.url),
      "utf8",
    );
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const css = await readFile(
      new URL("./zone-2-heart-rate-calculator.module.css", import.meta.url),
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
    expect(page).toContain("sections.methods.rows");
    expect(page).toContain("<Zone2AppPromo");
    expect(page).toContain("key={JSON.stringify(initial)}");
    expect(page).toContain("<ProductPreview");
    expect(page.match(/<h1/g)).toHaveLength(1);
    expect(page).toContain("/heart-rate-zones-calculator");
    expect(page).toContain("/max-heart-rate-calculator");
    expect(page).toContain("/features/custom-zones");
    expect(page).toContain("/docs/metrics/heart-rate/zones");
    expect(client.match(/<h1/g)).toBeNull();
    expect(client).toContain("Printer");
    expect(client).toContain("Share2");
    expect(client).not.toMatch(/<Copy[\s/>]/);
    expect(client).toContain("disabled={!result}");
    expect(client).toContain('error_code: "clipboard_failed"');
    expect(client).toContain("AbortError");
    expect(client).toContain('hash = "result"');
    expect(client).toContain("heartRateZonesHref");
    expect(client).toContain("max-heart-rate-calculator");
    expect(css).toContain("@media (max-width: 680px)");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain("@media (max-width: 420px)");
    expect(css).toContain("print-color-adjust: exact");
    expect(css).toContain("@page");
    expect(promo).toContain('toolId: "zone_2_heart_rate_calculator"');
    expect(promo).toContain("<CalculatorPromo");
    expect(promo).toContain('cta_placement: "tool_footer"');
  });
});
