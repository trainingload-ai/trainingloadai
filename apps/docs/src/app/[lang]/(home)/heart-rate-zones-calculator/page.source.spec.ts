import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("heart-rate zones calculator page source", () => {
  it("keeps server inputs, the scorecard actions, and the activity estimate", async () => {
    const client = await readFile(
      new URL("./client.tsx", import.meta.url),
      "utf8",
    );
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const fileInput = await readFile(
      new URL("./file-input.tsx", import.meta.url),
      "utf8",
    );
    const css = await readFile(
      new URL("./heart-rate-zones-calculator.module.css", import.meta.url),
      "utf8",
    );
    const promo = await readFile(
      new URL("./promo.tsx", import.meta.url),
      "utf8",
    );

    expect(page).toContain("readHeartRateZonesInputs");
    expect(page).toContain("initialInputs");
    expect(page).toContain("<ProductPreview");
    expect(page).toContain("HeartRateZonesFooterCta");
    expect(page).toContain("relatedMore");
    expect(page).toContain('id="methods"');
    expect(fileInput).toContain("estimateActivityLthr");
    expect(fileInput).toContain("heart-rate-activity");
    expect(client).toContain("navigator.share");
    expect(client).toContain("AbortError");
    expect(client).toContain("example");
    expect(client).not.toContain("lucide-react/dist");
    expect(client).not.toMatch(/Copy/);
    expect(css).toContain("@page");
    expect(css).toContain("A4 landscape");
    expect(css).toContain("max-width: 680px");
    expect(css).toContain("max-width: 560px");
    expect(css).toContain("max-width: 420px");
    expect(css).toContain("2.2rem minmax(0, 1fr) 5rem 4rem");
    expect(promo).toContain('toolId: "heart_rate_zones_calculator"');
    expect(promo).toContain('cta_placement: "tool_footer"');
  });
});
