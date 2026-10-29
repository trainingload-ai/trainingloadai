import { describe, expect, it } from "vitest";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import en from "../../../../../../../packages/messages/docs/en.json";
import ja from "../../../../../../../packages/messages/docs/ja.json";
import zhHant from "../../../../../../../packages/messages/docs/zh-hant.json";
import zh from "../../../../../../../packages/messages/docs/zh.json";

const messages = { en, ja, zh, "zh-hant": zhHant } as const;

const LOCKED_TITLE = "VDOT Calculator | Jack Daniels Paces & Race Times";
const LOCKED_H1 = "VDOT Calculator";
const LOCKED_DESCRIPTION =
  "Calculate VDOT from a recent race. Get Jack Daniels E, M, T, I and R training paces and equivalent 5K, 10K, half-marathon and marathon times. Free, no sign-up.";

const PROOF = ["No sign-up required", "Instant results", "Print or share"] as const;

function faqKeys(copy: (typeof messages)[keyof typeof messages]) {
  return copy.vdotCalculator.page.faqItems.map((item) => item.question);
}

describe("VDOT calculator messages", () => {
  it("keeps the same structure in every indexed locale", () => {
    const english = messages.en.vdotCalculator;
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].vdotCalculator;
      expect(copy.metadata.title.length).toBeGreaterThan(0);
      expect(copy.metadata.description.length).toBeGreaterThan(0);
      expect(copy.page.title.length).toBeGreaterThan(0);
      expect(copy.page.proof).toHaveLength(PROOF.length);
      expect(copy.page.faqItems).toHaveLength(english.page.faqItems.length);
      expect(new Set(faqKeys(messages[lang])).size).toBe(copy.page.faqItems.length);
      for (const item of copy.page.faqItems) {
        expect(item.question.length).toBeGreaterThan(0);
        expect(item.answer.length).toBeGreaterThan(0);
      }
      expect(copy.page.method.rows).toHaveLength(english.page.method.rows.length);
      expect(copy.page.method.rows.map((row) => row.vdot)).toEqual(
        english.page.method.rows.map((row) => row.vdot),
      );
      expect(copy.page.promo.steps).toHaveLength(english.page.promo.steps.length);
      expect(copy.page.promo.benefits).toHaveLength(english.page.promo.benefits.length);
      expect(copy.page.heroProduct.imageAlt.length).toBeGreaterThan(0);
      expect(copy.page.promo.imageAlt.length).toBeGreaterThan(0);
      expect(copy.client.example.button.length).toBeGreaterThan(0);
      expect(copy.client.example.note.length).toBeGreaterThan(0);
      expect(copy.client.file.legend.length).toBeGreaterThan(0);
      expect(copy.client.scorecard.print.length).toBeGreaterThan(0);
      expect(copy.client.scorecard.share.length).toBeGreaterThan(0);
      expect(copy.client.scorecard).not.toHaveProperty("viewPlan");
      expect(copy.page.onThisPage.length).toBeGreaterThan(0);
      // Formulas stay verbatim; only the surrounding explanation is localized.
      expect(copy.page.method.formula).toContain("0.182258v");
      expect(copy.page.method.formula).toContain("0.2989558e^(−0.1932605t)");
      if (lang !== "en") {
        expect(copy.page.method.formula).not.toContain("where v is speed");
        expect(copy.page.method.formula).not.toContain("Pace ranges use");
      }
      expect(copy.client.scorecard.shareError.length).toBeGreaterThan(0);
      expect(copy.client.panel.inputTitle).toBe(copy.page.title);
      expect(copy.jsonLd.description.length).toBeGreaterThan(0);
      if (lang === "en") {
        expect(copy.jsonLd.description).toBe(copy.metadata.description);
      }
    }
  });

  it("locks the English title, H1, description, and proof line", () => {
    expect(en.vdotCalculator.metadata.title).toBe(LOCKED_TITLE);
    expect(en.vdotCalculator.page.title).toBe(LOCKED_H1);
    expect(en.vdotCalculator.metadata.description).toBe(LOCKED_DESCRIPTION);
    expect(en.vdotCalculator.metadata.openGraph.title).toBe(LOCKED_TITLE);
    expect(en.vdotCalculator.metadata.openGraph.description).toBe(LOCKED_DESCRIPTION);
    expect(en.vdotCalculator.jsonLd.description).toBe(LOCKED_DESCRIPTION);
    expect(en.vdotCalculator.page.proof).toEqual([...PROOF]);
  });

  it("keeps a distinct H1 in each indexed locale", () => {
    expect(zh.vdotCalculator.page.title).toBe("VDOT 计算器");
    expect(ja.vdotCalculator.page.title).toBe("VDOT計算機");
    expect(zhHant.vdotCalculator.page.title).toBe("VDOT 計算器");
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].vdotCalculator.metadata.title,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
    const headings = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].vdotCalculator.page.title,
    );
    expect(new Set(headings).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });
});
