import { describe, expect, it } from "vitest";
import {
  SEO_METADATA_LIMITS,
  optimizeSeoText,
  seoDisplayUnits,
  type SeoMetadataContext,
} from "./seo-metadata";

describe("SEO metadata length normalization", () => {
  it("uses rendered-width units for CJK text", () => {
    expect(seoDisplayUnits("训练 load")).toBe(9);
  });

  it.each([
    [
      "zh",
      "训练负荷",
      "理解训练负荷、TSS、IF 与 TRIMP，以及模型化负荷趋势如何支持基于证据的耐力计划复盘。",
    ],
    [
      "zh-hant",
      "狀態（TSB）",
      "了解 Trainingload.ai 如何根據體能與疲勞計算狀態。",
    ],
    [
      "ja",
      "Aerobic Decoupling",
      "有酸素持久力と疲労耐性を見るための指標です。",
    ],
    [
      "en",
      "Dashboard",
      "Use the Trainingload.ai dashboard to review training trends.",
    ],
  ])(
    "keeps optimized docs metadata within snippet guidance for %s",
    (locale, title, description) => {
      const result = optimizeSeoText({
        locale,
        context: "docs",
        title,
        description,
        optimizeShortTitle: true,
      });

      expect(result.title).toContain(title);
      expect(seoDisplayUnits(result.title)).toBeGreaterThanOrEqual(
        SEO_METADATA_LIMITS.title.min,
      );
      expect(seoDisplayUnits(result.title)).toBeLessThanOrEqual(
        SEO_METADATA_LIMITS.title.max,
      );
      expect(result.description).toContain(description);
      expect(seoDisplayUnits(result.description)).toBeGreaterThanOrEqual(
        SEO_METADATA_LIMITS.description.min,
      );
      expect(seoDisplayUnits(result.description)).toBeLessThanOrEqual(
        SEO_METADATA_LIMITS.description.max,
      );
    },
  );

  it.each([
    [
      "zh",
      "converter",
      "FIT 转 GPX",
      "免费的 FIT 转 GPX 工具，上传 FIT 后可在线转换并下载 GPX 文件。",
    ],
    [
      "ja",
      "calculator",
      "乳酸閾値計算機",
      "フィールドテストから心拍、パワー、ペースの乳酸閾値を推定します。",
    ],
    [
      "en",
      "calculator",
      "FTP Calculator",
      "Estimate FTP, Critical Power, and W' from GPX, FIT, or TCX activity files.",
    ],
    [
      "zh-hant",
      "plan",
      "10 公里訓練計畫",
      "官方免費 10 週 10 公里完賽計畫，每週三跑。",
    ],
  ] satisfies Array<[string, SeoMetadataContext, string, string]>)(
    "extends short %s %s descriptions without replacing their meaning",
    (locale, context, title, description) => {
      const result = optimizeSeoText({ locale, context, title, description });
      expect(result.title).toBe(title);
      expect(result.description.startsWith(description)).toBe(true);
      expect(seoDisplayUnits(result.description)).toBeGreaterThanOrEqual(
        SEO_METADATA_LIMITS.description.min,
      );
      expect(seoDisplayUnits(result.description)).toBeLessThanOrEqual(
        SEO_METADATA_LIMITS.description.max,
      );
    },
  );

  it("does not rewrite metadata for noindex locales", () => {
    const original = { title: "Kurzer Titel", description: "Kurz." };
    expect(
      optimizeSeoText({
        ...original,
        locale: "de",
        context: "docs",
        optimizeShortTitle: true,
      }),
    ).toEqual(original);
  });

  it("preserves an explicit SEO description when generic padding is disabled", () => {
    const description =
      "Learn how to connect training data, follow a plan, review completed activities, and use AI Coach to make evidence-based decisions.";

    expect(
      optimizeSeoText({
        title: "Trainingload.ai Docs",
        description,
        locale: "en",
        context: "docs",
        optimizeShortDescription: false,
      }).description,
    ).toBe(description);
  });
});
