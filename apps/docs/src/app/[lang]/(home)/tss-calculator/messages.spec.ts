import { describe, expect, it } from "vitest";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
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

describe("TSS calculator messages", () => {
  it("provides title, FAQ, and keywords for every indexed locale", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].tssCalculator;
      expect(copy.metadata.title.length).toBeGreaterThan(10);
      expect(copy.metadata.description.length).toBeGreaterThan(40);
      expect(copy.metadata.keywords.length).toBeGreaterThan(2);
      expect(copy.page.faq.length).toBeGreaterThanOrEqual(5);
      expect(new Set(copy.page.faq.map((item) => item.question)).size).toBe(
        copy.page.faq.length,
      );
      expect(copy.page.howTo.steps.inputs.title.length).toBeGreaterThan(2);
      expect(copy.page.sections.examples.rows).toHaveLength(5);
      expect(copy.page.sections.methods.rows).toHaveLength(4);
      expect(copy.page.sections.methods.rows.map((row) => row.method)).toEqual(
        expect.arrayContaining(["rTSS", "sTSS", "hrTSS"]),
      );
      expect(copy.page.sections.use.cards).toHaveLength(3);
      expect(copy.page.sections.use.sources).toHaveLength(2);
      expect(copy.client.panel.calculate.length).toBeGreaterThan(2);
      expect(copy.client.inputs.invalid.length).toBeGreaterThan(8);
      expect(
        copy.client.inputs.powerKind.options.normalized.length,
      ).toBeGreaterThan(1);
      expect(
        messages[lang].commonLinks.tssCalculatorAction.length,
      ).toBeGreaterThan(2);
    }
  });

  it("locks the English TSS calculator title and head terms", () => {
    expect(en.tssCalculator.metadata.title).toBe(
      "TSS Calculator | Training Stress Score & IF",
    );
    expect(en.tssCalculator.metadata.keywords).toEqual(
      expect.arrayContaining([
        "TSS calculator",
        "Training Stress Score calculator",
        "how to calculate TSS",
      ]),
    );
    expect(en.tssCalculator.page.title).toContain("Training Stress Score");
    expect(en.tssCalculator.page.title).toContain("TSS");
  });

  it("locks locale head terms for TSS calculator", () => {
    expect(zh.tssCalculator.metadata.title).toContain("TSS 计算器");
    expect(zh.tssCalculator.metadata.keywords).toEqual(
      expect.arrayContaining(["TSS 计算器", "训练压力得分计算器"]),
    );
    expect(ja.tssCalculator.metadata.title).toContain("TSS計算");
    expect(zhHant.tssCalculator.metadata.title).toContain("TSS 計算");
    expect(zhHant.tssCalculator.metadata.keywords).toEqual(
      expect.arrayContaining(["TSS 計算器", "訓練壓力分數計算器"]),
    );
  });

  it("does not collapse indexed-locale titles to the English string", () => {
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].tssCalculator.metadata.title,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });
});
