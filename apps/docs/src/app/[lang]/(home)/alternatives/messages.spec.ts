import { describe, expect, it } from "vitest";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { optimizeSeoText, seoDisplayUnits } from "@/lib/seo-metadata";
import de from "../../../../../../../packages/messages/docs/de.json";
import en from "../../../../../../../packages/messages/docs/en.json";
import es from "../../../../../../../packages/messages/docs/es.json";
import fr from "../../../../../../../packages/messages/docs/fr.json";
import itMessages from "../../../../../../../packages/messages/docs/it.json";
import ja from "../../../../../../../packages/messages/docs/ja.json";
import ko from "../../../../../../../packages/messages/docs/ko.json";
import ptBR from "../../../../../../../packages/messages/docs/pt-BR.json";
import zhHant from "../../../../../../../packages/messages/docs/zh-hant.json";
import zh from "../../../../../../../packages/messages/docs/zh.json";

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

const COMPETITOR_HREFS = [
  "/docs/guide/trainingpeaks-alternative-for-training-load",
  "/docs/guide/intervals-icu-alternative-for-training-load",
  "/docs/guide/runalyze-alternative-for-training-load",
  "/docs/guide/formbeat-alternative-for-training-load",
] as const;

describe("alternatives hub messages", () => {
  it("locks English metadata to training-load-app and named-alternative intent", () => {
    const copy = messages.en.alternatives;
    expect(copy.metaTitle.toLowerCase()).toContain("training load app");
    expect(copy.metaTitle).toContain("TrainingPeaks");
    expect(copy.h1.toLowerCase()).toBe("best training load app alternatives");
    expect(copy.metaDescription).toContain("TrainingPeaks");
    expect(copy.metaDescription).toContain("Intervals.icu");
    expect(copy.metaDescription).toContain("Runalyze");
    expect(copy.metaDescription).toContain("FormBeat");
    expect(copy.faq.map((item) => item.question).join(" ")).toMatch(
      /TrainingPeaks|Intervals\.icu|Runalyze/,
    );
  });

  it("keeps indexed-locale metadata inside snippet guidance", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].alternatives;
      const seo = optimizeSeoText({
        locale: lang,
        context: "product",
        title: copy.metaTitle,
        description: copy.metaDescription,
      });
      expect(seoDisplayUnits(seo.title)).toBeGreaterThanOrEqual(50);
      expect(seoDisplayUnits(seo.title)).toBeLessThanOrEqual(60);
      expect(seoDisplayUnits(seo.description)).toBeGreaterThanOrEqual(150);
      expect(seoDisplayUnits(seo.description)).toBeLessThanOrEqual(160);
    }
  });

  it("exposes four named competitor pages and product CTAs in every locale", () => {
    for (const lang of Object.keys(messages) as Array<keyof typeof messages>) {
      const copy = messages[lang].alternatives;
      expect(copy.competitors).toHaveLength(4);
      expect(copy.competitors.map((item) => item.href)).toEqual([
        ...COMPETITOR_HREFS,
      ]);
      expect(copy.productLinks.map((item) => item.href)).toEqual([
        "/training-load",
        "/ai-training-plan",
        "https://app.trainingload.ai/{lang}",
      ]);
      expect(copy.faq.length).toBeGreaterThanOrEqual(6);
      expect(messages[lang].footer.alternatives.length).toBeGreaterThan(4);
    }
  });

  it("does not collapse indexed-locale titles onto English", () => {
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].alternatives.h1,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });
});
