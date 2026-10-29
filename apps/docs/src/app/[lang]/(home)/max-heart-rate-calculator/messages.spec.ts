import { describe, expect, it } from "vitest";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { optimizeSeoText, seoDisplayUnits } from "@/lib/seo-metadata";
import en from "../../../../../../../packages/messages/docs/en.json";
import ja from "../../../../../../../packages/messages/docs/ja.json";
import zhHant from "../../../../../../../packages/messages/docs/zh-hant.json";
import zh from "../../../../../../../packages/messages/docs/zh.json";

const messages = { en, ja, zh, "zh-hant": zhHant } as const;

const LOCKED_TITLE = "Max Heart Rate Calculator | HRmax by Age & Formula";
const LOCKED_H1 = "Max Heart Rate Calculator";
const LOCKED_DESCRIPTION =
  "Estimate max heart rate by age. Compare 220−age, Tanaka, Gulati, HUNT/Nes and Arena, or use a measured test or activity peak to set HRmax with clear limits.";

function messagePaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    if (value.every((item) => item !== null && typeof item === "object")) {
      return value.flatMap((item, index) => messagePaths(item, `${prefix}[${index}]`));
    }
    return prefix ? [prefix] : [];
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      messagePaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe("max heart rate calculator messages", () => {
  it("keeps the same structure and non-empty copy in every indexed locale", () => {
    const base = messagePaths(en.maxHeartRateCalculator);
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].maxHeartRateCalculator;
      expect(messagePaths(copy)).toEqual(base);
      expect(copy.metadata.title.trim()).not.toBe("");
      expect(copy.metadata.description.trim()).not.toBe("");
      expect(copy.page.title.trim()).not.toBe("");
      expect(copy.page.proof).toHaveLength(3);
      expect(copy.page.quickAnswer.title.trim()).not.toBe("");
      expect(copy.page.limitations.items).toHaveLength(4);
      expect(copy.page.measure.steps).toHaveLength(4);
      expect(copy.page.formulas.hunt.name).toMatch(/HUNT\s*\/\s*Nes/);
      expect(copy.page.zones.z5.label).toContain("VO2max");
      for (const item of copy.page.proof) expect(item.trim()).not.toBe("");
      for (const item of copy.page.faq) {
        expect(item.question.trim()).not.toBe("");
        expect(item.answer.trim()).not.toBe("");
      }
      const seoBlob = [
        copy.metadata.title,
        copy.metadata.description,
        copy.page.title,
        copy.metadata.keywords.join("\n"),
      ].join("\n");
      expect(seoBlob.toLowerCase()).not.toContain("target heart rate calculator");
    }
  });

  it("locks the English title, H1, and meta description", () => {
    expect(en.maxHeartRateCalculator.metadata.title).toBe(LOCKED_TITLE);
    expect(en.maxHeartRateCalculator.page.title).toBe(LOCKED_H1);
    expect(en.maxHeartRateCalculator.metadata.description).toBe(LOCKED_DESCRIPTION);
    expect(en.maxHeartRateCalculator.metadata.openGraph.title).toBe(LOCKED_TITLE);
    expect(en.maxHeartRateCalculator.metadata.openGraph.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.maxHeartRateCalculator.metadata.keywords[0]).toBe(
      "max heart rate calculator",
    );
  });

  it("locks locale H1s without collapsing to English", () => {
    expect(zh.maxHeartRateCalculator.page.title).toBe("最大心率计算器");
    expect(zh.maxHeartRateCalculator.metadata.title).toContain("最大心率计算器");
    expect(ja.maxHeartRateCalculator.page.title).toBe("最大心拍数計算機");
    expect(ja.maxHeartRateCalculator.metadata.title).toContain("最大心拍数計算機");
    expect(zhHant.maxHeartRateCalculator.page.title).toBe("最大心率計算器");
    expect(zhHant.maxHeartRateCalculator.metadata.title).toContain("最大心率計算器");
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].maxHeartRateCalculator.metadata.title,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });

  it("keeps the English lock verbatim and other indexed descriptions inside snippet guidance", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].maxHeartRateCalculator;
      const seo = optimizeSeoText({
        locale: lang,
        context: "calculator",
        title: copy.metadata.title,
        description: copy.metadata.description,
      });
      if (lang === "en") {
        expect(seo.title).toBe(LOCKED_TITLE);
        expect(copy.metadata.description).toBe(LOCKED_DESCRIPTION);
      } else {
        expect(seoDisplayUnits(seo.title)).toBeGreaterThanOrEqual(50);
        expect(seoDisplayUnits(seo.title)).toBeLessThanOrEqual(60);
        expect(seo.description).toBe(copy.metadata.description);
        expect(seoDisplayUnits(seo.description)).toBeGreaterThanOrEqual(150);
        expect(seoDisplayUnits(seo.description)).toBeLessThanOrEqual(160);
      }
    }
  });
});
