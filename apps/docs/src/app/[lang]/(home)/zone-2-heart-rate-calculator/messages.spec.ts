import { describe, expect, it } from "vitest";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { optimizeSeoText } from "@/lib/seo-metadata";
import en from "../../../../../../../packages/messages/docs/en.json";
import ja from "../../../../../../../packages/messages/docs/ja.json";
import zhHant from "../../../../../../../packages/messages/docs/zh-hant.json";
import zh from "../../../../../../../packages/messages/docs/zh.json";

const messages = {
  en,
  ja,
  zh,
  "zh-hant": zhHant,
} as const;

const LOCKED_TITLE = "Zone 2 Heart Rate Calculator | Age, HRR, Max HR & LTHR";
const LOCKED_H1 = "Zone 2 Heart Rate Calculator";
const LOCKED_DESCRIPTION =
  "Calculate one aerobic Zone 2 bpm range from age, measured max HR, Karvonen HRR, or LTHR. Compare methods and verify it with the talk test during easy training.";

function structuralShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object") return [structuralShape(first)];
    return ["primitive"];
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        structuralShape(child),
      ]),
    );
  }
  return "leaf";
}

function leafStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(leafStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(leafStrings);
  }
  return [];
}

describe("Zone 2 calculator messages", () => {
  it("keeps the same non-empty structure in every indexed locale", () => {
    const englishShape = structuralShape(en.zone2HeartRateCalculator);
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].zone2HeartRateCalculator;
      expect(structuralShape(copy)).toEqual(englishShape);
      for (const value of leafStrings(copy)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
      expect(copy.page.proof).toHaveLength(
        en.zone2HeartRateCalculator.page.proof.length,
      );
      expect(copy.page.faq).toHaveLength(
        en.zone2HeartRateCalculator.page.faq.length,
      );
      expect(copy.page.sections.methods.rows).toHaveLength(
        en.zone2HeartRateCalculator.page.sections.methods.rows.length,
      );
      expect(new Set(copy.page.faq.map((item) => item.question)).size).toBe(
        copy.page.faq.length,
      );
    }
  });

  it("locks the English title, H1, and description", () => {
    expect(en.zone2HeartRateCalculator.metadata.title).toBe(LOCKED_TITLE);
    expect(en.zone2HeartRateCalculator.page.title).toBe(LOCKED_H1);
    expect(en.zone2HeartRateCalculator.metadata.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.zone2HeartRateCalculator.metadata.openGraph.title).toBe(
      LOCKED_TITLE,
    );
    expect(en.zone2HeartRateCalculator.metadata.openGraph.description).toBe(
      LOCKED_DESCRIPTION,
    );
  });

  it("locks locale H1s", () => {
    expect(zh.zone2HeartRateCalculator.page.title).toBe("二区心率计算器");
    expect(zh.zone2HeartRateCalculator.metadata.title).toBe(
      "二区心率计算器｜年龄、HRR、最大心率与 LTHR",
    );
    expect(ja.zone2HeartRateCalculator.page.title).toBe("ゾーン2心拍数計算機");
    expect(ja.zone2HeartRateCalculator.metadata.title).toContain("ゾーン2");
    expect(zhHant.zone2HeartRateCalculator.page.title).toBe("二區心率計算器");
    expect(zhHant.zone2HeartRateCalculator.metadata.title).toContain(
      "二區心率",
    );
  });

  it("keeps locked descriptions after snippet optimization", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].zone2HeartRateCalculator;
      const seo = optimizeSeoText({
        locale: lang,
        context: "calculator",
        title: copy.metadata.title,
        description: copy.metadata.description,
      });
      expect(seo.title).toBe(copy.metadata.title);
      expect(seo.description).toBe(copy.metadata.description);
    }
  });

  it("does not collapse indexed-locale titles to one string", () => {
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].zone2HeartRateCalculator.metadata.title,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });
});
