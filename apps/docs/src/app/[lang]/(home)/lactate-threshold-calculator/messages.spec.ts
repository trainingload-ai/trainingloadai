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

const LOCKED_TITLE = "Lactate Threshold Calculator | LT1, LT2, LTHR & Pace";
const LOCKED_DESCRIPTION =
  "Estimate LT1 and LT2 from a race or field test. Calculate lactate threshold pace, LTHR or power, compare methods, and open heart-rate or power zones. Free.";

describe("lactate threshold calculator messages", () => {
  it("provides title, FAQ, protocols, chart, and promo for every indexed locale", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].lactateThresholdCalculator;
      expect(copy.metadata.title.length).toBeGreaterThan(10);
      expect(copy.metadata.description.length).toBeGreaterThan(40);
      expect(copy.metadata.keywords.length).toBeGreaterThan(2);
      expect(copy.metadata.title).not.toMatch(/^Free\b/i);
      expect(copy.page.title).not.toMatch(/^Free\b/i);
      expect(copy.metadata.title).not.toMatch(
        /ftp calculator|critical power calculator/i,
      );
      expect(copy.metadata.keywords.join(" ")).not.toMatch(
        /ftp calculator|critical power calculator/i,
      );
      expect(copy.page.faq.length).toBeGreaterThanOrEqual(9);
      for (const item of copy.page.faq) {
        expect(item.question.trim()).not.toBe("");
        expect(item.answer.trim()).not.toBe("");
        expect(item.answer).not.toMatch(/tens of thousands|4\.8|★/i);
      }
      expect(copy.page.sections.protocols.rows.length).toBeGreaterThanOrEqual(
        4,
      );
      expect(copy.page.proof).toHaveLength(3);
      expect(copy.page.proof.join(" ")).not.toMatch(
        /★|reviews|4\.8|unlock my results/i,
      );
      expect(copy.page.promo.steps).toHaveLength(3);
      expect(copy.page.promo.benefits).toHaveLength(3);
      expect(copy.page.promo.collage.zonesAlt.length).toBeGreaterThan(8);
      expect(copy.page.promo.collage.planAlt.length).toBeGreaterThan(8);
      expect(
        `${copy.page.promo.collage.zonesAlt} ${copy.page.promo.collage.planAlt} ${copy.page.promo.cta.trust}`,
      ).not.toMatch(/★|reviews|4\.8/i);
      expect(copy.client.manual.unitsMetric.length).toBeGreaterThan(1);
      expect(copy.client.manual.unitsImperial.length).toBeGreaterThan(1);
      expect(copy.client.scorecard.print.length).toBeGreaterThan(0);
      expect(copy.client.scorecard.copyLink.length).toBeGreaterThan(0);
      expect(copy.page.sections.chart.headers.lt2Km.length).toBeGreaterThan(1);
      expect(copy.page.ui.jump.result.length).toBeGreaterThan(1);
      expect(new Set(copy.page.faq.map((item) => item.question)).size).toBe(
        copy.page.faq.length,
      );
    }
  });

  it("locks the English title, H1, and meta description", () => {
    expect(en.lactateThresholdCalculator.metadata.title).toBe(LOCKED_TITLE);
    expect(en.lactateThresholdCalculator.page.title).toBe(
      "Lactate Threshold Calculator",
    );
    expect(en.lactateThresholdCalculator.metadata.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.lactateThresholdCalculator.metadata.openGraph.title).toBe(
      LOCKED_TITLE,
    );
    expect(en.lactateThresholdCalculator.metadata.openGraph.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.lactateThresholdCalculator.metadata.keywords[0]).toBe(
      "lactate threshold calculator",
    );
    const answers = en.lactateThresholdCalculator.page.faq
      .map((item) => item.answer)
      .join("\n");
    expect(answers).toMatch(/4:22 \/km/);
    expect(answers).toMatch(/7:02 \/mi/);
    expect(answers).toMatch(/247 W/);
    expect(answers).toMatch(/139–154 bpm/);
    expect(answers).toMatch(/260 W/);
    expect(answers).toMatch(/173–198 W/);
    expect(en.lactateThresholdCalculator.page.heroProduct.body).toMatch(
      /iPhone/,
    );
    expect(en.lactateThresholdCalculator.page.heroProduct.body).toMatch(
      /Apple Watch/,
    );
  });

  it("keeps Traditional Chinese lactate and LTHR intents visible", () => {
    const copy = zhHant.lactateThresholdCalculator;
    const blob = [
      copy.metadata.title,
      copy.metadata.description,
      copy.metadata.keywords.join("\n"),
      copy.page.subtitle,
    ].join("\n");
    expect(blob).toContain("乳酸閾值計算");
    expect(blob.toLowerCase()).toContain("lthr 計算");
    expect(copy.page.title).toBe("乳酸閾值計算器");
  });

  it("locks locale head terms without collapsing to English", () => {
    expect(zh.lactateThresholdCalculator.page.title).toBe("乳酸阈值计算器");
    expect(zh.lactateThresholdCalculator.metadata.title).toContain(
      "乳酸阈值计算器",
    );
    expect(ja.lactateThresholdCalculator.page.title).toBe("乳酸閾値計算機");
    expect(ja.lactateThresholdCalculator.metadata.title).toContain(
      "乳酸閾値計算機",
    );
    expect(zhHant.lactateThresholdCalculator.metadata.title).toContain(
      "乳酸閾值計算",
    );
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].lactateThresholdCalculator.metadata.title,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });

  it("keeps indexed-locale metadata inside snippet guidance", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].lactateThresholdCalculator;
      const seo = optimizeSeoText({
        locale: lang,
        context: "calculator",
        title: copy.metadata.title,
        description: copy.metadata.description,
      });
      if (lang === "en") {
        expect(seo.title).toBe(LOCKED_TITLE);
        expect(seo.description).toBe(LOCKED_DESCRIPTION);
      } else {
        expect(seoDisplayUnits(seo.title)).toBeGreaterThanOrEqual(50);
        expect(seoDisplayUnits(seo.title)).toBeLessThanOrEqual(60);
        expect(seo.description).toBe(copy.metadata.description);
      }
      expect(seoDisplayUnits(seo.description)).toBeGreaterThanOrEqual(150);
      expect(seoDisplayUnits(seo.description)).toBeLessThanOrEqual(160);
    }
  });
});
