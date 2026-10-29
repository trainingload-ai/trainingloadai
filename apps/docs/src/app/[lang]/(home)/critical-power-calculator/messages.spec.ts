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

const LOCKED_TITLE = "Critical Power Calculator | CP & W′ from 2–3 Efforts";
const LOCKED_DESCRIPTION =
  "Calculate critical power and W′ from 2–3 maximal efforts. Get CP, W′ in kJ, W/kg, model fit and 5-, 8- and 20-minute power predictions. Compare CP with FTP.";

describe("critical power calculator messages", () => {
  it("provides title, FAQ, methods, and promo for every indexed locale", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].criticalPowerCalculator;
      expect(copy.metadata.title.length).toBeGreaterThan(10);
      expect(copy.metadata.description.length).toBeGreaterThan(40);
      expect(copy.metadata.keywords.length).toBeGreaterThan(2);
      expect(copy.page.faq.length).toBeGreaterThanOrEqual(8);
      for (const item of copy.page.faq) {
        expect(item.question.trim()).not.toBe("");
        expect(item.answer.trim()).not.toBe("");
        expect(item.answer).not.toMatch(/tens of thousands|4\.8|★/i);
      }
      expect(copy.page.sections.methods.rows).toHaveLength(2);
      expect(copy.page.sections.methods.details).toHaveLength(3);
      expect(copy.page.proof).toHaveLength(3);
      expect(copy.page.promo.steps).toHaveLength(3);
      expect(copy.page.promo.benefits).toHaveLength(3);
      expect(copy.page.promo.collage.phoneAlt.length).toBeGreaterThan(8);
      expect(copy.page.promo.collage.webAlt.length).toBeGreaterThan(8);
      expect(
        `${copy.page.promo.collage.phoneAlt} ${copy.page.promo.collage.webAlt} ${copy.page.promo.cta.trust}`,
      ).not.toMatch(/★|reviews|4\.8/i);
      expect(copy.page.manual.unitsMetric.length).toBeGreaterThan(1);
      expect(copy.page.manual.unitsImperial.length).toBeGreaterThan(1);
      expect(copy.page.result.print.length).toBeGreaterThan(0);
      expect(copy.page.result.copyLink.length).toBeGreaterThan(0);
      expect(copy.page.links.ftp.length).toBeGreaterThan(4);
      expect(copy.page.links.powerZones.length).toBeGreaterThan(4);
      expect(new Set(copy.page.faq.map((item) => item.question)).size).toBe(
        copy.page.faq.length,
      );
      expect(copy.page.title.length).toBeGreaterThan(4);
      expect(copy.metadata.title).not.toMatch(/^Free\b/);
      expect(copy.metadata.title.toLowerCase()).not.toMatch(/^mmp|^pmax/);
    }
  });

  it("locks the English title, H1, and meta description", () => {
    expect(en.criticalPowerCalculator.metadata.title).toBe(LOCKED_TITLE);
    expect(en.criticalPowerCalculator.page.title).toBe(
      "Critical Power Calculator",
    );
    expect(en.criticalPowerCalculator.metadata.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.criticalPowerCalculator.metadata.openGraph.title).toBe(
      LOCKED_TITLE,
    );
    expect(en.criticalPowerCalculator.metadata.openGraph.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.criticalPowerCalculator.jsonLd.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.criticalPowerCalculator.metadata.title).not.toMatch(
      /\bMMP\b|\bPmax\b/,
    );
    expect(en.criticalPowerCalculator.metadata.keywords).toEqual(
      expect.arrayContaining([
        "critical power calculator",
        "cp calculator",
        "w prime calculator",
      ]),
    );
    const questions = en.criticalPowerCalculator.page.faq
      .map((item) => item.question)
      .join("\n");
    expect(questions).toMatch(/What is critical power\?/);
    expect(questions).toMatch(/What is W′\?/);
    expect(questions).toMatch(/How is CP different from FTP\?/);
    expect(questions).toMatch(/How long should the efforts be\?/);
    expect(questions).toMatch(/limits of this calculator/i);
    const answers = en.criticalPowerCalculator.page.faq
      .map((item) => item.answer)
      .join("\n");
    expect(answers).toMatch(/267 W/);
    expect(answers).toMatch(/24\.0 kJ/);
    expect(answers).toMatch(/400 W/);
    expect(answers).toMatch(/300 W/);
    expect(answers).toMatch(/3\.81 W\/kg/);
    expect(en.criticalPowerCalculator.page.sections.methods.example).toMatch(
      /266\.7 W/,
    );
    expect(
      en.criticalPowerCalculator.page.sections.methods.rows.map(
        (row) => row.method,
      ),
    ).toEqual(["Two records", "Three records"]);
  });

  it("locks locale head terms for the critical power calculator", () => {
    expect(zh.criticalPowerCalculator.metadata.title).toContain(
      "临界功率计算器",
    );
    expect(zh.criticalPowerCalculator.page.title).toBe("临界功率计算器");
    expect(zh.criticalPowerCalculator.metadata.title).not.toMatch(/MMP|Pmax/);
    expect(ja.criticalPowerCalculator.metadata.title).toContain(
      "クリティカルパワー計算機",
    );
    expect(ja.criticalPowerCalculator.page.title).toBe(
      "クリティカルパワー計算機",
    );
    expect(ja.criticalPowerCalculator.metadata.title).not.toMatch(/MMP|Pmax/);
    expect(zhHant.criticalPowerCalculator.metadata.title).toContain(
      "臨界功率計算器",
    );
    expect(zhHant.criticalPowerCalculator.page.title).toBe(
      "臨界功率計算器",
    );
    expect(zhHant.criticalPowerCalculator.metadata.title).not.toMatch(
      /MMP|Pmax/,
    );
  });

  it("keeps indexed-locale metadata inside snippet guidance", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].criticalPowerCalculator;
      const seo = optimizeSeoText({
        locale: lang,
        context: "calculator",
        title: copy.metadata.title,
        description: copy.metadata.description,
      });
      expect(seoDisplayUnits(seo.title)).toBeGreaterThanOrEqual(50);
      expect(seoDisplayUnits(seo.title)).toBeLessThanOrEqual(60);
      expect(seoDisplayUnits(seo.description)).toBeGreaterThanOrEqual(150);
      if (lang === "en") {
        expect(seo.description).toBe(LOCKED_DESCRIPTION);
      } else {
        expect(seoDisplayUnits(seo.description)).toBeLessThanOrEqual(160);
      }
    }
  });

  it("does not collapse indexed-locale titles to the English string", () => {
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].criticalPowerCalculator.metadata.title,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });
});
