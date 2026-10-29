import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("TSS calculator page", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  it("owns TSS calculator intent and links into PMC and FTP", () => {
    expect(source).toContain("howToSchema");
    expect(source).toContain("faqPageSchema");
    expect(source).toContain("webApplicationSchema");
    expect(source).toContain("breadcrumbSchema");
    expect(source).toContain('id="examples"');
    expect(source).toContain('id="methods"');
    expect(source).toContain('id="use-tss"');
    expect(source).toContain("TableHeader");
    expect(source).toContain("sourceLinks");
    expect(source).toContain("/tss-calculator");
    expect(source).toContain("/training-load-calculator");
    expect(source).toContain("/css-calculator");
    expect(source).toContain("/swim-training-plan");
    expect(source).toContain("/ftp-calculator");
    expect(source).toContain("/power-zones-calculator");
    expect(source).toContain("/training-load");
    expect(source).toContain("/cycling-training-plan");
    expect(source).toContain("/ironman-70-3-training-plan");
    expect(source).toContain(
      "/docs/metrics/training-load/training-stress-score",
    );
    expect(source).toContain('toolId="tss_calculator"');
    expect(source).not.toContain("permanentRedirect");
  });
});
