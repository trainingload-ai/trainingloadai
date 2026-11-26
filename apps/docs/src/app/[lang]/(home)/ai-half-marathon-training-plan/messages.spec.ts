import { describe, expect, it } from "vitest";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { optimizeSeoText, seoDisplayUnits } from "@/lib/seo-metadata";
import de from "@trainingloadai/messages/docs/de.json";
import en from "@trainingloadai/messages/docs/en.json";
import es from "@trainingloadai/messages/docs/es.json";
import fr from "@trainingloadai/messages/docs/fr.json";
import itMessages from "@trainingloadai/messages/docs/it.json";
import ja from "@trainingloadai/messages/docs/ja.json";
import ko from "@trainingloadai/messages/docs/ko.json";
import ptBR from "@trainingloadai/messages/docs/pt-BR.json";
import zhHant from "@trainingloadai/messages/docs/zh-hant.json";
import zh from "@trainingloadai/messages/docs/zh.json";

const messages = {
  de,
  en,
  es,
  fr,
  it: itMessages,
  ja,
  ko,
  "pt-BR": ptBR,
  zh,
  "zh-hant": zhHant,
};

const PRIMARY_KEYWORDS = {
  en: "AI half marathon training plan",
  zh: "智能半马训练计划",
  ja: "AIハーフマラソントレーニング計画",
  "zh-hant": "AI 半馬訓練計畫",
} as const;

describe("AI half marathon training plan messages", () => {
  it("locks English metadata to the AI-prefixed half marathon query", () => {
    const copy = messages.en.aiHalfMarathonPlanPage;
    expect(copy.metadata.title).toContain("AI Half Marathon Training Plan");
    expect(copy.metadata.description.toLowerCase()).toContain(
      "ai half marathon training plan",
    );
    expect(copy.metadata.keywords).toContain("AI half marathon training plan");
    expect(copy.metadata.keywords).not.toContain("14 week half marathon");
    expect(copy.metadata.keywords).not.toContain(
      "beginner half marathon training plan",
    );
    expect(copy.faq.map(([question]) => question).join(" ")).toMatch(
      /14-week|AI marathon/i,
    );
  });

  it("keeps indexed-locale metadata inside snippet guidance", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].aiHalfMarathonPlanPage;
      const seo = optimizeSeoText({
        locale: lang,
        context: "product",
        title: copy.metadata.title,
        description: copy.metadata.description,
      });
      expect(seoDisplayUnits(seo.title)).toBeGreaterThanOrEqual(50);
      expect(seoDisplayUnits(seo.title)).toBeLessThanOrEqual(60);
      expect(seoDisplayUnits(seo.description)).toBeGreaterThanOrEqual(150);
      expect(seoDisplayUnits(seo.description)).toBeLessThanOrEqual(160);
      expect(copy.metadata.keywords).toContain(PRIMARY_KEYWORDS[lang]);
    }
  });

  it("exposes the page namespace and hub contrast in every locale", () => {
    for (const lang of Object.keys(messages) as Array<keyof typeof messages>) {
      const copy = messages[lang].aiHalfMarathonPlanPage;
      expect(copy.ui.docsAction.length).toBeGreaterThan(4);
      expect(copy.ui.siblingAction.length).toBeGreaterThan(4);
      expect(copy.steps).toHaveLength(4);
      expect(copy.checks).toHaveLength(4);
      expect(copy.faq.length).toBeGreaterThanOrEqual(5);
      expect(JSON.stringify(copy.faq)).toMatch(
        /14|半马|半馬|ハーフ|Halbmarathon|semi-marathon|media marat|meia|mezza|하프/i,
      );
    }
  });
});
