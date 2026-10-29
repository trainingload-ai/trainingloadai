import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { optimizeSeoText, seoDisplayUnits } from "@/lib/seo-metadata";
import {
  endurancePlanHubSlugs,
  normalizeEndurancePlanHub,
  type EndurancePlanHub,
} from "./endurance-plan-hubs";
import { RUN_PLAN_TEMPLATE_KEYS } from "@shared/plan-templates";

const PRIMARY = {
  "cycling-training-plan": {
    en: "cycling training plan",
    zh: "骑行训练计划",
    ja: "サイクリング トレーニングプラン",
    "zh-hant": "騎行訓練計畫",
  },
  "ironman-70-3-training-plan": {
    en: "IRONMAN 70.3 training plan",
    zh: "半程铁人训练计划",
    ja: "アイアンマン70.3 トレーニングプラン",
    "zh-hant": "半程鐵人",
  },
  "olympic-triathlon-training-plan": {
    en: "olympic triathlon training plan",
    zh: "奥运距离铁人三项训练计划",
    ja: "オリンピックディスタンス",
    "zh-hant": "奧運距離鐵人三項訓練計畫",
  },
  "swim-training-plan": {
    en: "swim training plan",
    zh: "游泳训练计划",
    ja: "スイム練習メニュー",
    "zh-hant": "游泳訓練計畫",
  },
} as const;

function messages(locale: string) {
  return JSON.parse(
    readFileSync(
      new URL(`../../../../packages/messages/docs/${locale}.json`, import.meta.url),
      "utf8",
    ),
  );
}

function hub(slug: (typeof endurancePlanHubSlugs)[number], locale: string) {
  return normalizeEndurancePlanHub(
    messages(locale).endurancePlanHubs.pages[slug] as EndurancePlanHub,
    slug,
  );
}

function blob(value: EndurancePlanHub) {
  return JSON.stringify(value);
}

describe("endurance plan hubs vs official templates", () => {
  it("does not invent official cycling, 70.3, olympic, or swim week×day templates", () => {
    expect(RUN_PLAN_TEMPLATE_KEYS.every((key) => key.startsWith("RUN_"))).toBe(
      true,
    );
    expect(RUN_PLAN_TEMPLATE_KEYS.join(" ")).not.toMatch(/BIKE|CYCLE|TRI|70|OLYMPIC|SWIM/);
  });

  it.each(endurancePlanHubSlugs)(
    "labels %s as a framework hub, not a template export",
    (slug) => {
      const copy = hub(slug, "en");
      expect(blob(copy).toLowerCase()).toMatch(/not an official|no official/);
      expect(blob(copy).toLowerCase()).toMatch(/framework/);
      expect(blob(copy).toLowerCase()).not.toMatch(
        /week 1 monday:|z2 3x12|sweet spot 2x20 @/,
      );
    },
  );
});

describe("cycling training plan keyword locks", () => {
  it("leads English with cycling training plan and keeps gran fondo / century as modifiers", () => {
    const copy = hub("cycling-training-plan", "en");
    expect(copy.metaTitle.toLowerCase()).toContain("cycling training plan");
    expect(copy.title.toLowerCase()).toContain("cycling training plan");
    expect(copy.keywords).toContain("cycling training plan");
    expect(blob(copy).toLowerCase()).toMatch(/gran fondo/);
    expect(blob(copy).toLowerCase()).toMatch(/century/);
    expect(copy.faq.map(([question]) => question).join(" ").toLowerCase()).toMatch(
      /official|template|gran fondo|century/,
    );
  });

  it("locks Simplified Chinese to 骑行训练计划", () => {
    const copy = hub("cycling-training-plan", "zh");
    expect(copy.metaTitle).toContain("骑行训练计划");
    expect(copy.title).toContain("骑行训练计划");
    expect(blob(copy)).not.toContain("培训计划");
  });

  it("locks Japanese to サイクリング トレーニングプラン with 練習メニュー in FAQ", () => {
    const copy = hub("cycling-training-plan", "ja");
    expect(copy.metaTitle).toContain("サイクリング トレーニングプラン");
    expect(copy.title).toContain("サイクリング トレーニングプラン");
    expect(blob(copy)).toContain("練習メニュー");
  });

  it("locks Traditional Chinese to 訓練計畫／課表", () => {
    const copy = hub("cycling-training-plan", "zh-hant");
    expect(copy.metaTitle).toMatch(/騎行訓練計畫/);
    expect(copy.title).toMatch(/課表|計畫/);
    expect(blob(copy)).toContain("課表");
    expect(blob(copy)).toContain("計劃");
  });
});

