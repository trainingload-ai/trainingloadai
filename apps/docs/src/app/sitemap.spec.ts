import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { isIndexableSitemapUrl } from "@/lib/public-html-url";

describe("sitemap", () => {
  it("is regenerated daily and includes the reported RPE route", async () => {
    const source = await readFile(
      new URL("./sitemap.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("export const revalidate = 86_400");
    expect(source).toContain('"/rpe-scale"');
    expect(source).toContain('"/running-pace-calculator"');
    expect(source).toContain('"/race-time-predictor"');
    expect(source).toContain('"/tss-calculator"');
    expect(source).toContain('"/training-load-calculator"');
    expect(source).toContain('"/zone-2-heart-rate-calculator"');
    expect(source).toContain('"/brick-workout"');
    expect(source).toContain('"/olympic-triathlon-training-plan"');
    expect(source).toContain('"/swim-training-plan"');
    expect(source).toContain('"/css-calculator"');
    expect(source).toContain('"/alternatives"');
    expect(source).toContain('"/workout-editor"');
    expect(source).toContain('"/ai-marathon-training-plan"');
    expect(source).toContain('"/ai-half-marathon-training-plan"');
    expect(source).toContain('"/cycling-training-plan"');
    expect(source).toContain('"/ironman-70-3-training-plan"');
    expect(source).toContain('"/rpe-scale": "2026-08-28"');
    expect(source).toContain("const deduped = new Map");
    expect(source).toContain("isIndexableSitemapUrl");
    expect(source).toContain("for (const lang of SEO_INDEXED_LANGUAGES)");
    expect(source).not.toContain(
      "Couch to 5K is the first landing page with complete copy in every locale",
    );
  });

  it("does not emit public .md/.mdx locs or junk markdown paths", async () => {
    const source = await readFile(
      new URL("./sitemap.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("`/pricing.md`");
    expect(source).not.toContain("`/tools.md`");
    expect(source).not.toMatch(/url:\s*`\$\{siteUrl\}\/pricing\.md`/);
    expect(source).not.toMatch(/url:\s*`\$\{siteUrl\}\/tools\.md`/);
    expect(source).not.toMatch(/url:\s*`[^`]*\.(md|mdx)`/);

    const junk = [
      "https://www.trainingload.ai/pricing.md",
      "https://www.trainingload.ai/tools.md",
      "https://www.trainingload.ai/es/docs/guide/effective-vo2max-for-endurance.mdx",
      "https://www.trainingload.ai/ko/docs/planning/manual-workout-editor.mdx",
    ];
    for (const url of junk) {
      expect(isIndexableSitemapUrl(url)).toBe(false);
    }

    expect(
      isIndexableSitemapUrl("https://www.trainingload.ai/pricing"),
    ).toBe(true);
    expect(isIndexableSitemapUrl("https://www.trainingload.ai/tools")).toBe(
      true,
    );
    expect(
      isIndexableSitemapUrl("https://www.trainingload.ai/5k-training-plan"),
    ).toBe(true);
    expect(
      isIndexableSitemapUrl("https://www.trainingload.ai/ai-training-plan"),
    ).toBe(true);
    expect(
      isIndexableSitemapUrl(
        "https://www.trainingload.ai/ai-marathon-training-plan",
      ),
    ).toBe(true);
    expect(
      isIndexableSitemapUrl(
        "https://www.trainingload.ai/ai-half-marathon-training-plan",
      ),
    ).toBe(true);
    expect(
      isIndexableSitemapUrl(
        "https://www.trainingload.ai/running-pace-calculator",
      ),
    ).toBe(true);
    expect(
      isIndexableSitemapUrl(
        "https://www.trainingload.ai/race-time-predictor",
      ),
    ).toBe(true);
    expect(
      isIndexableSitemapUrl("https://www.trainingload.ai/tss-calculator"),
    ).toBe(true);
    expect(
      isIndexableSitemapUrl(
        "https://www.trainingload.ai/training-load-calculator",
      ),
    ).toBe(true);
    expect(
      isIndexableSitemapUrl(
        "https://www.trainingload.ai/zh/training-load-calculator",
      ),
    ).toBe(true);
    expect(
      isIndexableSitemapUrl(
        "https://www.trainingload.ai/zh/running-pace-calculator",
      ),
    ).toBe(true);
    expect(
      isIndexableSitemapUrl(
        "https://www.trainingload.ai/zh/race-time-predictor",
      ),
    ).toBe(true);
    expect(
      isIndexableSitemapUrl(
        "https://www.trainingload.ai/blog/what-are-ctl-atl-tsb",
      ),
    ).toBe(true);
  });
});
