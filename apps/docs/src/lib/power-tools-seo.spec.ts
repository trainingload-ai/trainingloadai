import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import en from "../../../../packages/messages/docs/en.json";
import { llmFreeToolPages } from "./llms-catalog";

describe("power tool SEO ownership", () => {
  it("keeps distinct calculator heads in shipped metadata and the AI catalog", () => {
    const calculators = [
      {
        path: "/ftp-calculator",
        copy: en.estimateCp,
        heads: ["ftp calculator"],
      },
      {
        path: "/critical-power-calculator",
        copy: en.criticalPowerCalculator,
        heads: ["critical power calculator"],
      },
      {
        path: "/power-zones-calculator",
        copy: en.powerZonesCalculator,
        heads: ["power zone calculator", "power zones calculator"],
      },
    ];
    const allHeads = calculators.flatMap(({ heads }) => heads);

    for (const { path, copy, heads } of calculators) {
      const keywords = copy.metadata.keywords.map((keyword) =>
        keyword.toLowerCase(),
      );
      expect(keywords.filter((keyword) => allHeads.includes(keyword))).toEqual(
        heads,
      );
      expect(copy.metadata.title.toLowerCase()).toContain(heads[0]);
      expect(copy.page.title.toLowerCase()).toContain(heads[0]);

      const entries = llmFreeToolPages.filter((entry) => entry.path === path);
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe(copy.page.title);
      expect(entries[0].description.length).toBeGreaterThan(0);
    }
  });

  it("keeps race-distance overlay files out of these calculator pages", async () => {
    const files = [
      "../app/[lang]/(home)/ftp-calculator/page.tsx",
      "../app/[lang]/(home)/critical-power-calculator/page.tsx",
      "../app/[lang]/(home)/power-zones-calculator/page.tsx",
    ];
    for (const file of files) {
      const source = await readFile(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/-copy\.ts/);
    }
  });
});
