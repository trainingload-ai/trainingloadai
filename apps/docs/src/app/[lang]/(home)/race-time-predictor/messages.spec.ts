import { describe, expect, it } from "vitest";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { optimizeSeoText, seoDisplayUnits } from "@/lib/seo-metadata";
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

const LOCKED_TITLE = "Race Time Predictor | 5K, 10K, Half Marathon & Marathon";
const LOCKED_DESCRIPTION =
  "Predict 5K, 10K, half marathon and marathon finish times from a recent race or activity file. Get Daniels VDOT equivalents and pace per km or mile. Free.";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafKeys(item, `${prefix}.${index}`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      leafKeys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe("Race time predictor messages", () => {
  it("keeps the same copy structure in every indexed locale", () => {
    const expected = leafKeys(en.raceTimePredictor).sort();
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].raceTimePredictor;
      expect(leafKeys(copy).sort()).toEqual(expected);
      expect(copy.metadata.title.length).toBeGreaterThan(0);
      expect(copy.metadata.description.length).toBeGreaterThan(0);
      expect(copy.page.title.length).toBeGreaterThan(0);
      expect(copy.page.subtitle.length).toBeGreaterThan(0);
      expect(copy.page.proof).toHaveLength(3);
      expect(copy.page.faq.length).toBe(en.raceTimePredictor.page.faq.length);
      expect(copy.page.promo.steps).toHaveLength(3);
      expect(copy.page.education.accuracy.checks).toHaveLength(3);
      expect(copy.page.education.input.steps).toHaveLength(3);
      expect(copy.page.education.marathon.example).toContain("{source}");
      expect(copy.page.education.marathon.example).toContain("{marathon}");
      expect(copy.client.result.guidance.marathon.length).toBeGreaterThan(0);
      expect(copy.client.result.summaryTitle.length).toBeGreaterThan(0);
      expect(copy.client.result.print.length).toBeGreaterThan(0);
      expect(copy.client.result.share.length).toBeGreaterThan(0);
      expect(
        messages[lang].commonLinks.raceTimePredictorAction.length,
      ).toBeGreaterThan(0);
    }
  });

  it("locks the English title, H1, and meta description", () => {
    expect(en.raceTimePredictor.metadata.title).toBe(LOCKED_TITLE);
    expect(en.raceTimePredictor.page.title).toBe("Race Time Predictor");
    expect(en.raceTimePredictor.metadata.description).toBe(LOCKED_DESCRIPTION);
    expect(en.raceTimePredictor.metadata.openGraph.title).toBe(LOCKED_TITLE);
    expect(en.raceTimePredictor.metadata.openGraph.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.raceTimePredictor.jsonLd.description).toBe(LOCKED_DESCRIPTION);
    expect(en.raceTimePredictor.client.result.summaryTitle).toBe(
      "FINISH TIME SCORECARD",
    );
    expect(en.raceTimePredictor.page.proof).toEqual([
      "No sign-up required",
      "Instant results",
      "Print or share",
    ]);
    expect(
      optimizeSeoText({
        locale: "en",
        context: "calculator",
        title: LOCKED_TITLE,
        description: LOCKED_DESCRIPTION,
      }).description,
    ).toBe(LOCKED_DESCRIPTION);
  });

  it("locks locale head terms for race time prediction", () => {
    expect(zh.raceTimePredictor.metadata.title).toContain("完赛时间预测");
    expect(zh.raceTimePredictor.page.title).toBe("完赛时间预测");
    expect(zh.raceTimePredictor.metadata.keywords).toEqual(
      expect.arrayContaining(["完赛时间预测", "完赛时间计算器"]),
    );
    expect(ja.raceTimePredictor.metadata.title).toContain("レースタイム予測");
    expect(ja.raceTimePredictor.page.title).toBe("レースタイム予測");
    expect(zhHant.raceTimePredictor.metadata.title).toContain("完賽時間預測");
    expect(zhHant.raceTimePredictor.page.title).toBe("完賽時間預測");
    expect(zhHant.raceTimePredictor.metadata.keywords).toEqual(
      expect.arrayContaining(["完賽時間預測", "完賽時間計算機"]),
    );
  });

  it("keeps indexed-locale metadata stable for snippets", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].raceTimePredictor;
      const seo = optimizeSeoText({
        locale: lang,
        context: "calculator",
        title: copy.metadata.title,
        description: copy.metadata.description,
      });
      expect(seo.title).toBe(copy.metadata.title);
      expect(seo.description).toBe(copy.metadata.description);
      if (lang !== "en") {
        expect(seoDisplayUnits(seo.description)).toBeGreaterThanOrEqual(150);
        expect(seoDisplayUnits(seo.description)).toBeLessThanOrEqual(160);
      }
    }
  });

  it("does not collapse indexed-locale titles to the English string", () => {
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].raceTimePredictor.metadata.title,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });
});
