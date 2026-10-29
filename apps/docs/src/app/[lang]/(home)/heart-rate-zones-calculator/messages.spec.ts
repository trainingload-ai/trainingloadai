import { describe, expect, it } from "vitest";
import en from "../../../../../../../packages/messages/docs/en.json";
import ja from "../../../../../../../packages/messages/docs/ja.json";
import zhHant from "../../../../../../../packages/messages/docs/zh-hant.json";
import zh from "../../../../../../../packages/messages/docs/zh.json";

const messages = { en, zh, ja, "zh-hant": zhHant } as const;

const LOCKED_TITLE = "Heart Rate Zones Calculator | 5 & 7 Training Zones";
const LOCKED_DESCRIPTION =
  "Build complete, non-overlapping heart-rate zones from Karvonen HRR, max HR, or Friel LTHR. See every zone's bpm, purpose, feel, and training use.";

function walkStrings(value: unknown, path: string) {
  if (typeof value === "string") {
    expect(value.trim(), path).not.toBe("");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${path}.${index}`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      walkStrings(child, `${path}.${key}`);
    }
  }
}

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, shape((value as Record<string, unknown>)[key])]),
    );
  }
  return typeof value;
}

describe("heart-rate zones calculator messages", () => {
  it("keeps non-empty copy and the same key tree in the four indexed locales", () => {
    const expected = shape(en.heartRateZonesCalculator);
    for (const [lang, file] of Object.entries(messages)) {
      walkStrings(file.heartRateZonesCalculator, lang);
      expect(shape(file.heartRateZonesCalculator)).toEqual(expected);
      expect(file.heartRateZonesCalculator.page.proof).toHaveLength(3);
      expect(file.heartRateZonesCalculator.page.faq.length).toBeGreaterThan(0);
    }
  });

  it("locks the English title, H1, description, and proof", () => {
    const page = en.heartRateZonesCalculator;
    expect(page.metadata.title).toBe(LOCKED_TITLE);
    expect(page.page.title).toBe("Heart Rate Zones Calculator");
    expect(page.metadata.description).toBe(LOCKED_DESCRIPTION);
    expect(page.metadata.openGraph.title).toBe(LOCKED_TITLE);
    expect(page.metadata.openGraph.description).toBe(LOCKED_DESCRIPTION);
    expect(page.jsonLd.description).toBe(LOCKED_DESCRIPTION);
    expect(page.page.proof).toEqual([
      "No sign-up required",
      "Instant results",
      "Print or share",
    ]);
  });

  it("locks the other indexed H1s and proof lines", () => {
    expect(zh.heartRateZonesCalculator.page.title).toBe("心率区间计算器");
    expect(ja.heartRateZonesCalculator.page.title).toBe("心拍ゾーン計算機");
    expect(zhHant.heartRateZonesCalculator.page.title).toBe("心率區間計算器");
    expect(zh.heartRateZonesCalculator.page.proof).toEqual([
      "无需注册",
      "即时计算",
      "打印或分享",
    ]);
    expect(ja.heartRateZonesCalculator.page.proof).toEqual([
      "登録不要",
      "すぐに計算",
      "印刷・共有",
    ]);
    expect(zhHant.heartRateZonesCalculator.page.proof).toEqual([
      "無需註冊",
      "即時計算",
      "列印或分享",
    ]);
  });
});
