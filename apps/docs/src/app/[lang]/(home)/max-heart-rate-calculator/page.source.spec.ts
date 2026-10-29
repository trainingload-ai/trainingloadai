import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("max heart rate calculator page source", () => {
  it("keeps one h1, server-parsed share inputs, and the scorecard actions", async () => {
    const client = await readFile(new URL("./client.tsx", import.meta.url), "utf8");
    const fileInput = await readFile(new URL("./file-input.tsx", import.meta.url), "utf8");
    const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    const css = await readFile(
      new URL("./max-heart-rate-calculator.module.css", import.meta.url),
      "utf8",
    );

    expect(page.match(/<h1/g)).toHaveLength(1);
    expect(client).not.toContain("<h1");
    expect(page).toContain("readMaxHeartRateInputs");
    expect(page).toContain('tPage("quickAnswer.title")');
    expect(page).toContain('tPage.raw("limitations.items")');
    expect(page).toContain('tPage.raw("measure.steps")');
    expect(client).not.toContain("useSearchParams");
    expect(client).toContain("heartRateZonesMaxHrHref");
    expect(fileInput).toContain("observeMaxHeartRate");
    expect(fileInput).toContain('await import("@/lib/threshold-file")');
    expect(client).toContain('id="result"');
    expect(client).toContain("window.print()");
    expect(client).toContain("navigator.share");
    expect(client).toContain("disabled={activeBpm == null}");
    expect(client).toContain('url.hash = "result"');
    expect(client).toContain("window.location.hash");
    expect(css).toContain("max-width: 680px");
    expect(css).toContain("max-width: 560px");
    expect(css).toContain("max-width: 420px");
    expect(css).toContain('data-wide="true"');
    expect(css).toContain("size: A4 landscape");
    expect(client).not.toContain("target heart rate calculator");
    expect(page).not.toContain("target heart rate calculator");
  });
});
