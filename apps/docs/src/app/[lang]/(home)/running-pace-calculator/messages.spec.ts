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

const LOCKED_TITLE = "Running Pace Calculator | Pace Charts in km & Miles";
const LOCKED_H1 = "Running Pace Calculator";
const LOCKED_DESCRIPTION =
  "Calculate running pace, time or distance in km or miles. Convert min/km to min/mile and get 5K, 10K, half marathon and marathon pace charts. Free, no sign-up.";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => keyPaths(item, `${prefix}.${index}`));
  }
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("running pace calculator messages", () => {
  it("keeps the same keys, non-empty copy, and FAQ shape in every indexed locale", () => {
    const englishKeys = keyPaths(en.runningPaceCalculator).sort();
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].runningPaceCalculator;
      expect(keyPaths(copy).sort()).toEqual(englishKeys);
      expect(copy.metadata.title.length).toBeGreaterThan(0);
      expect(copy.metadata.description.length).toBeGreaterThan(0);
      expect(copy.page.title.length).toBeGreaterThan(0);
      expect(copy.page.subtitle.length).toBeGreaterThan(0);
      expect(copy.page.proof).toHaveLength(3);
      expect(copy.page.proof.every((item) => item.length > 0)).toBe(true);
      expect(copy.page.faq.length).toBeGreaterThan(0);
      expect(new Set(copy.page.faq.map((item) => item.question)).size).toBe(
        copy.page.faq.length,
      );
      for (const item of copy.page.faq) {
        expect(item.question.length).toBeGreaterThan(0);
        expect(item.answer.length).toBeGreaterThan(0);
      }
      expect(copy.client.panel.title.length).toBeGreaterThan(0);
      expect(copy.client.scorecard.share.length).toBeGreaterThan(0);
      expect(copy.client.scorecard.print.length).toBeGreaterThan(0);
      expect(copy.client.example.action.length).toBeGreaterThan(0);
      expect(copy.page.education.definition.answer.length).toBeGreaterThan(0);
      expect(copy.client.comparison.note.length).toBeGreaterThan(0);
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

  it("locks the English title, H1, description, and proof line", () => {
    expect(en.runningPaceCalculator.metadata.title).toBe(LOCKED_TITLE);
    expect(en.runningPaceCalculator.page.title).toBe(LOCKED_H1);
    expect(en.runningPaceCalculator.metadata.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.runningPaceCalculator.metadata.openGraph.title).toBe(
      LOCKED_TITLE,
    );
    expect(en.runningPaceCalculator.metadata.openGraph.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.runningPaceCalculator.jsonLd.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.runningPaceCalculator.page.proof).toEqual([
      "No sign-up required",
      "Instant results",
      "Print or share",
    ]);
    expect(en.runningPaceCalculator.client.scorecard.title).toBe(
      "Your result",
    );
  });

  it("does not collapse indexed-locale titles to the English string", () => {
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].runningPaceCalculator.metadata.title,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
    const h1s = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].runningPaceCalculator.page.title,
    );
    expect(new Set(h1s).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });
});
