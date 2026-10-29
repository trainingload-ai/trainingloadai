import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("workout editor page source", () => {
  it("keeps share, print, examples, and the plan screenshot on one route", async () => {
    const client = await readFile(
      new URL("./client.tsx", import.meta.url),
      "utf8",
    );
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const css = await readFile(
      new URL("./workout-editor.module.css", import.meta.url),
      "utf8",
    );
    const promo = await readFile(
      new URL("./promo.tsx", import.meta.url),
      "utf8",
    );

    expect(page.indexOf('tPage("title")')).toBeLessThan(
      page.indexOf("<WorkoutEditorClient"),
    );
    expect(page).toContain("<ProductPreview");
    expect(page).toContain('variant="plan"');
    expect(page).toContain("readWorkoutShare");
    expect(page).toContain("/docs/planning/manual-workout-editor");
    expect(page).toContain("styles.relatedMore");
    expect(client).toContain('id="builder"');
    expect(client).toContain('id="result"');
    expect(client).toContain("window.print");
    expect(client).toContain("navigator.share");
    expect(client).toContain("shareResultUrl");
    expect(client).toContain('import("./workout-fit")');
    expect(client).toContain('import("./timeline")');
    expect(client).not.toContain('from "@garmin/fitsdk"');
    expect(client).toContain("createExampleWorkout");
    expect(client).toContain("initialInputs");
    expect(css).toContain("@media (max-width: 680px)");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain("@media (max-width: 420px)");
    expect(css).toContain("size: A4 landscape");
    expect(css).toContain("print-color-adjust: exact");
    expect(promo).toContain("<CalculatorPromo");
    expect(promo).toContain('variant="plan"');
    expect(promo).not.toContain("/css-calculator/");
  });
});