describe("IRONMAN 70.3 training plan keyword locks", () => {
  it("leads English with IRONMAN 70.3 / 70.3 training plan", () => {
    const copy = hub("ironman-70-3-training-plan", "en");
    expect(copy.metaTitle.toLowerCase()).toContain("ironman 70.3 training plan");
    expect(copy.title.toLowerCase()).toContain("ironman 70.3 training plan");
    expect(copy.keywords).toEqual(
      expect.arrayContaining([
        "IRONMAN 70.3 training plan",
        "70.3 training plan",
      ]),
    );
  });

  it("locks Simplified Chinese to 半程铁人训练计划 plus 113 / 70.3", () => {
    const copy = hub("ironman-70-3-training-plan", "zh");
    expect(copy.metaTitle).toContain("半程铁人训练计划");
    expect(blob(copy)).toContain("113");
    expect(blob(copy)).toContain("70.3");
  });

  it("locks Japanese to アイアンマン70.3 トレーニングプラン", () => {
    const copy = hub("ironman-70-3-training-plan", "ja");
    expect(copy.metaTitle).toContain("アイアンマン70.3 トレーニングプラン");
    expect(copy.title).toContain("アイアンマン70.3 トレーニングプラン");
  });

  it("locks Traditional Chinese to 半程鐵人／70.3 訓練計畫", () => {
    const copy = hub("ironman-70-3-training-plan", "zh-hant");
    expect(copy.metaTitle).toMatch(/半程鐵人/);
    expect(copy.metaTitle).toContain("70.3");
    expect(copy.metaTitle).toMatch(/訓練計畫/);
  });
});

describe("olympic triathlon training plan keyword locks", () => {
  it("leads English with olympic triathlon training plan", () => {
    const copy = hub("olympic-triathlon-training-plan", "en");
    expect(copy.metaTitle.toLowerCase()).toContain(
      "olympic triathlon training plan",
    );
    expect(copy.title.toLowerCase()).toContain("olympic");
    expect(copy.keywords).toEqual(
      expect.arrayContaining([
        "olympic triathlon training plan",
        "olympic distance triathlon training plan",
      ]),
    );
  });

  it("locks Simplified Chinese to 奥运距离铁人三项训练计划", () => {
    const copy = hub("olympic-triathlon-training-plan", "zh");
    expect(copy.metaTitle).toContain("奥运距离铁人三项训练计划");
    expect(copy.title).toContain("奥运距离");
  });

  it("locks Japanese to オリンピックディスタンス", () => {
    const copy = hub("olympic-triathlon-training-plan", "ja");
    expect(copy.metaTitle).toContain("オリンピックディスタンス");
    expect(blob(copy)).toContain("トレーニングプラン");
  });

  it("locks Traditional Chinese to 奧運距離鐵人三項訓練計畫", () => {
    const copy = hub("olympic-triathlon-training-plan", "zh-hant");
    expect(copy.metaTitle).toContain("奧運距離鐵人三項訓練計畫");
    expect(blob(copy)).toContain("課表");
  });
});

describe("swim training plan keyword locks", () => {
  it("leads English with swim training plan / swimming training plan", () => {
    const copy = hub("swim-training-plan", "en");
    expect(copy.metaTitle.toLowerCase()).toContain("swim training plan");
    expect(copy.title.toLowerCase()).toContain("swim training plan");
    expect(copy.keywords).toEqual(
      expect.arrayContaining([
        "swim training plan",
        "swimming training plan",
      ]),
    );
    expect(blob(copy).toLowerCase()).toMatch(/css/);
    expect(blob(copy).toLowerCase()).toMatch(/aerobic/);
  });

  it("locks Simplified Chinese to 游泳训练计划", () => {
    const copy = hub("swim-training-plan", "zh");
    expect(copy.metaTitle).toContain("游泳训练计划");
    expect(copy.title).toContain("游泳训练计划");
    expect(blob(copy)).not.toContain("培训计划");
  });

  it("locks Japanese to スイム練習メニュー", () => {
    const copy = hub("swim-training-plan", "ja");
    expect(copy.metaTitle).toContain("スイム練習メニュー");
    expect(copy.title).toContain("スイム練習メニュー");
    expect(blob(copy)).toContain("トレーニングプラン");
  });

  it("locks Traditional Chinese to 訓練計畫／課表", () => {
    const copy = hub("swim-training-plan", "zh-hant");
    expect(copy.metaTitle).toMatch(/游泳訓練計畫|游泳課表/);
    expect(copy.title).toMatch(/課表|計畫/);
    expect(blob(copy)).toContain("課表");
    expect(blob(copy)).toContain("計劃");
  });
});

