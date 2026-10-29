import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Race time predictor page source", () => {
  it("ships a finish-time scorecard, SSR share state, and a local file window", async () => {
    const client = await readFile(
      new URL("./client.tsx", import.meta.url),
      "utf8",
    );
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const css = await readFile(
      new URL("./race-time-predictor.module.css", import.meta.url),
      "utf8",
    );
    const promo = await readFile(
      new URL("./promo.tsx", import.meta.url),
      "utf8",
    );
    const file = await readFile(
      new URL("./file-input.tsx", import.meta.url),
      "utf8",
    );

    expect(client).toContain('id="result"');
    expect(client).toContain("initialInputs");
    expect(client).toContain("buildRaceTimeSearch");
    expect(client).not.toContain("parseRaceTimeQuery");
    expect(client).toContain("window.print()");
    expect(client).toContain("navigator.share");
    expect(client).toContain("navigator.clipboard.writeText");
    expect(client).toContain("AbortError");
    expect(client).not.toContain("result.copy");
    expect(client).toContain("paceKm");
    expect(client).toContain("paceMi");
    expect(client).toContain("/vdot-calculator");
    expect(client).not.toContain("Riegel");
    expect(page).toContain("readRaceTimeShare");
    expect(page).toContain("<ProductPreview");
    expect(css).toContain("@media (max-width: 680px)");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain("@media (max-width: 420px)");
    expect(css).toContain("print-color-adjust: exact");
    expect(promo).toContain('toolId: "race_time_predictor"');
    expect(promo).toContain("<CalculatorPromo");
    expect(promo).toContain('variant="recording"');
    expect(file).toContain("bestRaceWindow");
    expect(file).toContain("readThresholdFile");
    expect(page).not.toMatch(/-copy\.ts/);
  });
});
