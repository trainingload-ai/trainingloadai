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

const LOCKED_TITLE = "Training Load Calculator | CTL, ATL & TSB";
const LOCKED_DESCRIPTION =
  "Free training load calculator for CTL, ATL, and TSB. Enter starting fitness/fatigue and a week of daily TSS — a teaching PMC EWMA demo, not the full in-app chart.";

describe("Training load calculator messages", () => {
  it("provides a scorecard, worked EWMA, FAQ, and promo for every indexed locale", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].trainingLoadCalculator;
      expect(copy.metadata.title.length).toBeGreaterThan(10);
      expect(copy.metadata.description.length).toBeGreaterThan(40);
      expect(copy.metadata.keywords.length).toBeGreaterThan(2);
      expect(copy.metadata.title).not.toMatch(/^Free\b/);
      expect(copy.metadata.title).not.toMatch(/^PMC\b/i);
      expect(copy.page.faq.length).toBeGreaterThanOrEqual(8);
      for (const item of copy.page.faq) {
        expect(item.question.trim()).not.toBe("");
        expect(item.answer.trim()).not.toBe("");
        expect(item.answer).not.toMatch(/tens of thousands|4\.8|★/i);
      }
      expect(new Set(copy.page.faq.map((item) => item.question)).size).toBe(
        copy.page.faq.length,
      );
      expect(copy.page.proof).toHaveLength(3);
      expect(copy.page.sections.formula.rows).toHaveLength(3);
      expect(copy.page.sections.formula.rows.map((row) => row.result)).toEqual([
        "51.19",
        "57.14",
        "−5.95",
      ]);
      expect(copy.page.promo.steps).toHaveLength(3);
      expect(copy.page.promo.benefits).toHaveLength(3);
      expect(copy.page.promo.cta.button.length).toBeGreaterThan(1);
      expect(copy.page.promo.cta.trust.length).toBeGreaterThan(8);
      expect(copy.page.promo.collage.phoneAlt.length).toBeGreaterThan(8);
      expect(copy.page.promo.collage.webAlt.length).toBeGreaterThan(8);
      expect(
        `${copy.page.promo.collage.phoneAlt} ${copy.page.promo.collage.webAlt} ${copy.page.promo.cta.trust}`,
      ).not.toMatch(/★|reviews|4\.8/i);
      expect(copy.page.scorecard.print.length).toBeGreaterThan(0);
      expect(copy.page.scorecard.copyLink.length).toBeGreaterThan(0);
      expect(copy.page.links.tss.length).toBeGreaterThan(4);
      expect(copy.page.links.chart.length).toBeGreaterThan(4);
      expect(copy.page.links.blog.length).toBeGreaterThan(4);
      expect(copy.page.howTo.steps.start.title.length).toBeGreaterThan(2);
      expect(copy.client.interpretation.fatigue.label.length).toBeGreaterThan(1);
      expect(
        messages[lang].commonLinks.trainingLoadCalculatorAction.length,
      ).toBeGreaterThan(2);
      expect(copy.page.title.length).toBeGreaterThan(4);
      const faqText = copy.page.faq.map((item) => item.answer).join("\n");
      expect(faqText).toContain("51.19");
      expect(faqText).toContain("57.14");
      expect(faqText).toContain("58.57");
      expect(faqText).toContain("68.57");
      expect(faqText).toContain("−5.95");
      expect(faqText).toContain("−10.00");
    }
  });

  it("locks the English title, H1, description, and secondary phrase", () => {
    expect(en.trainingLoadCalculator.metadata.title).toBe(LOCKED_TITLE);
    expect(en.trainingLoadCalculator.page.title).toBe("Training Load Calculator");
    expect(en.trainingLoadCalculator.page.title).not.toMatch(/^Free\b/);
    expect(en.trainingLoadCalculator.metadata.description).toBe(LOCKED_DESCRIPTION);
    expect(en.trainingLoadCalculator.metadata.openGraph.title).toBe(LOCKED_TITLE);
    expect(en.trainingLoadCalculator.metadata.openGraph.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.trainingLoadCalculator.metadata.title).not.toMatch(/PMC/);
    expect(en.trainingLoadCalculator.metadata.description).toMatch(/\bFree\b/);
    expect(en.trainingLoadCalculator.metadata.description).toMatch(/\bPMC\b/);
    expect(en.trainingLoadCalculator.metadata.keywords[0]).toBe(
      "training load calculator",
    );
    expect(en.trainingLoadCalculator.metadata.keywords).toContain(
      "CTL ATL TSB calculator",
    );
    expect(en.trainingLoadCalculator.metadata.keywords.join(" ")).not.toMatch(
      /pmc fitness chart|what are ctl, atl, and tsb/i,
    );
    const body = [
      en.trainingLoadCalculator.page.subtitle,
      en.trainingLoadCalculator.page.sections.formula.description,
      ...en.trainingLoadCalculator.page.faq.map(
        (item) => `${item.question}\n${item.answer}`,
      ),
    ].join("\n");
    expect(body).toMatch(/CTL ATL TSB calculator/);
    expect(body).not.toMatch(/What are CTL, ATL, and TSB\?/i);
    expect(en.trainingLoadCalculator.page.title).not.toMatch(
      /PMC fitness chart|what are CTL/i,
    );
  });

  it("locks locale H1s and keeps PMC out of the title lead", () => {
    expect(zh.trainingLoadCalculator.page.title).toBe("训练负荷计算器");
    expect(zh.trainingLoadCalculator.metadata.title).toBe(
      "训练负荷计算器｜CTL、ATL 与 TSB",
    );
    expect(ja.trainingLoadCalculator.page.title).toBe("トレーニング負荷計算機");
    expect(ja.trainingLoadCalculator.metadata.title).toContain(
      "トレーニング負荷計算機",
    );
    expect(zhHant.trainingLoadCalculator.page.title).toBe("訓練負荷計算機");
    expect(zhHant.trainingLoadCalculator.metadata.title).toContain("訓練負荷");
    for (const copy of [
      zh.trainingLoadCalculator,
      ja.trainingLoadCalculator,
      zhHant.trainingLoadCalculator,
    ]) {
      expect(copy.metadata.title.startsWith("PMC")).toBe(false);
      expect(copy.page.faq.map((item) => item.answer).join("\n")).toMatch(
        /51\.19/,
      );
    }
  });

  it("keeps the locked English description after snippet optimization", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].trainingLoadCalculator;
      const seo = optimizeSeoText({
        locale: lang,
        context: "calculator",
        title: copy.metadata.title,
        description: copy.metadata.description,
      });
      expect(seo.title).toBe(copy.metadata.title);
      expect(seo.description).toBe(copy.metadata.description);
      expect(seoDisplayUnits(seo.description)).toBeGreaterThanOrEqual(150);
      if (lang !== "en") {
        expect(seoDisplayUnits(seo.description)).toBeLessThanOrEqual(160);
      }
    }
    expect(seoDisplayUnits(LOCKED_DESCRIPTION)).toBeGreaterThanOrEqual(150);
  });

  it("does not collapse indexed-locale titles to the English string", () => {
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].trainingLoadCalculator.metadata.title,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });
});
