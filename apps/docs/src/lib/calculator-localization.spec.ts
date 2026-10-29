import { describe, expect, it } from "vitest";
import de from "../../../../packages/messages/docs/de.json";
import en from "../../../../packages/messages/docs/en.json";
import es from "../../../../packages/messages/docs/es.json";
import fr from "../../../../packages/messages/docs/fr.json";
import itMessages from "../../../../packages/messages/docs/it.json";
import ja from "../../../../packages/messages/docs/ja.json";
import ko from "../../../../packages/messages/docs/ko.json";
import ptBr from "../../../../packages/messages/docs/pt-BR.json";
import zhHant from "../../../../packages/messages/docs/zh-hant.json";
import zh from "../../../../packages/messages/docs/zh.json";
import { seoDisplayUnits } from "@/lib/seo-metadata";

const calculatorKeys = [
  "estimateCp",
  "criticalPowerCalculator",
  "lactateThresholdCalculator",
  "vdotCalculator",
] as const;

const localizedMessages = { ja, zh, "zh-hant": zhHant } as const;
const secondaryMessages = {
  de,
  es,
  fr,
  it: itMessages,
  ko,
  "pt-BR": ptBr,
} as const;

describe("calculator localization", () => {
  it("keeps localized titles and descriptions within snippet guidance", () => {
    for (const messages of Object.values(localizedMessages)) {
      for (const key of calculatorKeys) {
        const copy = messages[key];
        expect(seoDisplayUnits(copy.metadata.title)).toBeGreaterThanOrEqual(50);
        expect(seoDisplayUnits(copy.metadata.title)).toBeLessThanOrEqual(60);
        expect(seoDisplayUnits(copy.metadata.description)).toBeGreaterThanOrEqual(
          150,
        );
        expect(seoDisplayUnits(copy.metadata.description)).toBeLessThanOrEqual(
          160,
        );
      }
    }
  });

  it("uses the requested VO2max spelling throughout VDOT copy", () => {
    for (const messages of [
      en,
      de,
      es,
      fr,
      itMessages,
      ja,
      ko,
      ptBr,
      zh,
      zhHant,
    ]) {
      expect(JSON.stringify(messages.vdotCalculator)).not.toMatch(
        /VO₂max|VO2 Max|VO2 max/,
      );
    }
  });

  it("keeps secondary-locale FTP and CP summaries aligned with the new tools", () => {
    for (const messages of Object.values(secondaryMessages)) {
      const ftp = messages.estimateCp;
      const criticalPower = messages.criticalPowerCalculator;
      for (const key of calculatorKeys) {
        expect(messages[key].page.proof).toHaveLength(3);
      }
      expect(
        `${ftp.metadata.title} ${ftp.metadata.description} ${ftp.metadata.keywords.join(" ")} ${ftp.page.subtitle}`,
      ).not.toMatch(/Critical Power|Pmax|eFTP|MMP/);
      expect(
        `${criticalPower.metadata.title} ${criticalPower.metadata.description} ${criticalPower.metadata.keywords.join(" ")} ${criticalPower.page.subtitle}`,
      ).not.toMatch(/Pmax|eFTP|MMP/);
    }
  });

  it("avoids mainland wording in Traditional Chinese calculator copy", () => {
    const copy = JSON.stringify(calculatorKeys.map((key) => zhHant[key]));
    expect(copy).not.toMatch(
      /騎行|訓練里|個人設置|打印|支持|局限|鏈接|自定義|擴展名|重復|複盤|復盤|打開|示例|當前/,
    );
  });

  it("avoids literal Japanese translations found during copy review", () => {
    const copy = JSON.stringify(calculatorKeys.map((key) => ja[key]));
    expect(copy).not.toMatch(
      /ゾーンを開けます|どう動きますか|全力走|W\/kg、適合、ペース|等価タイムを見ます|等価レース|トレンドレビュー|例は4:22\/km|任意の GPX/,
    );
  });
});
