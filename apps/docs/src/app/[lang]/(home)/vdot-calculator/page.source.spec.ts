import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("VDOT calculator page source", () => {
  it("keeps the scorecard, share inputs, and local file estimate on one route", async () => {
    const client = await readFile(
      new URL("./client.tsx", import.meta.url),
      "utf8",
    );
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const css = await readFile(
      new URL("./vdot-calculator.module.css", import.meta.url),
      "utf8",
    );
    const promo = await readFile(
      new URL("./promo.tsx", import.meta.url),
      "utf8",
    );
    const share = await readFile(
      new URL("./share-inputs.ts", import.meta.url),
      "utf8",
    );
    const fileInput = await readFile(
      new URL("./file-input.tsx", import.meta.url),
      "utf8",
    );

    expect(page).toContain("readVdotInputs");
    expect(page).toContain("initialInputs");
    expect(page).toContain('aria-label={tPage("onThisPage")}');
    expect(page).not.toContain('aria-label="On this page"');
    expect(page).toContain("styles.examplesTitle");
    expect(css).toMatch(/\.examplesTitle \{[^}]*margin-top/);
    expect(page).toContain("<h1");
    expect(page.indexOf("<h1")).toBe(page.lastIndexOf("<h1"));
    expect(page).toContain("faqItems");
    expect(page).toContain("<details");
    expect(page).toContain("method.rows");
    expect(page).toContain("methods={methods}");
    expect(page).toContain("relatedMore");
    expect(page).toContain("allToolsAction");
    expect(page).toContain("<ProductPreview");
    expect(page).toContain("<VdotAppPromo");
    expect(page).not.toMatch(/-copy\.ts/);
    expect(page).not.toContain("computeFitnessLevel");

    expect(client.indexOf('id="calculator"')).toBeLessThan(
      client.indexOf('id="result"'),
    );
    expect(client).toContain("window.print()");
    expect(client).toContain("navigator.share");
    expect(client).toContain("navigator.clipboard.writeText");
    expect(client).toContain('hash = "result"');
    expect(client).toContain("clipboard_failed");
    expect(client).toContain("AbortError");
    expect(client).toContain("disabled={!result}");
    // The training-plan generator route does not exist; no link to it.
    expect(client).not.toContain("vdot-training-plan-generator");
    expect(client).not.toContain("scorecard.viewPlan");
    expect(client).toContain("race-time-predictor");
    expect(client).toContain("VdotFileInput");
    expect(client).toContain('set("example", "1")');
    expect(fileInput).toContain("estimateVdotFromActivity");
    expect(client).toContain('t("example.button")');
    expect(client).toContain('t("scorecard.title")');
    expect(client).not.toContain('t("scorecard.copy")');
    expect(client).not.toContain("computeFitnessLevel");
    expect(client).not.toContain("useLayoutEffect");

    expect(share).toContain('readText(params, "example") === "1"');
    expect(css).toContain("print-color-adjust: exact");
    expect(css).toContain("size: A4 landscape");
    expect(css).toContain("@media (max-width: 680px)");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain("@media (max-width: 420px)");
    expect(promo).toContain('toolId: "vdot_calculator"');
    expect(promo).toContain('ctaPlacement: "tool_footer"');
    expect(promo).toContain("<CalculatorPromo");
    expect(promo).toContain('variant="fitness"');
  });
});
