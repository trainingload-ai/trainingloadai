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

const LOCKED_TITLE = "Power Zone Calculator | Cycling FTP & Coggan Zones";
const LOCKED_DESCRIPTION =
  "Use this power zone calculator to turn FTP into Coggan cycling power zones in watts. Compare Friel and understand when to use FTP, critical power or TSS.";

describe("power zones calculator messages", () => {
  it("provides title, FAQ, scorecard, and promo for every indexed locale", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].powerZonesCalculator;
      expect(copy.metadata.title.length).toBeGreaterThan(0);
      expect(copy.metadata.description.length).toBeGreaterThan(0);
      expect(copy.metadata.keywords.length).toBeGreaterThan(0);
      expect(copy.page.faq.length).toBeGreaterThanOrEqual(8);
      for (const item of copy.page.faq) {
        expect(item.question.trim()).not.toBe("");
        expect(item.answer.trim()).not.toBe("");
        expect(item.answer).not.toMatch(/tens of thousands|4\.8|★/i);
      }
      expect(copy.page.proof).toHaveLength(3);
      expect(copy.page.proof.join(" ")).not.toMatch(/★|reviews|4\.8/i);
      expect(copy.page.sections.coggan.rows).toHaveLength(7);
      expect(copy.page.sections.definition.answer.length).toBeGreaterThan(0);
      expect(copy.page.sections.targets.rows).toHaveLength(7);
      expect(copy.page.sections.reference.cards.ftp.body.length).toBeGreaterThan(
        0,
      );
      expect(copy.page.sections.limits.items).toHaveLength(4);
      expect(copy.page.sections.coggan.exampleLabel.length).toBeGreaterThan(0);
      expect(copy.page.sections.models.cards.coggan.length).toBeGreaterThan(0);
      expect(copy.page.sections.models.cards.friel.length).toBeGreaterThan(0);
      expect(copy.page.sections.models.sourceLabel.length).toBeGreaterThan(0);
      expect(copy.page.promo.steps).toHaveLength(3);
      expect(copy.page.promo.benefits).toHaveLength(3);
      expect(copy.page.promo.collage.phoneAlt.length).toBeGreaterThan(0);
      expect(copy.page.promo.collage.webAlt.length).toBeGreaterThan(0);
      expect(
        `${copy.page.promo.collage.phoneAlt} ${copy.page.promo.collage.webAlt} ${copy.page.promo.cta.trust}`,
      ).not.toMatch(/★|reviews|4\.8/i);
      expect(copy.client.scorecard.print.length).toBeGreaterThan(0);
      expect(copy.client.scorecard.copyLink.length).toBeGreaterThan(0);
      expect(copy.client.scorecard.exampleAction.length).toBeGreaterThan(0);
      expect(copy.client.scorecard.exampleBadge.length).toBeGreaterThan(0);
      expect(copy.client.scorecard.guide.length).toBeGreaterThan(0);
      expect(copy.client.table.name.length).toBeGreaterThan(0);
      expect(copy.client.inputs.model.options.coggan.length).toBeGreaterThan(0);
      expect(new Set(copy.page.faq.map((item) => item.question)).size).toBe(
        copy.page.faq.length,
      );
      expect(copy.page.title.length).toBeGreaterThan(4);
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

  it("locks the English title, H1, description, and secondaries", () => {
    expect(en.powerZonesCalculator.metadata.title).toBe(LOCKED_TITLE);
    expect(en.powerZonesCalculator.metadata.openGraph.title).toBe(LOCKED_TITLE);
    expect(en.powerZonesCalculator.page.title).toBe(
      "Cycling Power Zone Calculator",
    );
    expect(en.powerZonesCalculator.metadata.description).toBe(LOCKED_DESCRIPTION);
    expect(en.powerZonesCalculator.metadata.openGraph.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.powerZonesCalculator.page.proof).toEqual([
      "No sign-up required",
      "Instant results",
      "Print or share",
    ]);
    expect(en.powerZonesCalculator.page.subtitle.length).toBeGreaterThan(0);
    expect(en.powerZonesCalculator.metadata.keywords.length).toBeGreaterThan(0);
  });

  it("locks locale head terms for the power zones calculator", () => {
    expect(zh.powerZonesCalculator.metadata.title).toContain("功率区间计算器");
    expect(zh.powerZonesCalculator.page.title).toBe("骑行功率区间计算器");
    expect(ja.powerZonesCalculator.metadata.title).toContain("パワーゾーン計算機");
    expect(ja.powerZonesCalculator.page.title).toBe(
      "サイクリングパワーゾーン計算機",
    );
    expect(zhHant.powerZonesCalculator.metadata.title).toContain(
      "功率區間計算器",
    );
    expect(zhHant.powerZonesCalculator.page.title).toBe(
      "騎行功率區間計算器",
    );
    for (const lang of ["zh", "ja", "zh-hant"] as const) {
      const copy = messages[lang].powerZonesCalculator;
      const seo = optimizeSeoText({
        locale: lang,
        context: "calculator",
        title: copy.metadata.title,
        description: copy.metadata.description,
      });
      expect(seoDisplayUnits(seo.title)).toBeGreaterThanOrEqual(50);
      expect(seoDisplayUnits(seo.title)).toBeLessThanOrEqual(60);
      expect(seoDisplayUnits(seo.description)).toBeGreaterThanOrEqual(150);
      expect(seoDisplayUnits(seo.description)).toBeLessThanOrEqual(160);
    }
  });

  it("does not collapse indexed-locale titles to the English string", () => {
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].powerZonesCalculator.metadata.title,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });
});