describe("endurance plan hub SEO contract", () => {
  it.each(SEO_INDEXED_LANGUAGES)(
    "keeps %s metadata in snippet range after optimizeSeoText",
    (locale) => {
      for (const slug of endurancePlanHubSlugs) {
        const copy = hub(slug, locale);
        const seo = optimizeSeoText({
          locale,
          context: "product",
          title: copy.metaTitle,
          description: copy.metaDescription,
        });
        expect(seo.title.toLowerCase()).toContain(
          PRIMARY[slug][locale].toLowerCase(),
        );
        expect(seoDisplayUnits(seo.title)).toBeLessThanOrEqual(70);
        expect(seoDisplayUnits(seo.description)).toBeGreaterThanOrEqual(150);
        expect(seoDisplayUnits(seo.description)).toBeLessThanOrEqual(160);
        expect(copy.howToSteps).toHaveLength(4);
        expect(copy.faq.length).toBeGreaterThanOrEqual(7);
      }
    },
  );

  it("cross-links cycling coach, workout editor, load calculators, and olympic hub", () => {
    for (const locale of SEO_INDEXED_LANGUAGES) {
      const cycling = hub("cycling-training-plan", locale);
      const seventy = hub("ironman-70-3-training-plan", locale);
      const olympic = hub("olympic-triathlon-training-plan", locale);
      const cyclingHrefs = cycling.relatedLinks.map((link) => link[1]);
      const seventyHrefs = seventy.relatedLinks.map((link) => link[1]);
      const olympicHrefs = olympic.relatedLinks.map((link) => link[1]);
      expect(cyclingHrefs).toEqual(
        expect.arrayContaining([
          "/ai-coach/cycling-coach",
          "/workout-editor",
          "/tss-calculator",
          "/training-load-calculator",
          "/ftp-calculator",
          "/ironman-70-3-training-plan",
        ]),
      );
      expect(seventyHrefs).toEqual(
        expect.arrayContaining([
          "/cycling-training-plan",
          "/ai-coach/cycling-coach",
          "/half-marathon-training-plan",
          "/workout-editor",
          "/tss-calculator",
          "/training-load-calculator",
          "/ftp-calculator",
        ]),
      );
      expect(olympicHrefs).toEqual(
        expect.arrayContaining([
          "/ironman-70-3-training-plan",
          "/brick-workout",
          "/ftp-calculator",
          "/workout-editor",
          "/tss-calculator",
          "/training-load-calculator",
        ]),
      );
      expect(blob(olympic).toLowerCase()).toMatch(/css|critical swim/);
      const swim = hub("swim-training-plan", locale);
      const swimHrefs = swim.relatedLinks.map((link) => link[1]);
      expect(swimHrefs).toEqual(
        expect.arrayContaining([
          "/css-calculator",
          "/ai-training-plan",
          "/workout-editor",
          "/tss-calculator",
          "/training-load-calculator",
        ]),
      );
    }
  });

  it("renders FAQ schema from the hub page component", () => {
    const cyclingPage = readFileSync(
      new URL(
        "../app/[lang]/(home)/cycling-training-plan/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const seventyPage = readFileSync(
      new URL(
        "../app/[lang]/(home)/ironman-70-3-training-plan/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const olympicPage = readFileSync(
      new URL(
        "../app/[lang]/(home)/olympic-triathlon-training-plan/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const component = readFileSync(
      new URL("../components/EndurancePlanHubPage.tsx", import.meta.url),
      "utf8",
    );
    expect(cyclingPage).toContain("EndurancePlanHubPage");
    expect(seventyPage).toContain("EndurancePlanHubPage");
    const swimPage = readFileSync(
      new URL(
        "../app/[lang]/(home)/swim-training-plan/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    expect(olympicPage).toContain("EndurancePlanHubPage");
    expect(swimPage).toContain("EndurancePlanHubPage");
    expect(component).toContain('"@type": "FAQPage"');
    expect(component).toContain("howToSchema");
    expect(component).toContain('id="honesty"');
    expect(component).not.toContain("getRunningPlanSchedule");
  });
});
