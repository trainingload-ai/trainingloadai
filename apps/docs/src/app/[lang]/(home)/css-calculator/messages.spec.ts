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

const LOCKED_TITLE = "CSS Calculator | Critical Swim Speed & Training Zones";
const LOCKED_DESCRIPTION =
  "Free critical swim speed calculator from two timed swims (200 & 400). Get CSS pace and swim training zones — meters or yards.";

const CANNIBALIZED = /\bFTP\b|critical power|lactate/i;

describe("CSS calculator messages", () => {
  it("provides title, FAQ, formula, zones, and promo for every indexed locale", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].cssCalculator;
      expect(copy.metadata.title.length).toBeGreaterThan(10);
      expect(copy.metadata.description.length).toBeGreaterThan(40);
      expect(copy.metadata.keywords.length).toBeGreaterThan(2);
      expect(copy.metadata.keywords).not.toContain("CSS");
      expect(copy.page.faq.length).toBeGreaterThanOrEqual(6);
      for (const item of copy.page.faq) {
        expect(item.question.trim()).not.toBe("");
        expect(item.answer.trim()).not.toBe("");
        expect(item.answer).not.toMatch(/tens of thousands|4\.8|★/i);
      }
      const answers = copy.page.faq.map((item) => item.answer).join("\n");
      expect(answers).toMatch(/1:40/);
      expect(answers).toMatch(/6:00/);
      expect(answers).toMatch(/2:40/);
      expect(answers).toMatch(/400/);
      expect(answers).toMatch(/200/);
      expect(copy.page.sections.method.rows).toHaveLength(2);
      expect(copy.page.sections.method.details).toHaveLength(3);
      expect(copy.page.sections.method.example).toMatch(/1:40/);
      expect(copy.page.sections.zones.example).toMatch(/1:48/);
      expect(copy.page.proof).toHaveLength(3);
      expect(copy.page.promo.steps).toHaveLength(3);
      expect(copy.page.promo.benefits).toHaveLength(3);
      expect(copy.page.promo.collage.phoneAlt.length).toBeGreaterThan(8);
      expect(copy.page.promo.collage.webAlt.length).toBeGreaterThan(8);
      expect(copy.page.promo.collage.caption.length).toBeGreaterThan(8);
      expect(
        `${copy.page.promo.collage.phoneAlt} ${copy.page.promo.cta.trust}`,
      ).not.toMatch(/★|reviews|4\.8/i);
      expect(copy.page.manual.meters.length).toBeGreaterThan(0);
      expect(copy.page.manual.yards.length).toBeGreaterThan(0);
      expect(copy.page.result.print.length).toBeGreaterThan(0);
      expect(copy.page.result.copyLink.length).toBeGreaterThan(0);
      expect(copy.page.links.swimPlan.length).toBeGreaterThan(2);
      expect(copy.page.zones.threshold.length).toBeGreaterThan(1);
      expect(new Set(copy.page.faq.map((item) => item.question)).size).toBe(
        copy.page.faq.length,
      );
      expect(copy.metadata.title).not.toMatch(/^Free\b|^免费|^免費|^無料/);
      expect(copy.metadata.title).not.toMatch(CANNIBALIZED);
      expect(copy.metadata.description).not.toMatch(CANNIBALIZED);
      expect(copy.metadata.keywords.join(" ")).not.toMatch(CANNIBALIZED);
    }
  });

  it("locks the English title, H1, and meta description", () => {
    expect(en.cssCalculator.metadata.title).toBe(LOCKED_TITLE);
    expect(en.cssCalculator.page.title).toBe("CSS Calculator");
    expect(en.cssCalculator.metadata.description).toBe(LOCKED_DESCRIPTION);
    expect(en.cssCalculator.metadata.openGraph.title).toBe(LOCKED_TITLE);
    expect(en.cssCalculator.metadata.openGraph.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.cssCalculator.metadata.keywords[0]).toBe(
      "critical swim speed calculator",
    );
    expect(en.cssCalculator.metadata.keywords).toEqual(
      expect.arrayContaining([
        "critical swim speed calculator",
        "CSS calculator",
      ]),
    );
    expect(en.cssCalculator.page.sections.method.example).toMatch(/1\.00 m\/s/);
    expect(en.cssCalculator.page.sections.zones.example).toMatch(/1:32–1:35/);
  });

  it("locks locale head terms for the critical swim speed calculator", () => {
    expect(zh.cssCalculator.metadata.title).toContain("临界泳速计算器");
    expect(zh.cssCalculator.page.title).toBe("临界泳速计算器");
    expect(zh.cssCalculator.metadata.keywords).toEqual(
      expect.arrayContaining(["临界泳速计算器", "临界游泳速度"]),
    );
    expect(ja.cssCalculator.metadata.title).toContain("臨界泳速");
    expect(ja.cssCalculator.page.title).toBe("臨界泳速計算機");
    expect(zhHant.cssCalculator.metadata.title).toContain("臨界泳速");
    expect(zhHant.cssCalculator.page.title).toBe("臨界泳速計算機");
  });

  it("keeps indexed-locale metadata inside snippet guidance", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].cssCalculator;
      const seo = optimizeSeoText({
        locale: lang,
        context: "calculator",
        title: copy.metadata.title,
        description: copy.metadata.description,
      });
      expect(seoDisplayUnits(seo.title)).toBeGreaterThanOrEqual(50);
      expect(seoDisplayUnits(seo.title)).toBeLessThanOrEqual(60);
      expect(seoDisplayUnits(seo.description)).toBeLessThanOrEqual(160);
      if (lang === "en") {
        expect(seo.title).toBe(LOCKED_TITLE);
        expect(seo.description).toBe(LOCKED_DESCRIPTION);
      } else {
        expect(seoDisplayUnits(seo.description)).toBeGreaterThanOrEqual(150);
      }
    }
  });

  it("does not collapse indexed-locale titles to the English string", () => {
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].cssCalculator.metadata.title,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });
});
