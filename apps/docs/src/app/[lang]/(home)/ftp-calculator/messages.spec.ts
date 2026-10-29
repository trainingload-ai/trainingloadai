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

const LOCKED_DESCRIPTION =
  "Estimate cycling FTP from a 20-minute, ramp, 2×8 or 60-minute test—or a GPX, FIT or TCX ride. See FTP watts, W/kg and Coggan power zones. Free, no sign-up.";

describe("FTP calculator messages", () => {
  it("provides title, FAQ, protocols, and categories for every indexed locale", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].estimateCp;
      expect(copy.metadata.title.length).toBeGreaterThan(10);
      expect(copy.metadata.description.length).toBeGreaterThan(40);
      expect(copy.metadata.keywords.length).toBeGreaterThan(2);
      expect(copy.page.faq.length).toBeGreaterThanOrEqual(11);
      for (const item of copy.page.faq) {
        expect(item.question.trim()).not.toBe("");
        expect(item.answer.trim()).not.toBe("");
        expect(item.answer).not.toMatch(/tens of thousands/i);
      }
      expect(copy.page.sections.protocols.rows).toHaveLength(4);
      expect(copy.page.sections.protocols.details).toHaveLength(4);
      expect(copy.page.sections.levels.rows).toHaveLength(4);
      expect(copy.page.sections.levels.source).toContain("Trainingload.ai");
      expect(copy.page.sections.protocols.groups.curve.details).toHaveLength(3);
      expect(copy.page.sections.categories.sourceLink.trim()).not.toBe("");
      expect(
        copy.page.sections.categories.names.superior.length,
      ).toBeGreaterThan(1);
      expect(copy.page.sections.categories.title.trim()).not.toBe("");
      expect(copy.page.promo.steps).toHaveLength(3);
      expect(copy.page.promo.benefits).toHaveLength(3);
      expect(copy.page.promo.cta.button.length).toBeGreaterThan(1);
      expect(copy.page.promo.cta.trust.length).toBeGreaterThan(8);
      expect(copy.page.promo.collage.phoneAlt.length).toBeGreaterThan(8);
      expect(copy.page.promo.collage.webAlt.length).toBeGreaterThan(8);
      expect(
        `${copy.page.promo.collage.phoneAlt} ${copy.page.promo.collage.webAlt}`,
      ).not.toMatch(/★|reviews|4\.8|unlock my results/i);
      expect(copy.page.manual.tablist.length).toBeGreaterThan(2);
      expect(copy.page.manual.unitsMetric.length).toBeGreaterThan(1);
      expect(copy.page.manual.unitsImperial.length).toBeGreaterThan(1);
      expect(copy.page.manual.weightLabelLb.length).toBeGreaterThan(4);
      expect(copy.page.fields.weightLb.length).toBeGreaterThan(4);
      expect(copy.page.manual.invalidWeightLb.length).toBeGreaterThan(8);
      expect(copy.page.fileOption.tab.length).toBeGreaterThan(1);
      expect(copy.page.manual.protocols["20MIN"].length).toBeGreaterThan(4);
      expect(copy.page.manual.protocols.RAMP.length).toBeGreaterThan(4);
      expect(copy.page.manual.protocols["2X8"].length).toBeGreaterThan(4);
      expect(copy.page.manual.protocols["60MIN"].length).toBeGreaterThan(4);
      expect(copy.page.fieldResult.print.length).toBeGreaterThan(0);
      expect(copy.page.fieldResult.copyLink.length).toBeGreaterThan(0);
      expect(copy.page.links.powerZones.length).toBeGreaterThan(4);
      expect(copy.page.links.criticalPower.length).toBeGreaterThan(4);
      expect(copy.page.links.lactate.length).toBeGreaterThan(4);
      expect(new Set(copy.page.faq.map((item) => item.question)).size).toBe(
        copy.page.faq.length,
      );
      expect(copy.page.title.length).toBeGreaterThan(4);
      expect(copy.page.subtitle.trim()).not.toBe("");
      expect(copy.page.heroProduct.title.trim()).not.toBe("");
      expect(copy.page.heroProduct.body).toMatch(/iPhone/);
      expect(copy.page.heroProduct.body).toMatch(/Apple Watch/);
      expect(copy.page.proof).toHaveLength(3);
      expect(copy.page.proof.join(" ")).not.toMatch(
        /★|reviews|4\.8|unlock my results/i,
      );
      for (const detail of copy.page.sections.protocols.details) {
        expect(detail.formula.length).toBeGreaterThan(8);
        expect(detail.method.length).toBeGreaterThan(8);
        expect(detail.basis.length).toBeGreaterThan(8);
        expect(detail.limits.length).toBeGreaterThan(8);
      }
    }
  });

  it("locks the English title, H1, and meta description", () => {
    expect(en.estimateCp.metadata.title).toBe(
      "FTP Calculator | 20-Min, Ramp Test, W/kg & Zones",
    );
    expect(en.estimateCp.page.title).toBe("FTP Calculator");
    expect(en.estimateCp.page.title).not.toMatch(/^Free\b/);
    expect(en.estimateCp.page.title).not.toMatch(/^Cycling\b/);
    expect(en.estimateCp.metadata.description).toBe(LOCKED_DESCRIPTION);
    expect(en.estimateCp.metadata.openGraph.title).toBe(
      en.estimateCp.metadata.title,
    );
    expect(en.estimateCp.metadata.openGraph.description).toBe(
      LOCKED_DESCRIPTION,
    );
    expect(en.estimateCp.metadata.title).not.toMatch(/critical power/i);
    expect(en.estimateCp.page.title).not.toMatch(/critical power/i);
    expect(en.estimateCp.metadata.keywords).toEqual(
      expect.arrayContaining([
        "ftp calculator",
        "20 minute ftp test",
        "ramp ftp test",
      ]),
    );
    expect(en.estimateCp.metadata.keywords.join(" ")).not.toMatch(
      /critical power/i,
    );
    const questions = en.estimateCp.page.faq
      .map((item) => item.question)
      .join("\n");
    expect(questions).toMatch(/What is FTP/);
    expect(questions).toMatch(/What is a good FTP\?/);
    expect(questions).toMatch(/good power-to-weight/i);
    expect(questions).toMatch(/How do FTP power zones work\?/);
    expect(
      en.estimateCp.page.faq.map((item) => item.answer).join("\n"),
    ).toMatch(/76–90%/);
    expect(questions).toMatch(/typing a test and uploading a ride file/i);
    expect(questions).toMatch(/read the result card/i);
    expect(questions).toMatch(/open power zones/i);
    expect(questions).toMatch(/field-test protocol/i);
    expect(questions).toMatch(/running power in this cycling FTP calculator/i);
    expect(questions).toMatch(/indoor test/i);
    expect(questions).toMatch(/limitations/i);
    expect(
      en.estimateCp.page.sections.protocols.rows.map((row) => row.multiplier),
    ).toEqual(["×0.95", "×0.75", "×0.90", "= FTP"]);
    expect(
      en.estimateCp.page.sections.protocols.details.map((detail) => detail.id),
    ).toEqual(["20MIN", "RAMP", "2X8", "60MIN"]);
    expect(en.estimateCp.page.sections.categories.title).toBe(
      "FTP chart by cycling category (W/kg)",
    );
    expect(zh.estimateCp.page.sections.categories.title).toBe(
      "FTP 功体比参考表",
    );
    expect(
      en.estimateCp.page.sections.protocols.groups.curve.details.map(
        (detail) => detail.id,
      ),
    ).toEqual(["three_nine", "thirty_min", "ten_km"]);
    expect(en.estimateCp.page.promo.title).not.toMatch(/AI FTP Detection/i);
    expect(en.estimateCp.page.sections.categories.names).toEqual({
      untrained: "Untrained",
      fair: "Fair",
      good: "Good",
      excellent: "Excellent",
      superior: "Superior",
    });
  });

  it("locks locale H1s for the FTP calculator", () => {
    expect(zh.estimateCp.page.title).toBe("FTP 计算器");
    expect(zh.estimateCp.metadata.title).toContain("FTP 计算器");
    expect(ja.estimateCp.page.title).toBe("FTP計算機");
    expect(ja.estimateCp.metadata.title).toContain("FTP計算機");
    expect(zhHant.estimateCp.page.title).toBe("FTP 計算器");
    expect(zhHant.estimateCp.metadata.title).toContain("FTP 計算器");
  });

  it("does not collapse indexed-locale titles to the English string", () => {
    const titles = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].estimateCp.metadata.title,
    );
    expect(new Set(titles).size).toBe(SEO_INDEXED_LANGUAGES.length);
  });
});
